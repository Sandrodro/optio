import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SegmentListItem, SegmentMembersPage, DeltaHistoryItem, RecomputeResult } from '../models/api.models';

const API = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class SegmentService {
  private http = inject(HttpClient);

  list(): Observable<SegmentListItem[]> {
    return this.http.get<SegmentListItem[]>(`${API}/segments`);
  }

  getMembers(id: string, limit = 50, offset = 0): Observable<SegmentMembersPage> {
    return this.http.get<SegmentMembersPage>(`${API}/segments/${id}/members`, {
      params: { limit, offset },
    });
  }

  getHistory(id: string, limit = 10): Observable<DeltaHistoryItem[]> {
    return this.http.get<DeltaHistoryItem[]>(`${API}/segments/${id}/history`, {
      params: { limit },
    });
  }

  recompute(id: string): Observable<RecomputeResult> {
    return this.http.post<RecomputeResult>(`${API}/segments/${id}/recompute`, {});
  }
}
