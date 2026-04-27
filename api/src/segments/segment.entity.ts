import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SegmentType = 'dynamic' | 'static';

export interface SegmentRules {
  esQuery: object;
  segmentDependencies: string[];
}

@Entity('segments')
export class SegmentEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ['dynamic', 'static'] })
  type: SegmentType;

  @Column({ type: 'jsonb' })
  rules: SegmentRules;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
