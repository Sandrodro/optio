import { Injectable, OnDestroy } from '@angular/core';
import { Observable, fromEvent } from 'rxjs';
import { filter } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { SegmentDeltaEvent } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket = io('http://localhost:3000', { transports: ['websocket'] });

  subscribeToSegment(segmentId: string): Observable<SegmentDeltaEvent> {
    this.socket.emit('subscribe', { segmentId });
    return fromEvent<SegmentDeltaEvent>(this.socket as any, 'segment.delta').pipe(
      filter(e => e.segment_id === segmentId)
    );
  }

  unsubscribeFromSegment(segmentId: string): void {
    this.socket.emit('unsubscribe', { segmentId });
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }
}
