import { Client } from '@elastic/elasticsearch';

export async function ensureClientsIndex(es: Client): Promise<void> {
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  const exists = await es.indices.exists({ index: 'clients' });
  if (exists) {
    await es.indices.delete({ index: 'clients' }); // ensure idempotency
  }

  await es.indices.create({
    index: 'clients',
    mappings: {
      properties: {
        name: { type: 'text' }, // to search inside it
        country: { type: 'keyword' }, // use as a category, or for exact searches
        signup_date: { type: 'date' },
        last_transaction_at: { type: 'date' },
        total_transaction_count: { type: 'long' }, // long for whole numbers, doable at our scale
        total_purchases_60d: { type: 'double' },
      },
    },
  });
}
