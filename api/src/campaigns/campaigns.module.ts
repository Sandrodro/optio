import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '../messaging/messaging.module';
import { ComeBackCampaignConsumer } from './come-back-campaign.consumer';
import { CampaignsController } from './campaigns.controller';
import { ComeBackCampaignSendEntity } from './come-back-campaign-send.entity';

@Module({
  imports: [MessagingModule, TypeOrmModule.forFeature([ComeBackCampaignSendEntity])],
  providers: [ComeBackCampaignConsumer],
  controllers: [CampaignsController],
})
export class CampaignsModule {}
