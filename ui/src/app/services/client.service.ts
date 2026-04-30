import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ClientDto } from '../models/api.models';

const API = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private http = inject(HttpClient);

  getByIds(ids: string[]): Observable<{ total: number; clients: ClientDto[] }> {
    return this.http.get<{ total: number; clients: ClientDto[] }>(`${API}/clients`, {
      params: { ids: ids.join(',') },
    });
  }

  update(id: string, patch: { country?: string; name?: string }): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(`${API}/clients/${id}`, patch);
  }

  createTransaction(clientId: string, amount: number): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${API}/transactions`, {
      client_id: clientId,
      amount,
    });
  }
}
