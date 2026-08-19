import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, ApiKeyGuard],
})
export class JobsModule {}
