import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RedisKeys } from '../redis/redis.keys';
import { ClientEntity } from '../clients/client.entity';
import { DeltaHistoryEntity } from './delta-history.entity';

export interface SegmentListItem {
  id: string;
  name: string;
  type: 'dynamic' | 'static';
  rules: unknown;
  member_count: number | null;
  last_evaluated_at: string | null;
}

export interface SegmentMember {
  id: string;
  name: string;
  country: string;
  last_transaction_at: Date | null;
  total_purchases_60d: string;
  total_transaction_count: number;
}

export interface SegmentMembersPage {
  total: number;
  members: SegmentMember[];
}

export interface DeltaHistoryItem {
  id: string;
  segment_id: string;
  added_count: number;
  removed_count: number;
  added_client_ids: string[];
  removed_client_ids: string[];
  total_members_after: number;
  reason: string;
  evaluated_at: string;
}

@Injectable()
export class SegmentsReadService {
  constructor(
    @InjectDataSource() private readonly datasource: DataSource,
    @InjectRepository(ClientEntity)
    private readonly clients: Repository<ClientEntity>,
    @InjectRepository(DeltaHistoryEntity)
    private readonly deltaHistory: Repository<DeltaHistoryEntity>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async listSegments(): Promise<SegmentListItem[]> {
    // LATERAL join with LIMIT 1 = idiomatic PG for "latest row per parent"
    const rows: Array<{
      id: string;
      name: string;
      type: 'dynamic' | 'static';
      rules: unknown;
      member_count: string | null; // PG numerics come back as strings
      last_evaluated_at: Date | null;
    }> = await this.datasource.query(`
      SELECT
        s.id, s.name, s.type, s.rules,
        latest.total_members_after AS member_count,
        latest.evaluated_at AS last_evaluated_at
      FROM segments s
      LEFT JOIN LATERAL (
        SELECT total_members_after, evaluated_at
        FROM delta_history
        WHERE segment_id = s.id
        ORDER BY evaluated_at DESC
        LIMIT 1
      ) latest ON true
      ORDER BY s.name
    `);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      rules: r.rules,
      member_count: r.member_count == null ? null : Number(r.member_count),
      last_evaluated_at: r.last_evaluated_at?.toISOString() ?? null,
    }));
  }

  async getSegmentMembers(
    segmentId: string,
    limit: number,
    offset: number,
  ): Promise<SegmentMembersPage> {
    const memberIds = await this.redis.smembers(
      RedisKeys.segmentMembers(segmentId),
    );

    if (memberIds.length === 0) {
      return { total: 0, members: [] };
    }

    // PG does the sort and slice — Redis SETs are unordered, but we have
    // all the IDs in memory now and PG can ORDER BY last_transaction_at
    // efficiently with a WHERE id = ANY filter.
    const members: SegmentMember[] = await this.clients
      .createQueryBuilder('c')
      .select([
        'c.id AS id',
        'c.name AS name',
        'c.country AS country',
        'c.last_transaction_at AS last_transaction_at',
        'c.total_purchases_60d AS total_purchases_60d',
        'c.total_transaction_count AS total_transaction_count',
      ])
      .where('c.id = ANY(:ids)', { ids: memberIds })
      .orderBy('c.last_transaction_at', 'DESC', 'NULLS LAST')
      .addOrderBy('c.id', 'ASC') // stable secondary sort
      .limit(limit)
      .offset(offset)
      .getRawMany();

    return { total: memberIds.length, members };
  }

  async getSegmentHistory(
    segmentId: string,
    limit: number,
  ): Promise<DeltaHistoryItem[]> {
    const rows = await this.deltaHistory.find({
      where: { segment_id: segmentId },
      order: { evaluated_at: 'DESC' },
      take: limit,
    });

    return rows.map((r) => ({
      id: r.id,
      segment_id: r.segment_id,
      added_count: r.added_client_ids?.length ?? 0,
      removed_count: r.removed_client_ids?.length ?? 0,
      added_client_ids: r.added_client_ids ?? [],
      removed_client_ids: r.removed_client_ids ?? [],
      total_members_after: r.total_members_after,
      reason: r.reason,
      evaluated_at: r.evaluated_at.toISOString(),
    }));
  }
}
