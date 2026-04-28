import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ClientEntity } from '../clients/client.entity';

@Entity('transactions')
@Index(['client_id', 'occured_at'])
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  client_id: string;

  @ManyToOne(() => ClientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: ClientEntity;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'timestamp' })
  occured_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
