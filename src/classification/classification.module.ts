import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import { ProvidersModule } from '../providers/providers.module';
import { ClassificationController } from './classification.controller';
import { ClassificationService } from './classification.service';

@Module({
  imports: [ProvidersModule],
  controllers: [ClassificationController],
  providers: [ClassificationService, ApiKeyGuard],
})
export class ClassificationModule {}
