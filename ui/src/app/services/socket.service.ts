import { Injectable, OnDestroy } from '@angular/core';
import { Observable, fromEvent } from 'rxjs';
import { filter } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { SegmentDeltaEvent } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket = io('http://localhost:3000', { transports: ['websocket'] });

  readonly allDeltas$: Observable<SegmentDeltaEvent> =
    fromEvent<SegmentDeltaEvent>(this.socket as any, 'segment.delta');

  joinSegments(ids: string[]): void {
    ids.forEach(id => this.socket.emit('subscribe', { segmentId: id }));
  }

  subscribeToSegment(segmentId: string): Observable<SegmentDeltaEvent> {
    this.socket.emit('subscribe', { segmentId });
    return this.allDeltas$.pipe(filter(e => e.segment_id === segmentId));
  }

  unsubscribeFromSegment(segmentId: string): void {
    this.socket.emit('unsubscribe', { segmentId });
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }
}
