import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGES } from './messaging.constants';

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      useFactory: () => ({
        exchanges: [
          { name: EXCHANGES.DATA_CHANGES, type: 'topic' },
          { name: EXCHANGES.SEGMENT_EVENTS, type: 'topic' },
        ],
        uri: process.env.RABBITMQ_URL,
        connectionInitOptions: { wait: true, timeout: 20_000 },
        enableControllerDiscovery: true,
      }),
    }),
  ],
  exports: [RabbitMQModule],
})
export class MessagingModule {}
