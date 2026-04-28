import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SegmentEntity } from './segment.entity';
import { DeltaHistoryEntity } from './delta-history.entity';
import { SegmentEvaluator } from './segment-evaluator.service';
import { SegmentsController } from './segments.controller';
import { SegmentRecomputeService } from './segment-recompute.service';

@Module({
  imports: [TypeOrmModule.forFeature([SegmentEntity, DeltaHistoryEntity])],
  providers: [SegmentEvaluator, SegmentRecomputeService],
  exports: [SegmentEvaluator, SegmentRecomputeService],
  controllers: [SegmentsController],
})
export class SegmentsModule {}
