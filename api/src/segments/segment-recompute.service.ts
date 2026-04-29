import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RedisKeys } from '../redis/redis.keys';
import { SegmentEvaluator } from './segment-evaluator.service';
import { DeltaHistoryEntity, DeltaReason } from './delta-history.entity';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  EXCHANGES,
  SEGMENT_EVENT_KEYS,
} from '../messaging/messaging.constants';
import { SegmentDeltaComputedEvent } from '../messaging/messaging.events';

export interface RecomputeResult {
  segmentId: string;
  added: string[];
  removed: string[];
  totalMembersAfter: number;
  reason: DeltaReason;
}

@Injectable()
export class SegmentRecomputeService {
  private readonly log = new Logger(SegmentRecomputeService.name);

  constructor(
    private readonly evaluator: SegmentEvaluator,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(DeltaHistoryEntity)
    private readonly deltaHistory: Repository<DeltaHistoryEntity>,
    private readonly amqp: AmqpConnection,
  ) {}

  async recompute(
    segmentId: string,
    recomputeReason: DeltaReason,
  ): Promise<RecomputeResult> {
    const memberIds = await this.evaluator.evaluate(segmentId);

    const canonicalKey = RedisKeys.segmentMembers(segmentId);
    const tempKey = RedisKeys.segmentMembersTemp(segmentId);

    await this.redis.del(tempKey);

    if (memberIds.length > 0) {
      const CHUNK = 5000;
      const pipeline = this.redis.pipeline();

      for (let i = 0; i < memberIds.length; i += CHUNK) {
        pipeline.sadd(tempKey, ...memberIds.slice(i, i + CHUNK));
      }
      await pipeline.exec();
    }
    const [added, removed] = await Promise.all([
      this.redis.sdiff(tempKey, canonicalKey),
      this.redis.sdiff(canonicalKey, tempKey),
    ]);

    if (memberIds.length === 0) {
      await this.redis.del(canonicalKey);
    } else {
      await this.redis.rename(tempKey, canonicalKey);
    }

    try {
      await this.deltaHistory.insert({
        segment_id: segmentId,
        added_client_ids: added,
        removed_client_ids: removed,
        total_members_after: memberIds.length,
        reason: recomputeReason,
      });
    } catch (e) {
      this.log.error(
        `failed to persist delta history for ${segmentId}: ${(e as Error).message}`,
      );
    }

    this.log.log(
      `recomputed ${segmentId} (${recomputeReason}): +${added.length} -${removed.length}, total=${memberIds.length}`,
    );
    const event: SegmentDeltaComputedEvent = {
      segment_id: segmentId,
      added_client_ids: added,
      removed_client_ids: removed,
      total_members_after: memberIds.length,
      reason: recomputeReason,
      evaluated_at: new Date().toISOString(),
    };

    try {
      await this.amqp.publish(
        EXCHANGES.SEGMENT_EVENTS,
        SEGMENT_EVENT_KEYS.DELTA_COMPUTED,
        event,
      );
    } catch (e) {
      this.log.error(
        `failed to publish delta event for ${segmentId}: ${(e as Error).message}`,
      );
    }
    return {
      segmentId,
      added,
      removed,
      totalMembersAfter: memberIds.length,
      reason: recomputeReason,
    };
  }
}
