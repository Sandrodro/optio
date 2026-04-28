import { Global, Module, OnApplicationShutdown, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        const url = process.env.REDIS_URL;
        if (!url) throw new Error('redis url not found');
        const client = new Redis(url);
        const log = new Logger('REDIS');
        client.on('connect', () => log.log(`connected to ${url}`));
        client.on('error', (err) => log.error(err.message));
        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule implements OnApplicationShutdown {
  constructor() {}
  async onApplicationShutdown() {}
}
