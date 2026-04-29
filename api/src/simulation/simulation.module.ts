import { Module } from '@nestjs/common';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';
import { IngressModule } from '../ingress/ingress.module';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [IngressModule, ElasticsearchModule, MessagingModule],
  controllers: [SimulationController],
  providers: [SimulationService],
})
export class SimulationModule {}
