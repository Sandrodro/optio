export const RedisKeys = {
  segmentMembers: (segmentId: string) => `segment:members:${segmentId}`,
  segmentMembersTemp: (segmentId: string) =>
    `segment:members:${segmentId}:temp`,
  pendingRecomputes: () => 'segments:pending_recomputes',
  pendingRecomputeFirstScheduled: () =>
    'segments:pending_recomputes:first_scheduled',
} as const;
