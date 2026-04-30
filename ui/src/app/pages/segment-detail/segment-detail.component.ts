import { Component, inject, signal, OnInit, OnDestroy, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SegmentService } from '../../services/segment.service';
import { ClientService } from '../../services/client.service';
import { SocketService } from '../../services/socket.service';
import { ClientDto, DeltaHistoryItem, SegmentListItem } from '../../models/api.models';

@Component({
  selector: 'app-segment-detail',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './segment-detail.component.html',
})
export class SegmentDetailComponent implements OnInit, OnDestroy {
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
  private segmentId = '';

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('id')!;
      if (this.segmentId && this.segmentId !== id) {
        this.socketSvc.unsubscribeFromSegment(this.segmentId);
      }
      this.segmentId = id;
      this.loadAll(id);
      this.listenToSocket(id);
    });
  }

  ngOnDestroy(): void {
    if (this.segmentId) {
      this.socketSvc.unsubscribeFromSegment(this.segmentId);
    }
  }

  private loadAll(id: string): void {
    this.members.set([]);
    this.history.set([]);
    this.segment.set(null);

    // Load segment metadata from the list endpoint
    this.segmentSvc.list().subscribe(segs => {
      const found = segs.find(s => s.id === id) ?? null;
      this.segment.set(found);
      if (found?.member_count != null) {
        this.memberTotal.set(found.member_count);
      }
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
        this.segment.update(s => s ? { ...s, member_count: delta.total_members_after, last_evaluated_at: delta.evaluated_at } : s);

        const newHistoryItem: DeltaHistoryItem = {
          id: crypto.randomUUID(),
          segment_id: delta.segment_id,
          added_client_ids: delta.added_client_ids,
          removed_client_ids: delta.removed_client_ids,
          total_members_after: delta.total_members_after,
          reason: delta.reason,
          evaluated_at: delta.evaluated_at,
        };
        this.history.update(h => [newHistoryItem, ...h].slice(0, 20));

        this.showToast(`+${delta.added_client_ids.length} / −${delta.removed_client_ids.length} members`);

        if (delta.removed_client_ids.length > 0) {
          this.flashRemove.update(s => new Set([...s, ...delta.removed_client_ids]));
          setTimeout(() => {
            this.members.update(list =>
              list.filter(c => !delta.removed_client_ids.includes(c.id))
            );
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
      next: page => {
        this.members.update(list => [...list, ...page.members]);
        this.loadingMore.set(false);
      },
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

  goBack(): void {
    this.router.navigate(['/segments']);
  }

  isFlashAdd(id: string): boolean {
    return this.flashAdd().has(id);
  }

  isFlashRemove(id: string): boolean {
    return this.flashRemove().has(id);
  }

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

  countryFlag(code: string): string {
    if (!code || code.length !== 2) return '';
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1e0 + c.charCodeAt(0) - 65));
  }
}
