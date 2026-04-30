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
import { IngressModule } from './ingress/ingress.module';
import { MessagingModule } from './messaging/messaging.module';
import { ScheduleModule } from '@nestjs/schedule';
import { WebsocketModule } from './websocket/websocket.module';
import { SimulationModule } from './simulation/simulation.module';
import { ClientsModule } from './clients/client.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ComeBackCampaignSendEntity } from './campaigns/come-back-campaign-send.entity';

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
        ComeBackCampaignSendEntity,
      ], // glob pattern did not work
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      logging: ['error', 'warn'],
    }),
    ScheduleModule.forRoot(),
    ElasticsearchModule,
    SeedModule,
    RedisModule,
    SegmentsModule,
    MessagingModule,
    IngressModule,
    WebsocketModule,
    SimulationModule,
    ClientsModule,
    CampaignsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
