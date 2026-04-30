import { Component, inject, OnInit, DestroyRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SimulationBarComponent } from './components/simulation-bar/simulation-bar.component';
import { SegmentService } from './services/segment.service';
import { SocketService } from './services/socket.service';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SimulationBarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private segmentSvc = inject(SegmentService);
  private socketSvc = inject(SocketService);
  protected toastSvc = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.segmentSvc.list().subscribe(segments => {
      const nameMap = new Map(segments.map(s => [s.id, s.name]));
      this.socketSvc.joinSegments(segments.map(s => s.id));

      this.socketSvc.allDeltas$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(delta => {
          this.toastSvc.show({
            message: nameMap.get(delta.segment_id) ?? delta.segment_id,
            added: delta.added_client_ids.length,
            removed: delta.removed_client_ids.length,
          });
        });
    });
  }
}
