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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * ONE_DAY_MS;

export interface IngestTransactionInput {
  client_id: string;
  amount: number;
  occured_at?: Date;
}

export interface UpdateClientFieldsInput {
  country?: string;
}

@Injectable()
export class IngressService {
  private readonly log = new Logger(IngressService.name);

  constructor(
    @InjectDataSource() private readonly datasource: DataSource,
    @InjectRepository(ClientEntity)
    private readonly clients: Repository<ClientEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactions: Repository<TransactionEntity>,
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
      const client = await clientsRepo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id: transactionInput.client_id })
        .getOne();

      if (!transactionInput.client_id) {
        throw new Error(`client with ${transactionInput.client_id} not found!`);
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
      const { sum } = await transactionsRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'sum')
        .where('t.client_id = :id', { id: transactionInput.client_id })
        .andWhere('t.occured_at >= :cutoff', { cutoff: sixtyDaysAgo })
        .getRawOne<{ sum: string }>();

      const newCount = client.total_transaction_count + 1;
      const newLast =
        client.last_transaction_at && client.last_transaction_at > occured_at
          ? client.last_transaction_at
          : occured_at;
      const newTotal60 = parseFloat(sum);

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
    try {
      await this.es.update({
        index: 'clients',
        id: transactionInput.client_id,
        doc: {
          last_transaction_at: rollups.last_transaction_at,
          total_transaction_count: rollups.total_transaction_count,
          total_purchases_60d: rollups.total_purchases_60d,
        },
        refresh: 'wait_for',
      });
    } catch (err) {
      this.log.error(
        `ES update failed for client ${transactionInput.client_id} after postgres commit: ${(err as Error).message}`,
      );
    }

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

  async updateClient(
    clientId: string,
    patch: UpdateClientFieldsInput,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;

    const result = await this.clients.update(clientId, patch);
    if (result.affected === 0) {
      throw new Error(`client ${clientId} not found`);
    }

    try {
      await this.es.update({
        index: 'clients',
        id: clientId,
        doc: patch,
        refresh: 'wait_for',
      });
    } catch (e) {
      this.log.error(
        `ES update failed for client ${clientId}: ${(e as Error).message}`,
      );
    }

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
