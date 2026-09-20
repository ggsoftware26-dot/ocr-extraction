import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import { ClassificationService } from './classification.service';
import { AnomalyCheckDto } from './dto/anomaly-check.dto';
import { CategorizeDto } from './dto/categorize.dto';

@Controller('v1')
@UseGuards(ApiKeyGuard)
export class ClassificationController {
  constructor(private readonly classification: ClassificationService) {}

  @Post('categorize')
  categorize(@Body() body: CategorizeDto) {
    return this.classification.categorizeSupplier(
      body.supplier_name,
      body.categories,
    );
  }

  @Post('anomaly-check')
  anomalyCheck(@Body() body: AnomalyCheckDto) {
    return this.classification.detectAnomaly(
      body.category_name,
      body.line_items,
    );
  }
}
