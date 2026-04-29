import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { IngressService } from './ingress.service';

interface UpdateClient {
  country?: string;
}

@Controller('clients')
export class ClientsController {
  constructor(private readonly ingress: IngressService) {}

  @Patch(':id')
  @HttpCode(HttpStatus.ACCEPTED)
  async update(
    @Param('id') id: string,
    @Body() data: UpdateClient,
  ): Promise<{ ok: true }> {
    await this.ingress.updateClient(id, data);
    return { ok: true };
  }
}
