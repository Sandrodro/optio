import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import { SegmentRecomputeService } from './segment-recompute.service';

// Hardcoded dependency order. Independent segments first, then dependents.
const EVALUATION_ORDER = [
  'recent-buyers',
  'high-spenders',
  'lapsed-customers',
  'georgian-launch-cohort',
  'lapsed-high-value', // depends on high-spenders + lapsed-customers
];

@Command({
  name: 'evaluate-all',
  description: 'recompute every segment in dependency order',
})
export class EvaluateAllCommand extends CommandRunner {
  private readonly log = new Logger(EvaluateAllCommand.name);

  constructor(private readonly recompute: SegmentRecomputeService) {
    super();
  }

  async run(): Promise<void> {
    this.log.log(`recomputing ${EVALUATION_ORDER.length} segments`);

    for (const segmentId of EVALUATION_ORDER) {
      const result = await this.recompute.recompute(segmentId, 'manual');
      this.log.log(
        `  ${segmentId}: total=${result.totalMembersAfter}, +${result.added.length} -${result.removed.length}`,
      );
    }

    this.log.log('done');
  }
}
