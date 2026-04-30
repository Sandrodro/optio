import { Logger, Inject } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client as EsClient } from '@elastic/elasticsearch';
import { ClientSeeder } from './client-seeder';
import { TransactionSeeder } from './transaction-seeder';
import { SegmentSeeder } from './segment-seeder';
import { ensureClientsIndex } from './elasticsearch-bootstrap';
import { EvaluateAllCommand } from '../segments/evaluate-all.command';
import { ES_CLIENT } from '../elasticsearch/elasticsearch.module';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ComeBackCampaignSendEntity } from '../campaigns/come-back-campaign-send.entity';
import Redis from 'ioredis';

@Command({ name: 'seed', description: 'seed the database with fake data' })
export class SeedCommand extends CommandRunner {
  private readonly logger = new Logger(SeedCommand.name);

  constructor(
    private readonly clientSeeder: ClientSeeder,
    private readonly transactionSeeder: TransactionSeeder,
    private readonly segmentSeeder: SegmentSeeder,
    private readonly evaluateAllCommand: EvaluateAllCommand,
    @Inject(ES_CLIENT) private readonly es: EsClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(ComeBackCampaignSendEntity)
    private readonly sends: Repository<ComeBackCampaignSendEntity>,
  ) {
    super();
  }

  async run(): Promise<void> {
    this.logger.log('flushing redis...');
    await this.redis.flushdb();
    await this.sends.clear();

    this.logger.log('recreating elasticsearch index...');
    await ensureClientsIndex(this.es);

    this.logger.log('seeding clients...');
    const clients = await this.clientSeeder.seed(500);

    this.logger.log('seeding transactions and precomputed rollups...');
    await this.transactionSeeder.seed(clients, 5);

    this.logger.log('seeding segments...');
    await this.segmentSeeder.seed();
    this.logger.log('bootstrapping segment snapshots...');
    await this.evaluateAllCommand.run();

    this.logger.log('Seeding completed!');
  }
}
