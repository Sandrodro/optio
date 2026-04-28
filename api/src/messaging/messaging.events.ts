export interface TransactionCreatedEvent {
  transaction_id: string;
  client_id: string;
  amount: number;
  occurred_at: string; // ISO timestamp
}

export interface ClientUpdatedEvent {
  client_id: string;
  // We don't enumerate which fields changed — the recompute is naive
}

export interface BulkImportedEvent {
  client_ids: string[];
  chunk_index: number;
  chunk_count: number;
}

export interface SegmentDeltaComputedEvent {
  segment_id: string;
  added_client_ids: string[];
  removed_client_ids: string[];
  total_members_after: number;
  reason: 'manual' | 'event' | 'cascade';
  evaluated_at: string;
}
