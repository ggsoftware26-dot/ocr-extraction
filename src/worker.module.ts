import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExtractionModule } from './extraction/extraction.module';
import { ProvidersModule } from './providers/providers.module';
import { OcrProcessor } from './queue/ocr.processor';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    QueueModule,
    ProvidersModule,
    ExtractionModule,
  ],
  providers: [OcrProcessor],
})
export class WorkerModule {}
