import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { OCR_QUEUE } from '../common/constants';
import { envNumber } from '../common/env';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: envNumber(config, 'REDIS_PORT', 6379),
        },
      }),
    }),
    BullModule.registerQueue({
      name: OCR_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 60 * 60 * 24,
          count: 1000,
        },
        removeOnFail: {
          age: 60 * 60 * 24 * 7,
        },
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
