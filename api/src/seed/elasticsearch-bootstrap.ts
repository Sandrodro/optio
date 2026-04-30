import { Client } from '@elastic/elasticsearch';

export async function ensureClientsIndex(es: Client): Promise<void> {
  const exists = await es.indices.exists({ index: 'clients' });
  if (exists) {
    await es.indices.delete({ index: 'clients' }); // ensure idempotency
  }

  await es.indices.create({
    index: 'clients',
    mappings: {
      properties: {
        country: { type: 'keyword' },
        signup_date: { type: 'date' },
        last_transaction_at: { type: 'date' },
        total_transaction_count: { type: 'long' },
        total_purchases_60d: { type: 'double' },
      },
    },
  });
}
