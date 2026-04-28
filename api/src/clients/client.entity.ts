import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('clients')
export class ClientEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ length: 2 })
  country: string;

  @Column({ type: 'date' })
  signup_date: string;

  @Column({ type: 'timestamp', nullable: true })
  last_transaction_at: Date | null;

  @Column({ type: 'integer', default: 0 })
  total_transaction_count: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  total_purchases_60d: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
