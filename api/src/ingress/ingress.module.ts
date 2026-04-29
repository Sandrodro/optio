import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientEntity } from '../clients/client.entity';
import { TransactionEntity } from '../transactions/transaction.entity';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';
import { MessagingModule } from '../messaging/messaging.module';
import { TransactionsController } from './ingress-transactions.controller';
import { ClientsController } from './ingress-clients.controller';
import { IngressService } from './ingress.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientEntity, TransactionEntity]),
    ElasticsearchModule,
    MessagingModule,
  ],
  providers: [IngressService],
  controllers: [TransactionsController, ClientsController],
  exports: [IngressService],
})
export class IngressModule {}
