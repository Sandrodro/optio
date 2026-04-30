import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComeBackCampaignSendEntity } from './come-back-campaign-send.entity';

@Controller('campaigns')
export class CampaignsController {
  constructor(
    @InjectRepository(ComeBackCampaignSendEntity)
    private readonly sends: Repository<ComeBackCampaignSendEntity>,
  ) {}

  @Get('come-back')
  async getComeBackStats(): Promise<{ total_sent: number }> {
    const total = await this.sends.sum('count');
    return { total_sent: total ?? 0 };
  }
}
