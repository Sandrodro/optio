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

    // Only schedule root segments (no segmentDependencies).
    // Cascade handles dependent segments after their parents recompute,
    // preventing dependent segments from being double-scheduled.
    const rootSegments = await this.segments
      .createQueryBuilder('s')
      .select('s.id')
      .where('s.type = :type', { type: 'dynamic' })
      .andWhere(
        "COALESCE(jsonb_array_length(s.rules -> 'segmentDependencies'), 0) = 0",
      )
      .getMany();

    const ids = rootSegments.map((s) => s.id);
    await this.scheduler.scheduleMany(ids, 'event');

    this.log.debug(
      `scheduled ${ids.length} root dynamic segment(s) after ${routingKey}`,
    );
  }
}
