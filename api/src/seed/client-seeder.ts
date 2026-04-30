import { faker } from '@faker-js/faker';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client as EsClient } from '@elastic/elasticsearch';
import { ClientEntity } from '../clients/client.entity';

export const COUNTRIES = ['GE', 'US', 'GB', 'DE', 'FR', 'IT', 'ES', 'TR'];

@Injectable()
export class ClientSeeder {
  constructor(
    @InjectRepository(ClientEntity)
    private readonly repo: Repository<ClientEntity>,
    @Inject('ES_CLIENT')
    private readonly es: EsClient,
  ) {}

  async seed(count: number): Promise<ClientEntity[]> {
    await this.repo.query(
      'TRUNCATE TABLE "transactions", "clients" RESTART IDENTITY CASCADE',
    );

    const clients: ClientEntity[] = [];

    for (let i = 0; i < count; i++) {
      const client = this.repo.create({
        name: faker.person.fullName(),
        country: faker.helpers.arrayElement(COUNTRIES),
        signup_date: faker.date.past({ years: 3 }).toISOString().slice(0, 10),
        last_transaction_at: null,
        total_transaction_count: 0,
        total_purchases_60d: '0',
      });
      clients.push(client);
    }

    const saved = await this.repo.save(clients);

    // index into elasticsearch
    const esOperations = saved.flatMap((c) => [
      { index: { _index: 'clients', _id: c.id } },
      this.toEsDoc(c),
    ]);
    await this.es.bulk({ operations: esOperations, refresh: true });

    return saved;
  }

  private toEsDoc(c: ClientEntity) {
    return {
      country: c.country,
      signup_date: c.signup_date,
      last_transaction_at: c.last_transaction_at,
      total_transaction_count: c.total_transaction_count,
      total_purchases_60d: parseFloat(c.total_purchases_60d),
    };
  }
}
