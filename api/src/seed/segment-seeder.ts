import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as esb from 'elastic-builder';
import { SegmentEntity } from '../segments/segment.entity';

@Injectable()
export class SegmentSeeder {
  constructor(
    @InjectRepository(SegmentEntity)
    private readonly repo: Repository<SegmentEntity>,
  ) {}

  async seed(): Promise<void> {
    await this.repo.query(
      'TRUNCATE TABLE "delta_history", "segments" RESTART IDENTITY CASCADE',
    );

    const segments: Partial<SegmentEntity>[] = [
      {
        id: 'recent-buyers',
        name: 'Recent buyers (last 14 days)',
        type: 'dynamic',
        rules: {
          esQuery: esb
            .requestBodySearch()
            .query(
              esb
                .boolQuery()
                .filter(esb.rangeQuery('last_transaction_at').gte('now-14d/d')),
            )
            .toJSON(),
          segmentDependencies: [],
        },
      },
      {
        id: 'high-spenders',
        name: 'High spenders (>1200 in 60 days)',
        type: 'dynamic',
        rules: {
          esQuery: esb
            .requestBodySearch()
            .query(
              esb
                .boolQuery()
                .filter(esb.rangeQuery('total_purchases_60d').gt(1200)),
            )
            .toJSON(),
          segmentDependencies: [],
        },
      },
      {
        id: 'lapsed-customers',
        name: 'Lapsed customers (3+ transactions in all time, none in 22 days)',
        type: 'dynamic',
        rules: {
          esQuery: esb
            .requestBodySearch()
            .query(
              esb
                .boolQuery()
                .filter(esb.rangeQuery('total_transaction_count').gte(3))
                .filter(esb.rangeQuery('last_transaction_at').lt('now-24d/d')),
            )
            .toJSON(),
          segmentDependencies: [],
        },
      },
      {
        id: 'lapsed-high-value',
        name: 'Lapsed high-value customers',
        type: 'dynamic',
        rules: {
          esQuery: esb
            .requestBodySearch()
            .query(esb.boolQuery().must(esb.matchAllQuery()))
            .toJSON(),
          segmentDependencies: ['high-spenders', 'lapsed-customers'],
        },
      },
      {
        id: 'georgian-launch-cohort',
        name: 'Georgian launch cohort (static)',
        type: 'static',
        rules: {
          esQuery: esb
            .requestBodySearch()
            .query(
              esb
                .boolQuery()
                .filter(esb.termQuery('country', 'GE'))
                .filter(esb.rangeQuery('signup_date').lte('2026-03-01')),
            )
            .toJSON(),
          segmentDependencies: [],
        },
      },
    ];

    await this.repo.save(segments);
  }
}
