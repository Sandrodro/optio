import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedCommand } from './seed.command';
import { ClientSeeder } from './client-seeder';
import { TransactionSeeder } from './transaction-seeder';
import { SegmentSeeder } from './segment-seeder';
import { ClientEntity } from '../clients/client.entity';
import { TransactionEntity } from '../transactions/transaction.entity';
import { SegmentEntity } from '../segments/segment.entity';
import { StatsCommand } from '../cli/stats.command';
import { SegmentsModule } from '../segments/segments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientEntity, TransactionEntity, SegmentEntity]),
    SegmentsModule,
  ],
  providers: [
    SeedCommand,
    ClientSeeder,
    TransactionSeeder,
    SegmentSeeder,
    StatsCommand,
  ],
})
export class SeedModule {}
