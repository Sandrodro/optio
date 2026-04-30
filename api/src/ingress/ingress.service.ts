import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client as EsClient } from '@elastic/elasticsearch';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ClientEntity } from '../clients/client.entity';
import { TransactionEntity } from '../transactions/transaction.entity';
import { ES_CLIENT } from '../elasticsearch/elasticsearch.module';
import { DATA_CHANGE_KEYS, EXCHANGES } from '../messaging/messaging.constants';
import {
  ClientUpdatedEvent,
  TransactionCreatedEvent,
} from '../messaging/messaging.events';
import { BulkImportedEvent } from '../messaging/messaging.events';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * ONE_DAY_MS;
const SEGMENT_IRRELEVANT_FIELDS: (keyof UpdateClientFieldsInput)[] = ['name'];

export interface IngestTransactionInput {
  client_id: string;
  amount: number;
  occured_at?: Date;
}

export interface UpdateClientFieldsInput {
  country?: string;
  name?: string;
}

export interface CreateClientInput {
  country: string;
  name: string;
  signup_date?: string;
}

export interface BulkCreateResult {
  created_count: number;
  chunk_count: number;
}

@Injectable()
export class IngressService {
  private readonly log = new Logger(IngressService.name);

  constructor(
    @InjectDataSource() private readonly datasource: DataSource,
    @InjectRepository(ClientEntity)
    private readonly clients: Repository<ClientEntity>,
    @Inject(ES_CLIENT) private readonly es: EsClient,
    private readonly amqp: AmqpConnection,
  ) {}

  async ingestTransaction(
    transactionInput: IngestTransactionInput,
  ): Promise<void> {
    const occured_at = transactionInput.occured_at ?? new Date();

    const rollups = await this.datasource.transaction(async (manager) => {
      const transactionsRepo = manager.getRepository(TransactionEntity);
      const clientsRepo = manager.getRepository(ClientEntity);

      // lock
      const clientRow = await clientsRepo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id: transactionInput.client_id })
        .getOne();

      if (!transactionInput.client_id) {
        throw new Error(`client with ${transactionInput.client_id} not found!`);
      }

      if (!clientRow) {
        throw new Error(`client with ${transactionInput.client_id} not found`);
      }

      const transaction = await transactionsRepo.save(
        transactionsRepo.create({
          client_id: transactionInput.client_id,
          amount: transactionInput.amount.toFixed(2),
          occured_at,
        }),
      );

      const sixtyDaysAgo = new Date(Date.now() - SIXTY_DAYS_MS);

      // recompute rollups
      const sumRow = await transactionsRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'sum')
        .where('t.client_id = :id', { id: transactionInput.client_id })
        .andWhere('t.occured_at >= :cutoff', { cutoff: sixtyDaysAgo })
        .getRawOne<{ sum: string }>();

      const newTotal60 = parseFloat(sumRow?.sum ?? '0');

      const newCount = clientRow.total_transaction_count + 1;
      const newLast =
        clientRow.last_transaction_at &&
        clientRow.last_transaction_at > occured_at
          ? clientRow.last_transaction_at
          : occured_at;

      await clientsRepo.update(transactionInput.client_id, {
        last_transaction_at: newLast,
        total_transaction_count: newCount,
        total_purchases_60d: newTotal60.toFixed(2),
      });

