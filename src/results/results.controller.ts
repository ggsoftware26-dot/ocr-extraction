import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiKeyGuard } from '../common/api-key.guard';
import { ResultsService } from './results.service';

@Controller('v1/results')
@UseGuards(ApiKeyGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get()
  list(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.results.list(limit ?? 50);
  }

  @Get(':id/preview')
  async preview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const preview = await this.results.getPreview(id);
    res.setHeader('Content-Type', preview.contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(preview.name)}"`,
    );
    res.send(preview.body);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.results.get(id);
  }
}
