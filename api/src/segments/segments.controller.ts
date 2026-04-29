import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { SegmentEvaluator } from './segment-evaluator.service';
import { SegmentRecomputeService } from './segment-recompute.service';
import { SegmentsReadService } from './segments-read.service';

@Controller('segments')
export class SegmentsController {
  constructor(
    private readonly evaluator: SegmentEvaluator,
    private readonly recompute: SegmentRecomputeService,
    private readonly reads: SegmentsReadService,
  ) {}

  @Get()
  async list() {
    return this.reads.listSegments();
  }

  @Get(':id/members')
  async members(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    if (limit < 1 || limit > 500) {
      throw new BadRequestException('limit must be between 1 and 500');
    }
    if (offset < 0) {
      throw new BadRequestException('offset must be non-negative');
    }
    return this.reads.getSegmentMembers(id, limit, offset);
  }

  @Get(':id/history')
  async history(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }
    return this.reads.getSegmentHistory(id, limit);
  }

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
