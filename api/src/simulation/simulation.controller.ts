import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  BulkCreateResult,
  CreateClientInput,
  IngressService,
} from '../ingress/ingress.service';
import { COUNTRIES } from '../seed/client-seeder';
import { FastForwardResult, SimulationService } from './simulation.service';

@Controller('simulate')
export class SimulationController {
  constructor(
    private readonly ingress: IngressService,
    private readonly simulation: SimulationService,
  ) {}

  @Post('bulk-clients')
  async bulkClients(
    @Body() body: { count: number },
  ): Promise<BulkCreateResult> {
    const count = Number(body?.count);
    if (!Number.isInteger(count) || count <= 0 || count > 100_000) {
      throw new BadRequestException(
        'count must be an integer between 1 and 100000',
      );
    }

    const inputs: CreateClientInput[] = Array.from(
      { length: count },
      (_, i) => ({
        name: `Bulk Client ${Date.now()}-${i}`,
        country: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)],
      }),
    );

    return this.ingress.bulkCreateClients(inputs);
  }

  @Post('fast-forward')
  async fastForward(
    @Body() body: { days: number },
  ): Promise<FastForwardResult> {
    const days = Number(body?.days);
    if (!Number.isInteger(days) || days <= 0 || days > 365) {
      throw new BadRequestException(
        'days must be an integer between 1 and 365',
      );
    }
    return this.simulation.fastForward(days);
  }
}
