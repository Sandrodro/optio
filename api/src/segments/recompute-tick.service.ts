import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RedisKeys } from '../redis/redis.keys';
import { SegmentRecomputeService } from './segment-recompute.service';
import { DeltaReason } from './delta-history.entity';

const TICK_INTERVAL_MS = 200;

// Atomically pops all due members from the ZSET and clears their first-scheduled
// hash entries so the next event after a drain starts a fresh max-age round.
const DRAIN_LUA = `
  local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
  if #due > 0 then
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
    for i, member in ipairs(due) do
      redis.call('HDEL', KEYS[2], member)
    end
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
        2,
        RedisKeys.pendingRecomputes(),
        RedisKeys.pendingRecomputeFirstScheduled(),
        now.toString(),
      )) as string[];

      if (due.length === 0) return;

      this.log.log(`draining ${due.length} due segment(s): ${due.join(', ')}`);

      for (const member of due) {
        const colonIdx = member.indexOf(':');
        let reason: DeltaReason;
        let segmentId: string;

        if (colonIdx === -1) {
          // Defensive fallback for any legacy plain-ID entries.
          this.log.warn(`malformed pending member (no reason prefix): ${member}`);
          reason = 'event';
          segmentId = member;
        } else {
          reason = member.slice(0, colonIdx) as DeltaReason;
          segmentId = member.slice(colonIdx + 1);
        }

        try {
          await this.recompute.recompute(segmentId, reason);
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
