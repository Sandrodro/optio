import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EXCHANGES,
  QUEUES,
  SEGMENT_EVENT_KEYS,
} from '../messaging/messaging.constants';
import type { SegmentDeltaComputedEvent } from '../messaging/messaging.events';
import { ComeBackCampaignSendEntity } from './come-back-campaign-send.entity';

const RECENT_BUYERS_SEGMENT_ID = 'recent-buyers';

@Injectable()
export class ComeBackCampaignConsumer {
  private readonly log = new Logger(ComeBackCampaignConsumer.name);

  constructor(
    @InjectRepository(ComeBackCampaignSendEntity)
    private readonly sends: Repository<ComeBackCampaignSendEntity>,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.SEGMENT_EVENTS,
    routingKey: SEGMENT_EVENT_KEYS.DELTA_COMPUTED,
    queue: QUEUES.COME_BACK_CAMPAIGN,
    queueOptions: { durable: true },
  })
  async onDelta(payload: SegmentDeltaComputedEvent): Promise<void> {
    if (payload.segment_id !== RECENT_BUYERS_SEGMENT_ID) return;
    if (payload.removed_client_ids.length === 0) return;

    const count = payload.removed_client_ids.length;
    await this.sends.save({ count });
    this.log.log(`sent come back message to ${count} customers`);
  }
}
