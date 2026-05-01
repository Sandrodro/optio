import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RedisKeys } from '../redis/redis.keys';
import { SegmentEntity, SegmentRules, SegmentType } from './segment.entity';
import { SegmentRecomputeService, RecomputeResult } from './segment-recompute.service';

export interface CreateSegmentInput {
  id: string;
  name: string;
  type: SegmentType;
  rules: { esQuery: object; segmentDependencies?: string[] };
}

export interface UpdateSegmentInput {
  name?: string;
  rules?: { esQuery: object; segmentDependencies?: string[] };
}

@Injectable()
export class SegmentsWriteService {
  constructor(
    @InjectRepository(SegmentEntity)
    private readonly segments: Repository<SegmentEntity>,
    @InjectDataSource() private readonly datasource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly recompute: SegmentRecomputeService,
  ) {}

  async createSegment(input: CreateSegmentInput): Promise<RecomputeResult> {
    const existing = await this.segments.findOne({ where: { id: input.id } });
    if (existing) {
      throw new ConflictException(`segment '${input.id}' already exists`);
    }

    const deps = input.rules.segmentDependencies ?? [];
    await this.assertDepsExist(deps);

    const rules: SegmentRules = {
      esQuery: input.rules.esQuery,
      segmentDependencies: deps,
    };

    await this.segments.save({ id: input.id, name: input.name, type: input.type, rules });

    return this.recompute.recompute(input.id, 'manual');
  }

  async updateSegment(id: string, input: UpdateSegmentInput): Promise<RecomputeResult | { ok: true }> {
    const segment = await this.segments.findOne({ where: { id } });
    if (!segment) throw new NotFoundException(`segment '${id}' not found`);

    if (input.name !== undefined) {
      segment.name = input.name;
    }

    if (input.rules !== undefined) {
      const deps = input.rules.segmentDependencies ?? segment.rules.segmentDependencies;
      await this.assertDepsExist(deps.filter((d) => d !== id));
      segment.rules = {
        esQuery: input.rules.esQuery,
        segmentDependencies: deps,
      };
    }

    await this.segments.save(segment);

    if (input.rules !== undefined) {
      return this.recompute.recompute(id, 'manual');
    }
    return { ok: true };
  }

  async deleteSegment(id: string): Promise<void> {
    const segment = await this.segments.findOne({ where: { id } });
    if (!segment) throw new NotFoundException(`segment '${id}' not found`);

    const dependents: Array<{ id: string }> = await this.datasource.query(
      `SELECT id FROM segments WHERE rules->'segmentDependencies' @> $1::jsonb AND id != $2`,
      [JSON.stringify([id]), id],
    );
    if (dependents.length > 0) {
      throw new ConflictException(
        `cannot delete: segment(s) ${dependents.map((d) => d.id).join(', ')} depend on '${id}'`,
      );
    }

    const pipeline = this.redis.pipeline();
    pipeline.del(RedisKeys.segmentMembers(id));
    pipeline.del(RedisKeys.segmentMembersTemp(id));
    for (const reason of ['event', 'cascade', 'manual'] as const) {
      const member = `${reason}:${id}`;
      pipeline.zrem(RedisKeys.pendingRecomputes(), member);
      pipeline.hdel(RedisKeys.pendingRecomputeFirstScheduled(), member);
    }
    await pipeline.exec();

    await this.segments.delete(id);
  }

  private async assertDepsExist(deps: string[]): Promise<void> {
    if (deps.length === 0) return;
    const found = await this.segments.findBy({ id: In(deps) });
    const foundIds = new Set(found.map((s) => s.id));
    const missing = deps.filter((d) => !foundIds.has(d));
    if (missing.length > 0) {
      throw new NotFoundException(`segment dependencies not found: ${missing.join(', ')}`);
    }
  }
}
