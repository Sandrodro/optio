import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Client as EsClient } from '@elastic/elasticsearch';
import { SegmentEntity } from './segment.entity';
import { RedisKeys } from 'src/redis/redis.keys';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ES_CLIENT } from '../elasticsearch/elasticsearch.module';

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

    if (!segment) throw new Error(`segment ${segmentId} not found`);

    const depFilters = await this.buildDependencyFilters(
      segment.rules.segmentDependencies,
    );

    const query = this.mergeFilters(segment.rules.esQuery, depFilters);

    return this.searchAllIds(query);
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
    if (
      !cloned.query?.bool?.filter ||
      !Array.isArray(cloned.query.bool.filter)
    ) {
      throw new Error(
        `segment query must have shape { query: { bool: { filter: [...] } } }`,
      );
    }
    cloned.query.bool.filter.push(...depFilters);
    return cloned;
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