      return {
        transaction_id: transaction.id,
        last_transaction_at: newLast,
        total_transaction_count: newCount,
        total_purchases_60d: newTotal60,
      };
    });

    // update ES
    await this.updateEsWithRetry(transactionInput.client_id, {
      last_transaction_at: rollups.last_transaction_at,
      total_transaction_count: rollups.total_transaction_count,
      total_purchases_60d: rollups.total_purchases_60d,
    });

    const event: TransactionCreatedEvent = {
      transaction_id: rollups.transaction_id,
      client_id: transactionInput.client_id,
      amount: transactionInput.amount,
      occurred_at: occured_at.toISOString(),
    };

    try {
      await this.amqp.publish(
        EXCHANGES.DATA_CHANGES,
        DATA_CHANGE_KEYS.TRANSACTION_CREATED,
        event,
      );
    } catch (e) {
      this.log.error(
        `publish failed for transaction ${rollups.transaction_id}: ${(e as Error).message}`,
      );
    }
  }

  private async updateEsWithRetry(
    clientId: string,
    doc: Record<string, unknown> | UpdateClientFieldsInput,
    attempt = 1,
  ): Promise<void> {
    const MAX_ATTEMPTS = 5;

    try {
      await this.es.update({
        index: 'clients',
        id: clientId,
        doc,
        refresh: 'wait_for',
      });
    } catch (e: any) {
      const isVersionConflict =
        e?.meta?.body?.error?.type === 'version_conflict_engine_exception' ||
        String(e?.message ?? '').includes('version_conflict');

      if (isVersionConflict && attempt < MAX_ATTEMPTS) {
        const delayMs = 20 * 2 ** (attempt - 1) + Math.random() * 20;
        await new Promise((r) => setTimeout(r, delayMs));
        return this.updateEsWithRetry(clientId, doc, attempt + 1);
      }

      this.log.error(
        `ES update failed for client ${clientId} after ${attempt} attempt(s): ${(e as Error).message}`,
      );
    }
  }

  async updateClient(
    clientId: string,
    patch: UpdateClientFieldsInput,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;

    const result = await this.clients.update(clientId, patch);
    if (result.affected === 0) {
      throw new Error(`client ${clientId} not found`);
    }

    const { name: _, ...esPatch } = patch;
    if (Object.keys(esPatch).length > 0) {
      await this.updateEsWithRetry(clientId, esPatch);
    }

    // dont recompute on name change events
    if (
      Object.keys(patch).some(
        (k) =>
          !SEGMENT_IRRELEVANT_FIELDS.includes(
            k as keyof UpdateClientFieldsInput,
          ),
      )
    ) {
      const event: ClientUpdatedEvent = { client_id: clientId };
      try {
        await this.amqp.publish(
          EXCHANGES.DATA_CHANGES,
          DATA_CHANGE_KEYS.CLIENT_UPDATED,
          event,
        );
      } catch (e) {
        this.log.error(
          `publish failed for client.updated ${clientId}: ${(e as Error).message}`,
        );
      }
    }
  }

  async bulkCreateClients(
    inputs: CreateClientInput[],
  ): Promise<BulkCreateResult> {
    if (inputs.length === 0) {
      return { created_count: 0, chunk_count: 0 };
    }

    const CHUNK_SIZE = 1000;
    const chunkCount = Math.ceil(inputs.length / CHUNK_SIZE);

    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const chunk = inputs.slice(start, start + CHUNK_SIZE);
      const isLastChunk = i === chunkCount - 1;
      await this.processClientChunk(chunk, i, chunkCount, isLastChunk);
    }

    return { created_count: inputs.length, chunk_count: chunkCount };
  }

  private async processClientChunk(
    chunk: CreateClientInput[],
    chunkIndex: number,
    chunkCount: number,
    isLastChunk: boolean,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    const insertResult = await this.clients
      .createQueryBuilder()
      .insert()
      .into(ClientEntity)
      .values(
        chunk.map((c) => ({
          name: c.name,
          country: c.country,
          signup_date: c.signup_date ?? today,
        })),
      )
      .returning(['id'])
      .execute();

    const ids: string[] = insertResult.raw.map((r: { id: string }) => r.id);

    const operations = ids.flatMap((id, idx) => [
      { index: { _index: 'clients', _id: id } },
      {
        country: chunk[idx].country,
        signup_date: chunk[idx].signup_date ?? today,
        last_transaction_at: null,
        total_transaction_count: 0,
        total_purchases_60d: 0,
      },
    ]);

    await this.es.bulk({
      operations,
      refresh: isLastChunk ? 'wait_for' : false,
    });

    const event: BulkImportedEvent = {
      client_ids: ids,
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
        `publish failed for bulk.imported chunk ${chunkIndex}: ${(e as Error).message}`,
      );
    }

    this.log.log(
      `bulk chunk ${chunkIndex + 1}/${chunkCount}: created ${ids.length} clients`,
    );
  }
}
