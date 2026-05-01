import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RedisKeys } from '../redis/redis.keys';
import { DeltaReason } from './delta-history.entity';

const DEBOUNCE_WINDOW_MS = 500;
// Segments cannot be delayed past this point even under sustained event load.
// Within the window, trailing-edge debounce coalesces bursts; past it, the
// next tick forces a drain regardless of continued event arrival.
const MAX_AGE_MS = 5000;

// ZSET members are encoded as `${reason}:${segmentId}` so the tick loop
// knows why each recompute was scheduled. Root segments (no dependencies)
// are scheduled with 'event'; dependent segments are scheduled with 'cascade'.
// The two paths are disjoint, so a segment ID never appears under two reasons
// in the same window, and ZADD's dedup-by-member behavior is preserved.
export const encodePendingMember = (
  reason: DeltaReason,
  segmentId: string,
): string => `${reason}:${segmentId}`;

// For each member:
//   1. HSETNX records first-scheduled time (no-op if already set for this round).
//   2. Read firstAt back (always present after HSETNX).
//   3. Compute dueAt = min(now + DEBOUNCE_WINDOW, firstAt + MAX_AGE).
//   4. ZADD with that score — debounce extends within the window,
//      but the score is capped so the entry becomes due by MAX_AGE at the latest.
const SCHEDULE_LUA = `
local now = tonumber(ARGV[1])
local debounceWindow = tonumber(ARGV[2])
local maxAge = tonumber(ARGV[3])
for i = 4, #ARGV do
  local member = ARGV[i]
  redis.call('HSETNX', KEYS[2], member, now)
  local firstAt = tonumber(redis.call('HGET', KEYS[2], member))
  local debounceDueAt = now + debounceWindow
  local maxAgeDueAt = firstAt + maxAge
  local dueAt = debounceDueAt < maxAgeDueAt and debounceDueAt or maxAgeDueAt
  redis.call('ZADD', KEYS[1], dueAt, member)
end
return #ARGV - 3
`;

@Injectable()
export class RecomputeSchedulerService {
  private readonly log = new Logger(RecomputeSchedulerService.name);
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async scheduleMany(
    segmentIds: string[],
    reason: DeltaReason,
  ): Promise<void> {
    if (segmentIds.length === 0) return;

    const members = segmentIds.map((id) => encodePendingMember(reason, id));
    const now = Date.now();

    await this.redis.eval(
      SCHEDULE_LUA,
      2,
      RedisKeys.pendingRecomputes(),
      RedisKeys.pendingRecomputeFirstScheduled(),
      now.toString(),
      DEBOUNCE_WINDOW_MS.toString(),
      MAX_AGE_MS.toString(),
      ...members,
    );

    this.log.debug(`scheduled ${segmentIds.length} segments (${reason})`);
  }
}
