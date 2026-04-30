import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SegmentService } from '../../services/segment.service';
import { SocketService } from '../../services/socket.service';
import { SegmentListItem, RecomputeResult } from '../../models/api.models';

@Component({
  selector: 'app-segment-list',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './segment-list.component.html',
})
export class SegmentListComponent implements OnInit {
  private segmentSvc = inject(SegmentService);
  private socketSvc = inject(SocketService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  segments = signal<SegmentListItem[]>([]);
  loading = signal(true);
  recomputingId = signal<string | null>(null);
  comeBackSent = signal(0);

  ngOnInit(): void {
    this.load();
    this.loadComeBackStats();

    this.socketSvc.allDeltas$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((delta) => {
      this.segments.update((list) =>
        list.map((s) =>
          s.id === delta.segment_id
            ? {
                ...s,
                member_count: delta.total_members_after,
                last_evaluated_at: delta.evaluated_at,
              }
            : s,
        ),
      );
      if (delta.segment_id === 'recent-buyers' && delta.removed_client_ids.length > 0) {
        this.comeBackSent.update(c => c + delta.removed_client_ids.length);
      }
    });
  }

  private loadComeBackStats(): void {
    this.segmentSvc.getComeBackStats().subscribe(s => this.comeBackSent.set(s.total_sent));
  }

  load(): void {
    this.loading.set(true);
    this.segmentSvc.list().subscribe({
      next: (segs) => {
        this.segments.set(segs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  recompute(event: Event, seg: SegmentListItem): void {
    event.stopPropagation();
    if (this.recomputingId()) return;
    this.recomputingId.set(seg.id);
    this.segmentSvc.recompute(seg.id).subscribe({
      next: (r: RecomputeResult) => {
        this.recomputingId.set(null);
        this.segments.update((list) =>
          list.map((s) =>
            s.id === seg.id
              ? {
                  ...s,
                  member_count: r.totalMembersAfter,
                  last_evaluated_at: new Date().toISOString(),
                }
              : s,
          ),
        );
      },
      error: () => this.recomputingId.set(null),
    });
  }

  goToDetail(id: string): void {
    this.router.navigate(['/segments', id]);
  }
}
