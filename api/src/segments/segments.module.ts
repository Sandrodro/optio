import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SegmentEntity } from './segment.entity';
import { DeltaHistoryEntity } from './delta-history.entity';
import { SegmentEvaluator } from './segment-evaluator.service';
import { SegmentsController } from './segments.controller';
import { SegmentRecomputeService } from './segment-recompute.service';
import { EvaluateAllCommand } from './evaluate-all.command';
import { MessagingModule } from '../messaging/messaging.module';
import { RecomputeSchedulerService } from './recompute-scheduler.service';
import { RecomputeTickService } from './recompute-tick.service';
import { SegmentRecomputeConsumer } from './segment-recompute.consumer';
import { CascadeConsumer } from './cascade.consumer';
import { SegmentsReadService } from './segments-read.service';
import { ClientEntity } from '../clients/client.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SegmentEntity, ClientEntity, DeltaHistoryEntity]),
    MessagingModule,
  ],
  providers: [
    SegmentEvaluator,
    SegmentRecomputeService,
    EvaluateAllCommand,
    RecomputeSchedulerService,
    RecomputeTickService,
    SegmentRecomputeConsumer,
    CascadeConsumer,
    SegmentsReadService,
  ],
  exports: [SegmentEvaluator, SegmentRecomputeService, EvaluateAllCommand],
  controllers: [SegmentsController],
})
export class SegmentsModule {}
