import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientEntity } from './clients/client.entity';
import { TransactionEntity } from './transactions/transaction.entity';
import { SegmentEntity } from './segments/segment.entity';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { SeedModule } from './seed/seed.module';
import { RedisModule } from './redis/redis.module';
import { DeltaHistoryEntity } from './segments/delta-history.entity';
import { SegmentsModule } from './segments/segments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: false, // sync ony with migrations
      entities: [
        ClientEntity,
        DeltaHistoryEntity,
        TransactionEntity,
        SegmentEntity,
      ], // glob pattern did not work
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      logging: ['error', 'warn'],
    }),
    ElasticsearchModule,
    SeedModule,
    RedisModule,
    SegmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
