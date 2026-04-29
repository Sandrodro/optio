import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientEntity } from './client.entity';
import { In } from 'typeorm';

interface ClientDto {
  id: string;
  name: string;
  country: string;
  last_transaction_at: Date | null;
  total_purchases_60d: string;
  total_transaction_count: number;
}

@Controller('clients')
export class ClientsReadController {
  constructor(
    @InjectRepository(ClientEntity)
    private readonly clients: Repository<ClientEntity>,
  ) {}

  @Get()
  async list(
    @Query('ids') ids: string | undefined,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<{ total: number; clients: ClientDto[] }> {
    // Branch on ids: if provided, hydrate; otherwise paginate.
    if (ids !== undefined && ids !== '') {
      const idArray = ids.split(',').filter(Boolean);
      if (idArray.length === 0) {
        return { total: 0, clients: [] };
      }
      if (idArray.length > 1000) {
        throw new BadRequestException(
          'cannot hydrate more than 1000 ids at once',
        );
      }

      const rows = await this.clients.find({
        where: { id: In(idArray) },
        order: { name: 'ASC' },
      });

      return { total: rows.length, clients: this.toDtos(rows) };
    }

    if (limit < 1 || limit > 500) {
      throw new BadRequestException('limit must be between 1 and 500');
    }

    const [rows, total] = await this.clients.findAndCount({
      order: { name: 'ASC' },
      take: limit,
      skip: offset,
    });

    return { total, clients: this.toDtos(rows) };
  }

  private toDtos(rows: ClientEntity[]): ClientDto[] {
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      country: c.country,
      last_transaction_at: c.last_transaction_at,
      total_purchases_60d: c.total_purchases_60d,
      total_transaction_count: c.total_transaction_count,
    }));
  }
}
