import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('come_back_campaign_sends')
export class ComeBackCampaignSendEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  count: number;

  @CreateDateColumn({ name: 'sent_at' })
  sent_at: Date;
}
