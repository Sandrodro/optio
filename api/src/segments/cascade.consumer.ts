import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Repository } from 'typeorm';
import { SegmentEntity } from './segment.entity';
import {
  EXCHANGES,
  QUEUES,
  SEGMENT_EVENT_KEYS,
} from '../messaging/messaging.constants';
import type { SegmentDeltaComputedEvent } from '../messaging/messaging.events';
import { RecomputeSchedulerService } from './recompute-scheduler.service';

@Injectable()
export class CascadeConsumer {
  private readonly log = new Logger(CascadeConsumer.name);

  constructor(
    @InjectRepository(SegmentEntity)
    private readonly segments: Repository<SegmentEntity>,
    private readonly scheduler: RecomputeSchedulerService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.SEGMENT_EVENTS,
    routingKey: SEGMENT_EVENT_KEYS.DELTA_COMPUTED,
    queue: QUEUES.CASCADE,
    queueOptions: { durable: true },
  })
  async onDelta(payload: SegmentDeltaComputedEvent): Promise<void> {
    const sourceId = payload.segment_id;

    const dependents = await this.segments
      .createQueryBuilder('s')
      .select(['s.id', 's.type'])
      .where("s.rules -> 'segmentDependencies' @> :dep::jsonb", {
        dep: JSON.stringify(sourceId),
      })
      .andWhere('s.type = :type', { type: 'dynamic' })
      .getMany();

    if (dependents.length === 0) {
      this.log.debug(`${sourceId} has no dependents; cascade ends here`);
      return;
    }

    const dependentIds = dependents
      .map((s) => s.id)
      .filter((id) => id !== sourceId);

    if (dependentIds.length === 0) return;

    this.log.log(
      `${sourceId} delta → cascading to ${dependentIds.length}: ${dependentIds.join(', ')}`,
    );

    await this.scheduler.scheduleMany(dependentIds);
  }
}
