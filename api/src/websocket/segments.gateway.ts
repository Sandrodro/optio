import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Server, Socket } from 'socket.io';
import {
  EXCHANGES,
  QUEUES,
  SEGMENT_EVENT_KEYS,
} from '../messaging/messaging.constants';
import type { SegmentDeltaComputedEvent } from '../messaging/messaging.events';

// Room name helper. Clients subscribe to `segment:<id>` rooms;
// we emit deltas only into the matching room. This means a client
// watching `recent-buyers` doesn't receive noise from `high-spenders`.
const segmentRoom = (segmentId: string) => `segment:${segmentId}`;

@WebSocketGateway({
  // CORS: open during development. Tighten for prod via env-driven origin list.
  cors: { origin: '*' },
})
export class SegmentsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly log = new Logger(SegmentsGateway.name);

  @WebSocketServer()
  private server: Server;

  handleConnection(client: Socket): void {
    this.log.debug(`client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.log.debug(`client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { segmentId: string },
  ): Promise<{ ok: true; segmentId: string }> {
    const room = segmentRoom(body.segmentId);
    await client.join(room);
    this.log.debug(`${client.id} joined ${room}`);
    return { ok: true, segmentId: body.segmentId };
  }

  @SubscribeMessage('unsubscribe')
  async onUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { segmentId: string },
  ): Promise<{ ok: true; segmentId: string }> {
    const room = segmentRoom(body.segmentId);
    await client.leave(room);
    this.log.debug(`${client.id} left ${room}`);
    return { ok: true, segmentId: body.segmentId };
  }

  @RabbitSubscribe({
    exchange: EXCHANGES.SEGMENT_EVENTS,
    routingKey: SEGMENT_EVENT_KEYS.DELTA_COMPUTED,
    queue: QUEUES.UI_PUSH,
    queueOptions: { durable: true },
  })
  onDelta(payload: SegmentDeltaComputedEvent): void {
    const room = segmentRoom(payload.segment_id);

    this.server.to(room).emit('segment.delta', payload);

    const sockets = this.server.sockets.adapter.rooms.get(room);
    const recipientCount = sockets?.size ?? 0;
    this.log.debug(
      `pushed delta for ${payload.segment_id} to ${recipientCount} client(s) ` +
        `(+${payload.added_client_ids.length} -${payload.removed_client_ids.length})`,
    );
  }
}
