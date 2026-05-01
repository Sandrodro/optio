import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Client as EsClient } from '@elastic/elasticsearch';
import { SegmentEntity } from './segment.entity';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ES_CLIENT } from '../elasticsearch/elasticsearch.module';
import { RedisKeys } from '../redis/redis.keys';

@Injectable()
export class SegmentEvaluator {
  private readonly log = new Logger(SegmentEvaluator.name);

  constructor(
    @InjectRepository(SegmentEntity)
    private readonly segments: Repository<SegmentEntity>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ES_CLIENT) private readonly es: EsClient,
  ) {}

  async evaluate(segmentId: string): Promise<string[]> {
    const segment = await this.segments.findOne({ where: { id: segmentId } });

    if (!segment) throw new NotFoundException(`segment ${segmentId} not found`);

    const deps = segment.rules.segmentDependencies;

    if (deps.length > 0 && this.isNoOpQuery(segment.rules.esQuery)) {
      this.log.debug(`evaluate ${segmentId}: pure-cascade fast path (SINTER)`);
      const keys = deps.map((d) => RedisKeys.segmentMembers(d));
      return this.redis.sinter(...keys);
    }

    const depFilters = await this.buildDependencyFilters(deps);
    const query = this.mergeFilters(segment.rules.esQuery, depFilters);
    return this.searchAllIds(query);
  }

  private isNoOpQuery(esQuery: unknown): boolean {
    if (typeof esQuery !== 'object' || esQuery === null) return false;
    const q = (esQuery as any).query;
    if (typeof q !== 'object' || q === null) return false;
    const qKeys = Object.keys(q);
    if (qKeys.length !== 1) return false;

    if (qKeys[0] === 'match_all') {
      return typeof q.match_all === 'object' && q.match_all !== null
        && Object.keys(q.match_all).length === 0;
    }

    if (qKeys[0] === 'bool') {
      const b = q.bool;
      if (typeof b !== 'object' || b === null) return false;
      const bKeys = Object.keys(b);
      if (bKeys.length === 0) return true;
      if (bKeys.length !== 1 || bKeys[0] !== 'must') return false;
      const must = b.must;
      const clauses = Array.isArray(must) ? must : [must];
      if (clauses.length !== 1) return false;
      const c = clauses[0];
      return typeof c === 'object' && c !== null
        && Object.keys(c).length === 1
        && c.match_all !== undefined
        && typeof c.match_all === 'object'
        && Object.keys(c.match_all).length === 0;
    }

    return false;
  }

  private async buildDependencyFilters(
    depIds: string[],
  ): Promise<Array<{ terms: { _id: string[] } }>> {
    if (depIds.length === 0) return [];

    const filters: Array<{ terms: { _id: string[] } }> = [];
    for (const depId of depIds) {
      const members = await this.redis.smembers(
        RedisKeys.segmentMembers(depId),
      );
      if (members.length === 0) {
        this.log.warn(
          `dependency ${depId} has empty/missing snapshot; dependent will be empty`,
        );
        return [{ terms: { _id: ['__no_match__'] } }];
      }
      filters.push({ terms: { _id: members } });
    }
    return filters;
  }

  private mergeFilters(
    baseQuery: any,
    depFilters: Array<{ terms: { _id: string[] } }>,
  ): any {
    const cloned = structuredClone(baseQuery);

    cloned.query ??= {};
    cloned.query.bool ??= {};

    const existing = cloned.query.bool.filter;
    if (existing === undefined) {
      cloned.query.bool.filter = [];
    } else if (!Array.isArray(existing)) {
      cloned.query.bool.filter = [existing];
    }

    cloned.query.bool.filter.push(...depFilters);
    return cloned;
  }

  private async searchAllIds(query: any): Promise<string[]> {
    const res = await this.es.search({
      index: 'clients',
      ...query,
      _source: false, //we only need ids
      size: 10000,
      track_total_hits: true,
    });
    return res.hits.hits.map((h) => h._id as string);
  }
}
