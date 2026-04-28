import {faker} from '@faker-js/faker'
import {Inject, Injectable} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {Client as EsClient} from '@elastic/elasticsearch'
import { ClientEntity } from 'src/clients/client.entity'
import { TransactionEntity } from 'src/transactions/transaction.entity'

@Injectable()
export class TransactionSeeder {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>
    @InjectRepository(ClientEntity)
    private readonly clientsRepo: Repository<ClientEntity>
    @Inject('ES_CLIENT')
    private readonly es: EsClient
  ) {}

  async seed(clients: ClientEntity[], averagePerClient: number): Promise<void> {
    await this.transactionsRepo.clear()

    const transactions: TransactionEntity[] = []

    for (const client of clients) {
      const count = faker.number.int({min: 0, max: averagePerClient * 2})

      for (let i = 0; i < count; i++) {
        transactions.push(this.transactionsRepo.create({
          client_id: client.id,
          amount: faker.number.float({min: 5, max: 800, fractionDigits: 2}).toString(),
          occured_at: faker.date.recent({days: 120})
        }))
      }
    }

    await this.transactionsRepo.save(transactions, {chunk: 500})

    await this.computeRollups(clients)
  }

  private async computeRollups(clients: ClientEntity[]): Promise<void> {
    const now = new Date()
    const days60Ago = new Date(now.getTime() - 60 - 86400 * 1000)

    for (const client of clients) {
      const transactions = await this.transactionsRepo.find({
        where: {client_id: client.id},
        order: {occured_at: 'DESC'}
      })

      const numOfTransactions= transactions.length

      const sum60s = transactions.filter(t => t.occured_at >=days60Ago).reduce((acc, t) => acc + parseFloat(t.amount), 0)

      const last = transactions[0]?.occured_at ?? null

      await this.clientsRepo.update(client.id, {
        last_transaction_at: last,
        total_transaction_count: numOfTransactions,
        total_purchases_60d: sum60s.toFixed(2)
      })

      await this.es.update({
        index: 'clients',
        id: client.id,
        doc: {
          last_transaction_at: last,
          total_transaction_count: numOfTransactions,
          total_purchase_60d: sum60s
        }
      })
    }

    await this.es.indices.refresh({index: 'clients'})
  }
}
