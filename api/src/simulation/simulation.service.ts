import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Client as EsClient } from '@elastic/elasticsearch';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ES_CLIENT } from '../elasticsearch/elasticsearch.module';
import { DATA_CHANGE_KEYS, EXCHANGES } from '../messaging/messaging.constants';
import { BulkImportedEvent } from '../messaging/messaging.events';

export interface FastForwardResult {
  affected_clients: number;
  shifted_transactions: number;
  chunk_count: number;
  days: number;
}

@Injectable()
export class SimulationService {
  private readonly log = new Logger(SimulationService.name);

  constructor(
    @InjectDataSource() private readonly datasource: DataSource,
    @Inject(ES_CLIENT) private readonly es: EsClient,
    private readonly amqp: AmqpConnection,
  ) {}

  async fastForward(days: number): Promise<FastForwardResult> {
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error('days must be a positive number');
    }

    const shiftResult = await this.datasource.query<[unknown[], number]>(
      `UPDATE transactions SET occured_at = occured_at - ($1 || ' days')::interval`,
      [days],
    );
    const shiftedCount = shiftResult[1] ?? 0;

    const clientRows = await this.datasource.query<{ client_id: string }[]>(
      `SELECT DISTINCT client_id FROM transactions`,
    );
    const affectedClientIds = clientRows.map((r) => r.client_id);

    if (affectedClientIds.length === 0) {
      this.log.log(`fast-forward ${days}d: no transactions to shift`);
      return {
        affected_clients: 0,
        shifted_transactions: shiftedCount,
        chunk_count: 0,
        days,
      };
    }

    const CHUNK_SIZE = 1000;
    const chunkCount = Math.ceil(affectedClientIds.length / CHUNK_SIZE);

    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const chunkIds = affectedClientIds.slice(start, start + CHUNK_SIZE);
      const isLastChunk = i === chunkCount - 1;
      await this.processFastForwardChunk(chunkIds, i, chunkCount, isLastChunk);
    }

    this.log.log(
      `fast-forward ${days}d complete: shifted ${shiftedCount} txns, ` +
        `${affectedClientIds.length} clients in ${chunkCount} chunks`,
    );

    return {
      affected_clients: affectedClientIds.length,
      shifted_transactions: shiftedCount,
      chunk_count: chunkCount,
      days,
    };
  }

  private async processFastForwardChunk(
    clientIds: string[],
    chunkIndex: number,
    chunkCount: number,
    isLastChunk: boolean,
  ): Promise<void> {
    await this.datasource.query(
      `
      WITH rollups AS (
        SELECT
          client_id,
          COALESCE(SUM(CASE WHEN occured_at >= NOW() - INTERVAL '60 days' THEN amount ELSE 0 END), 0) AS total_60d,
          COUNT(*) AS txn_count,
          MAX(occured_at) AS last_at
        FROM transactions
        WHERE client_id = ANY($1)
        GROUP BY client_id
      )
      UPDATE clients c
      SET
        total_purchases_60d = r.total_60d,
        total_transaction_count = r.txn_count,
        last_transaction_at = r.last_at
      FROM rollups r
      WHERE c.id = r.client_id
      `,
      [clientIds],
    );

    const updatedRows: Array<{
      id: string;
      last_transaction_at: Date | null;
      total_transaction_count: number;
      total_purchases_60d: string;
    }> = await this.datasource.query(
      `SELECT id, last_transaction_at, total_transaction_count, total_purchases_60d
   FROM clients WHERE id = ANY($1)`,
      [clientIds],
    );
    const operations = updatedRows.flatMap((row) => [
      { update: { _index: 'clients', _id: row.id } },
      {
        doc: {
          last_transaction_at: row.last_transaction_at,
          total_transaction_count: row.total_transaction_count,
          total_purchases_60d: parseFloat(row.total_purchases_60d),
        },
      },
    ]);

    if (operations.length > 0) {
      await this.es.bulk({
        operations,
        refresh: isLastChunk ? 'wait_for' : false,
      });
    }

    const event: BulkImportedEvent = {
      client_ids: clientIds,
      chunk_index: chunkIndex,
      chunk_count: chunkCount,
    };

    try {
      await this.amqp.publish(
        EXCHANGES.DATA_CHANGES,
        DATA_CHANGE_KEYS.BULK_IMPORTED,
        event,
      );
    } catch (e) {
      this.log.error(
        `publish failed for fast-forward chunk ${chunkIndex}: ${(e as Error).message}`,
      );
    }

    this.log.log(
      `fast-forward chunk ${chunkIndex + 1}/${chunkCount}: ${clientIds.length} clients`,
    );
  }
}
