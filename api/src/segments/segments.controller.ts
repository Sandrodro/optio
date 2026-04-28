import { Controller, Param, Post } from '@nestjs/common';
import { SegmentEvaluator } from './segment-evaluator.service';

@Controller('segments')
export class SegmentsController {
  constructor(private readonly evaluator: SegmentEvaluator) {}

  @Post(':id/evaluate-dry')
  async evaluateDry(@Param('id') id: string) {
    const memberIds = await this.evaluator.evaluate(id);
    return { segmentId: id, memberCount: memberIds.length, memberIds };
  }
}
