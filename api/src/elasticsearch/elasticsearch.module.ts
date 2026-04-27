import { Global, Module } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

@Global()
@Module({
  providers: [
    {
      provide: 'ES_CLIENT',
      useFactory: () =>
        new Client({
          node: process.env.ELASTICSEARCH_NODE || 'http://elasticsearch:9200',
        }),
    },
  ],
  exports: ['ES_CLIENT'],
})
export class ElasticsearchModule {}
