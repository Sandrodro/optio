import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Repository } from 'typeorm';
import { SegmentEntity } from './segment.entity';
import { EXCHANGES, QUEUES } from '../messaging/messaging.constants';
import { RecomputeSchedulerService } from './recompute-scheduler.service';

@Injectable()
export class SegmentRecomputeConsumer {
  private readonly log = new Logger(SegmentRecomputeConsumer.name);

  constructor(
    @InjectRepository(SegmentEntity)
    private readonly segments: Repository<SegmentEntity>,
    private readonly scheduler: RecomputeSchedulerService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.DATA_CHANGES,
    // naive routing
    routingKey: '#',
    queue: QUEUES.SEGMENT_RECOMPUTE,
    queueOptions: { durable: true },
  })
  async onDataChange(payload: unknown, amqpMsg: any): Promise<void> {
    const routingKey = amqpMsg?.fields?.routingKey ?? 'unknown';
    this.log.debug(`received ${routingKey}: ${JSON.stringify(payload)}`);

    const dynamicSegments = await this.segments.find({
      where: { type: 'dynamic' },
      select: ['id'],
    });

    const ids = dynamicSegments.map((s) => s.id);
    await this.scheduler.scheduleMany(ids);

    this.log.debug(
      `scheduled ${ids.length} dynamic segment(s) after ${routingKey}`,
    );
  }
}
