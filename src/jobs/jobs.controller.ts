import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../common/api-key.guard';
import { MAX_FILE_BYTES_DEFAULT } from '../common/constants';
import { envNumber } from '../common/env';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

@Controller('v1/jobs')
@UseGuards(ApiKeyGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES_DEFAULT },
    }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: CreateJobDto,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const maxBytes = envNumber(
      this.config,
      'MAX_FILE_BYTES',
      MAX_FILE_BYTES_DEFAULT,
    );
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException(
        `File exceeds max size of ${maxBytes} bytes`,
      );
    }

    return this.jobs.create(file, body.webhook_url);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobs.get(id);
  }
}
