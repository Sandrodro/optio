import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ClientEntity } from './clients/client.entity';
import { TransactionEntity } from './transactions/transaction.entity';
import { SegmentEntity } from './segments/segment.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [ClientEntity, TransactionEntity, SegmentEntity],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
});
