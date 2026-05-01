import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SegmentEvaluator } from './segment-evaluator.service';
import { SegmentRecomputeService } from './segment-recompute.service';
import { SegmentsReadService } from './segments-read.service';
import { SegmentsWriteService } from './segments-write.service';

interface CreateSegmentBody {
  id: string;
  name: string;
  type: 'dynamic' | 'static';
  rules: { esQuery: object; segmentDependencies?: string[] };
}

interface UpdateSegmentBody {
  name?: string;
  rules?: { esQuery: object; segmentDependencies?: string[] };
}

@Controller('segments')
export class SegmentsController {
  constructor(
    private readonly evaluator: SegmentEvaluator,
    private readonly recompute: SegmentRecomputeService,
    private readonly reads: SegmentsReadService,
    private readonly writes: SegmentsWriteService,
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

  @Post()
  async createSegment(@Body() body: CreateSegmentBody) {
    if (!body?.id || typeof body.id !== 'string') {
      throw new BadRequestException('id is required');
    }
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(body.id)) {
      throw new BadRequestException('id must be lowercase alphanumeric with hyphens, max 63 chars');
    }
    if (!body.name || typeof body.name !== 'string' || body.name.length > 200) {
      throw new BadRequestException('name is required (max 200 chars)');
    }
    if (body.type !== 'dynamic' && body.type !== 'static') {
      throw new BadRequestException("type must be 'dynamic' or 'static'");
    }
    if (!body.rules || typeof body.rules.esQuery !== 'object' || body.rules.esQuery === null) {
      throw new BadRequestException('rules.esQuery must be an object');
    }
    if (
      body.rules.segmentDependencies !== undefined &&
      !Array.isArray(body.rules.segmentDependencies)
    ) {
      throw new BadRequestException('rules.segmentDependencies must be an array');
    }

    return this.writes.createSegment(body);
  }

  @Patch(':id')
  async updateSegment(@Param('id') id: string, @Body() body: UpdateSegmentBody) {
    const allowedKeys = new Set(['name', 'rules']);
    for (const key of Object.keys(body ?? {})) {
      if (!allowedKeys.has(key)) {
        throw new BadRequestException(`field '${key}' cannot be updated`);
      }
    }
    if (!body?.name && !body?.rules) {
      throw new BadRequestException('body must contain at least one of: name, rules');
    }
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 200)) {
      throw new BadRequestException('name must be a string (max 200 chars)');
    }
    if (body.rules !== undefined) {
      if (typeof body.rules.esQuery !== 'object' || body.rules.esQuery === null) {
        throw new BadRequestException('rules.esQuery must be an object');
      }
      if (
        body.rules.segmentDependencies !== undefined &&
        !Array.isArray(body.rules.segmentDependencies)
      ) {
        throw new BadRequestException('rules.segmentDependencies must be an array');
      }
    }

    return this.writes.updateSegment(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSegment(@Param('id') id: string) {
    await this.writes.deleteSegment(id);
  }
}
