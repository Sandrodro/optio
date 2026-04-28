import { Logger, Inject } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { Client as EsClient } from '@elastic/elasticsearch';
import { ClientSeeder } from './client-seeder';
import { TransactionSeeder } from './transaction-seeder';
import { SegmentSeeder } from './segment-seeder';
import { ensureClientsIndex } from './elasticsearch-bootstrap';

@Command({ name: 'seed', description: 'seed the database with fake data' })
export class SeedCommand extends CommandRunner {
  private readonly logger = new Logger(SeedCommand.name);

  constructor(
    private readonly clientSeeder: ClientSeeder,
    private readonly transactionSeeder: TransactionSeeder,
    private readonly segmentSeeder: SegmentSeeder,
    @Inject('ES_CLIENT') private readonly es: EsClient,
  ) {
    super();
  }

  async run(): Promise<void> {
    this.logger.log('recreating elasticsearch index...');
    await ensureClientsIndex(this.es);

    this.logger.log('seeding clients...');
    const clients = await this.clientSeeder.seed(500);

    this.logger.log('seeding transactions and precomputed rollups...');
    await this.transactionSeeder.seed(clients, 6);

    this.logger.log('seedint segments...');
    await this.segmentSeeder.seed();

    this.logger.log('Seeding completed!');
  }
}
