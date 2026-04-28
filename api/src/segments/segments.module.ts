import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SegmentEntity } from './segment.entity';
import { DeltaHistoryEntity } from './delta-history.entity';
import { SegmentEvaluator } from './segment-evaluator.service';
import { SegmentsController } from './segments.controller';
import { SegmentRecomputeService } from './segment-recompute.service';
import { EvaluateAllCommand } from './evaluate-all.command';

@Module({
  imports: [TypeOrmModule.forFeature([SegmentEntity, DeltaHistoryEntity])],
  providers: [SegmentEvaluator, SegmentRecomputeService, EvaluateAllCommand],
  exports: [SegmentEvaluator, SegmentRecomputeService, EvaluateAllCommand],
  controllers: [SegmentsController],
})
export class SegmentsModule {}
