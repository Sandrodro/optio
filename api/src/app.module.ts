import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientEntity } from './clients/client.entity';
import { TransactionEntity } from './transactions/transaction.entity';
import { SegmentEntity } from './segments/segment.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: false, // sync ony with migrations
      entities: [ClientEntity, TransactionEntity, SegmentEntity],
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      logging: ['error', 'warn'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
