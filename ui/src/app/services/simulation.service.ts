import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FastForwardResult, BulkCreateResult } from '../models/api.models';

const API = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class SimulationService {
  private http = inject(HttpClient);

  fastForward(days: number): Observable<FastForwardResult> {
    return this.http.post<FastForwardResult>(`${API}/simulate/fast-forward`, { days });
  }

  bulkClients(count: number): Observable<BulkCreateResult> {
    return this.http.post<BulkCreateResult>(`${API}/simulate/bulk-clients`, { count });
  }
}
