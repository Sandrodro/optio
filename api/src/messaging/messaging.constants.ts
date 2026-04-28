// Exchanges. Two of them, by lifecycle:
//   data.changes  — INPUT to the segment system (something happened in the world)
//   segment.events — OUTPUT from the segment system (a delta was computed)
export const EXCHANGES = {
  DATA_CHANGES: 'data.changes',
  SEGMENT_EVENTS: 'segment.events',
} as const;

export const DATA_CHANGE_KEYS = {
  TRANSACTION_CREATED: 'transaction.created',
  CLIENT_UPDATED: 'client.updated',
  BULK_IMPORTED: 'bulk.imported',
} as const;

export const SEGMENT_EVENT_KEYS = {
  DELTA_COMPUTED: 'segment.delta.computed',
} as const;

export const QUEUES = {
  SEGMENT_RECOMPUTE: 'segment.recompute.q',
  CASCADE: 'cascade.q',
  UI_PUSH: 'ui.push.q',
  AUDIT: 'audit.q',
} as const;
