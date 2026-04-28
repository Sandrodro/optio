export const RedisKeys = {
  segmentMembers: (segmentId: string) => `segment:members:${segmentId}`,
  segmentMembersTemp: (segmentId: string) =>
    `segment:members:${segmentId}:temp`,
} as const;
