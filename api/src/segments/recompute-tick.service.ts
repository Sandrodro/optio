import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RedisKeys } from '../redis/redis.keys';
import { SegmentRecomputeService } from './segment-recompute.service';

const TICK_INTERVAL_MS = 200;

const DRAIN_LUA = `
  local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
  if #due > 0 then
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
  end
  return due
`;

@Injectable()
export class RecomputeTickService implements OnModuleInit {
  private readonly log = new Logger(RecomputeTickService.name);
  private running = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly recompute: SegmentRecomputeService,
  ) {}

  onModuleInit() {
    this.log.log(`tick loop starting (interval=${TICK_INTERVAL_MS}ms)`);
  }

  @Interval(TICK_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const now = Date.now();
      const due = (await this.redis.eval(
        DRAIN_LUA,
        1,
        RedisKeys.pendingRecomputes(),
        now.toString(),
      )) as string[];

      if (due.length === 0) return;

      this.log.log(`draining ${due.length} due segment(s): ${due.join(', ')}`);

      for (const segmentId of due) {
        try {
          await this.recompute.recompute(segmentId, 'event');
        } catch (e) {
          this.log.error(
            `recompute failed for ${segmentId}: ${(e as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
