import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OcrClientService } from './ocr-client.service';

@Module({
  imports: [ConfigModule],
  providers: [OcrClientService],
  exports: [OcrClientService],
})
export class OcrClientModule {}
