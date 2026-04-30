import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { SegmentService } from '../../services/segment.service';
import { SegmentListItem, RecomputeResult } from '../../models/api.models';

@Component({
  selector: 'app-segment-list',
  imports: [DatePipe],
  templateUrl: './segment-list.component.html',
})
export class SegmentListComponent implements OnInit {
  private segmentSvc = inject(SegmentService);
  private router = inject(Router);

  segments = signal<SegmentListItem[]>([]);
  loading = signal(true);
  recomputingId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.segmentSvc.list().subscribe({
      next: segs => {
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
        this.segments.update(list =>
          list.map(s =>
            s.id === seg.id
              ? { ...s, member_count: r.totalMembersAfter, last_evaluated_at: new Date().toISOString() }
              : s
          )
        );
      },
      error: () => this.recomputingId.set(null),
    });
  }

  goToDetail(id: string): void {
    this.router.navigate(['/segments', id]);
  }
}
