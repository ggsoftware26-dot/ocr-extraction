import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  controllers: [ResultsController],
  providers: [ResultsService, ApiKeyGuard],
})
export class ResultsModule {}
