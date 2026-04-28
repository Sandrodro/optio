import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inject } from '@nestjs/common';
import { Client as EsClient } from '@elastic/elasticsearch';
import { ClientEntity } from '../clients/client.entity';
import { TransactionEntity } from '../transactions/transaction.entity';
import { SegmentEntity } from '../segments/segment.entity';

@Command({
  name: 'stats',
  description: 'Print database and segment statistics',
})
export class StatsCommand extends CommandRunner {
  private readonly logger = new Logger(StatsCommand.name);

  constructor(
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(SegmentEntity)
    private readonly segmentRepo: Repository<SegmentEntity>,
    @Inject('ES_CLIENT')
    private readonly es: EsClient,
  ) {
    super();
  }

  async run(): Promise<void> {
    const [clientCount, txCount, segments] = await Promise.all([
      this.clientRepo.count(),
      this.txRepo.count(),
      this.segmentRepo.find({ order: { id: 'ASC' } }),
    ]);

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('         OPTIO SEGMENTS STATS          ');
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log(`Clients:      ${clientCount}`);
    console.log(`Transactions: ${txCount}`);
    console.log(`Segments:     ${segments.length}`);
    console.log('');
    console.log('───────────────────────────────────────');
    console.log('Segments breakdown:');
    console.log('───────────────────────────────────────');

    for (const segment of segments) {
      const memberCount = await this.countMembers(segment);
      const dependencies =
        segment.rules.segmentDependencies.length > 0
          ? ` (depends on: ${segment.rules.segmentDependencies.join(', ')})`
          : '';
      console.log(
        `  [${segment.type.padEnd(7)}] ${segment.id.padEnd(28)} → ${memberCount} members${dependencies}`,
      );
    }

    console.log('');
  }

  private async countMembers(segment: SegmentEntity): Promise<number | string> {
    try {
      const baseQuery = segment.rules.esQuery as any;
      const deps = segment.rules.segmentDependencies;

      // For cascading segments, we'd need to resolve dependencies first.
      // For this stats script, just count the base query — note when there are deps.
      if (deps.length > 0) {
        return 'requires evaluation';
      }

      const result = await this.es.count({
        index: 'clients',
        query: baseQuery.query,
      });

      return result.count;
    } catch (err) {
      return `error: ${(err as Error).message}`;
    }
  }
}
