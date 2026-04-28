import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SegmentEntity } from './segment.entity';
export type DeltaReason = 'manual' | 'event' | 'cascade';

@Entity('delta_history')
@Index(['segment_id', 'evaluated_at'])
export class DeltaHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  segment_id: string;

  @ManyToOne(() => SegmentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'segment_id' })
  segment: SegmentEntity;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  added_client_ids: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  removed_client_ids: string[];

  @Column({ type: 'integer' })
  total_members_after: number;

  @Column({
    type: 'enum',
    enum: ['manual', 'event', 'cascade'],
    default: 'manual',
  })
  reason: DeltaReason;

  @CreateDateColumn({ name: 'evaluated_at' })
  evaluated_at: Date;
}
