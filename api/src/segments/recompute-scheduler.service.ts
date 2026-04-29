import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RedisKeys } from '../redis/redis.keys';

const DEBOUNCE_WINDOW_MS = 500;

@Injectable()
export class RecomputeSchedulerService {
  private readonly log = new Logger(RecomputeSchedulerService.name);
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async schedule(segmentId: string): Promise<void> {
    const dueAt = Date.now() + DEBOUNCE_WINDOW_MS;
    await this.redis.zadd(RedisKeys.pendingRecomputes(), dueAt, segmentId);
    this.log.debug(
      `scheduled ${segmentId} for ${new Date(dueAt).toISOString()}`,
    );
  }

  async scheduleMany(segmentIds: string[]): Promise<void> {
    if (segmentIds.length === 0) return;

    const dueAt = Date.now() + DEBOUNCE_WINDOW_MS;
    const pipeline = this.redis.pipeline();
    for (const id of segmentIds) {
      pipeline.zadd(RedisKeys.pendingRecomputes(), dueAt, id);
    }
    await pipeline.exec();
    this.log.debug(`scheduled ${segmentIds.length} segments`);
  }
}
