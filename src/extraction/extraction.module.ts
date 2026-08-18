import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { ExtractionService } from './extraction.service';

@Module({
  imports: [ProvidersModule],
  providers: [ExtractionService],
  exports: [ExtractionService],
})
export class ExtractionModule {}
