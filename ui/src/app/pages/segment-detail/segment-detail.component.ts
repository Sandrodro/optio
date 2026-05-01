import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SegmentService } from '../../services/segment.service';
import { ClientService } from '../../services/client.service';
import { SocketService } from '../../services/socket.service';
import { ClientDto, DeltaHistoryItem, SegmentListItem, COUNTRIES } from '../../models/api.models';

@Component({
  selector: 'app-segment-detail',
  imports: [DatePipe, DecimalPipe, FormsModule],
  templateUrl: './segment-detail.component.html',
})
export class SegmentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private segmentSvc = inject(SegmentService);
  private clientSvc = inject(ClientService);
  private socketSvc = inject(SocketService);
  private destroyRef = inject(DestroyRef);

  segment = signal<SegmentListItem | null>(null);
  members = signal<ClientDto[]>([]);
  memberTotal = signal(0);
  history = signal<DeltaHistoryItem[]>([]);
  flashAdd = signal<Set<string>>(new Set());
  flashRemove = signal<Set<string>>(new Set());
  toast = signal<string | null>(null);
  recomputing = signal(false);
  loadingMore = signal(false);

  // Edit client modal
  editModalClient = signal<ClientDto | null>(null);
  editName = signal('');
  editCountry = signal('');
  editSaving = signal(false);

  // Add transaction modal
  txnModalClient = signal<ClientDto | null>(null);
  txnAmount = signal<number | null>(null);
  txnSaving = signal(false);

  readonly countries = COUNTRIES;
  private segmentId = '';

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('id')!;
      this.segmentId = id;
      this.loadAll(id);
      this.listenToSocket(id);
    });
  }

  private loadAll(id: string): void {
    this.members.set([]);
    this.history.set([]);
    this.segment.set(null);

    this.segmentSvc.list().subscribe(segs => {
      const found = segs.find(s => s.id === id) ?? null;
      this.segment.set(found);
      if (found?.member_count != null) this.memberTotal.set(found.member_count);
    });

    this.segmentSvc.getMembers(id, 50, 0).subscribe(page => {
      this.members.set(page.members);
      this.memberTotal.set(page.total);
    });

    this.segmentSvc.getHistory(id, 10).subscribe(h => this.history.set(h));
  }

  private listenToSocket(id: string): void {
    this.socketSvc.subscribeToSegment(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(delta => {
        this.memberTotal.set(delta.total_members_after);
        this.segment.update(s => s
          ? { ...s, member_count: delta.total_members_after, last_evaluated_at: delta.evaluated_at }
          : s);

        this.history.update(h => [{
          id: crypto.randomUUID(),
          segment_id: delta.segment_id,
          added_client_ids: delta.added_client_ids,
          removed_client_ids: delta.removed_client_ids,
          total_members_after: delta.total_members_after,
          reason: delta.reason,
          evaluated_at: delta.evaluated_at,
        }, ...h].slice(0, 20));

        if (delta.removed_client_ids.length > 0) {
          this.flashRemove.update(s => new Set([...s, ...delta.removed_client_ids]));
          setTimeout(() => {
            this.members.update(list => list.filter(c => !delta.removed_client_ids.includes(c.id)));
            this.flashRemove.update(s => {
              const next = new Set(s);
              delta.removed_client_ids.forEach(id => next.delete(id));
              return next;
            });
          }, 800);
        }

        if (delta.added_client_ids.length > 0) {
          this.clientSvc.getByIds(delta.added_client_ids).subscribe(res => {
            this.members.update(list => [...res.clients, ...list]);
            this.flashAdd.update(s => new Set([...s, ...res.clients.map(c => c.id)]));
            setTimeout(() => {
              this.flashAdd.update(s => {
                const next = new Set(s);
                res.clients.forEach(c => next.delete(c.id));
                return next;
              });
            }, 2000);
          });
        }
      });
  }

  loadMore(): void {
    if (this.loadingMore()) return;
    this.loadingMore.set(true);
    this.segmentSvc.getMembers(this.segmentId, 50, this.members().length).subscribe({
      next: page => { this.members.update(l => [...l, ...page.members]); this.loadingMore.set(false); },
      error: () => this.loadingMore.set(false),
    });
  }

  recompute(): void {
    if (this.recomputing()) return;
    this.recomputing.set(true);
    this.segmentSvc.recompute(this.segmentId).subscribe({
      next: () => this.recomputing.set(false),
      error: () => this.recomputing.set(false),
    });
  }

  // ── Edit modal ──────────────────────────────────────────────────────────────

  openEditModal(client: ClientDto): void {
    this.editModalClient.set(client);
    this.editName.set(client.name);
    this.editCountry.set(client.country);
  }

  closeEditModal(): void {
    this.editModalClient.set(null);
  }

  saveEdit(): void {
    const client = this.editModalClient();
    if (!client || this.editSaving()) return;
    const patch: { name?: string; country?: string } = {};
    if (this.editName() !== client.name) patch.name = this.editName();
    if (this.editCountry() !== client.country) patch.country = this.editCountry();
    if (Object.keys(patch).length === 0) { this.closeEditModal(); return; }

    this.editSaving.set(true);
    this.clientSvc.update(client.id, patch).subscribe({
      next: () => {
        this.members.update(list =>
          list.map(m => m.id === client.id ? { ...m, ...patch } : m)
        );
        this.editSaving.set(false);
        this.closeEditModal();
      },
      error: () => this.editSaving.set(false),
    });
  }

  // ── Delta drill-down modal ──────────────────────────────────────────────────

  selectedDelta = signal<DeltaHistoryItem | null>(null);
  deltaDetail = signal<{ added: ClientDto[]; removed: ClientDto[] } | null>(null);
  deltaDetailLoading = signal(false);

  openDelta(item: DeltaHistoryItem): void {
    this.selectedDelta.set(item);
    this.deltaDetail.set(null);
    const allIds = [...item.added_client_ids, ...item.removed_client_ids];
    if (allIds.length === 0) {
      this.deltaDetail.set({ added: [], removed: [] });
      return;
    }
    this.deltaDetailLoading.set(true);
    this.clientSvc.getByIds(allIds).subscribe({
      next: res => {
        const byId = new Map(res.clients.map(c => [c.id, c]));
        this.deltaDetail.set({
          added: item.added_client_ids.map(id => byId.get(id)).filter(Boolean) as ClientDto[],
          removed: item.removed_client_ids.map(id => byId.get(id)).filter(Boolean) as ClientDto[],
        });
        this.deltaDetailLoading.set(false);
      },
      error: () => this.deltaDetailLoading.set(false),
    });
  }

  closeDelta(): void {
    this.selectedDelta.set(null);
    this.deltaDetail.set(null);
  }

  // ── Transaction modal ───────────────────────────────────────────────────────

  openTxnModal(client: ClientDto): void {
    this.txnModalClient.set(client);
    this.txnAmount.set(null);
  }

  closeTxnModal(): void {
    this.txnModalClient.set(null);
  }

  saveTransaction(): void {
    const client = this.txnModalClient();
    const amount = this.txnAmount();
    if (!client || amount == null || amount <= 0 || this.txnSaving()) return;

    this.txnSaving.set(true);
    this.clientSvc.createTransaction(client.id, amount).subscribe({
      next: () => {
        this.txnSaving.set(false);
        this.closeTxnModal();
        this.showToast(`Transaction of ${amount} GEL added for ${client.name}`);
      },
      error: () => this.txnSaving.set(false),
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/segments']);
  }

  isFlashAdd(id: string): boolean { return this.flashAdd().has(id); }
  isFlashRemove(id: string): boolean { return this.flashRemove().has(id); }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 3500);
  }

  reasonClass(reason: string): string {
    const map: Record<string, string> = {
      manual: 'bg-amber-100 text-amber-700',
      event: 'bg-teal-100 text-teal-700',
      cascade: 'bg-purple-100 text-purple-700',
    };
    return map[reason] ?? 'bg-gray-100 text-gray-600';
  }
}
