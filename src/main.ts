import './load-env';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const viewsPath =
    process.env.NODE_ENV === 'production'
      ? join(__dirname, 'views')
      : join(process.cwd(), 'src', 'views');
  app.useStaticAssets(viewsPath, { prefix: '/views' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`OCR API listening on ${port}`, 'Bootstrap');
}

void bootstrap();
