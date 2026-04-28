import { Controller, Param, Post } from '@nestjs/common';
import { SegmentEvaluator } from './segment-evaluator.service';
import { SegmentRecomputeService } from './segment-recompute.service';

@Controller('segments')
export class SegmentsController {
  constructor(
    private readonly evaluator: SegmentEvaluator,
    private readonly recompute: SegmentRecomputeService,
  ) {}

  @Post(':id/evaluate-dry')
  async evaluateDry(@Param('id') id: string) {
    const memberIds = await this.evaluator.evaluate(id);
    return { segmentId: id, memberCount: memberIds.length, memberIds };
  }

  @Post(':id/recompute')
  async recomputeSegment(@Param('id') id: string) {
    return this.recompute.recompute(id, 'manual');
  }
}
