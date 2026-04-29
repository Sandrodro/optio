import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IngressService } from './ingress.service';

interface CreateTransaction {
  client_id: string;
  amount: number;
  occured_at?: string;
}

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly ingress: IngressService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() dto: CreateTransaction): Promise<{ ok: true }> {
    await this.ingress.ingestTransaction({
      client_id: dto.client_id,
      amount: dto.amount,
      occured_at: dto.occured_at ? new Date(dto.occured_at) : undefined,
    });
    return { ok: true };
  }
}
