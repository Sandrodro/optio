import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  BadRequestException,
  Post,
} from '@nestjs/common';
import {
  IngressService,
  BulkCreateResult,
  CreateClientInput,
} from './ingress.service';

interface UpdateClient {
  country?: string;
  name?: string;
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
    if (!data || Object.keys(data).length === 0) {
      throw new BadRequestException('body must contain at least one field');
    }

    const allowedKeys = new Set(['country', 'name']);
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) {
        throw new BadRequestException(`field '${key}' is not updateable`);
      }
    }

    await this.ingress.updateClient(id, data);
    return { ok: true };
  }

  @Post('bulk')
  async bulkCreate(
    @Body() body: { clients: CreateClientInput[] },
  ): Promise<BulkCreateResult> {
    if (!Array.isArray(body?.clients)) {
      throw new BadRequestException('clients must be an array');
    }
    return this.ingress.bulkCreateClients(body.clients);
  }
}
