import './load-env';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ImapService } from './imap/imap.service';
import { IngestModule } from './ingest.module';

async function bootstrap() {
  const app = await NestFactory.create(IngestModule);
  app.enableShutdownHooks();

  const imap = app.get(ImapService);
  imap.start();

  const port = process.env.INGEST_PORT ?? 3001;
  await app.listen(port);
  Logger.log(`Ingest service listening on ${port}`, 'Bootstrap');
}

void bootstrap();
