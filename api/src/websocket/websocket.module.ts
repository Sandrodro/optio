import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { SegmentsGateway } from './segments.gateway';

@Module({
  imports: [MessagingModule],
  providers: [SegmentsGateway],
})
export class WebsocketModule {}
