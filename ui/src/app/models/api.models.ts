export interface SegmentListItem {
  id: string;
  name: string;
  type: 'dynamic' | 'static';
  rules?: unknown;
  member_count: number | null;
  last_evaluated_at: string | null;
}

export interface SegmentMembersPage {
  total: number;
  members: ClientDto[];
}

export interface DeltaHistoryItem {
  id: string;
  segment_id: string;
  added_client_ids: string[];
  removed_client_ids: string[];
  total_members_after: number;
  reason: 'manual' | 'event' | 'cascade';
  evaluated_at: string;
}

export interface ClientDto {
  id: string;
  name: string;
  country: string;
  last_transaction_at: string | null;
  total_transaction_count: number;
  total_purchases_60d: string;
}

export interface RecomputeResult {
  segmentId: string;
  added: string[];
  removed: string[];
  totalMembersAfter: number;
  reason: string;
}

export interface SegmentDeltaEvent {
  segment_id: string;
  added_client_ids: string[];
  removed_client_ids: string[];
  total_members_after: number;
  reason: 'manual' | 'event' | 'cascade';
  evaluated_at: string;
}

export interface FastForwardResult {
  affected_clients: number;
  shifted_transactions: number;
  chunk_count: number;
  days: number;
}

export interface BulkCreateResult {
  count: number;
}
