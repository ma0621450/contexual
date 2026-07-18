import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateRuntimeConfig } from './config/runtime-config';
import { FileProcessingWorkerService } from './files/file-processing-worker.service';
import { EmailOutboxProcessorService } from './mail/email-outbox-processor.service';

async function bootstrap() {
  validateRuntimeConfig();
  const app = await NestFactory.createApplicationContext(AppModule);
  const fileWorker = app.get(FileProcessingWorkerService);
  const emailWorker = app.get(EmailOutboxProcessorService);
  const shutdown = () => {
    fileWorker.stop();
    emailWorker.stop();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    await Promise.all([fileWorker.run(), emailWorker.run()]);
  } finally {
    await app.close();
  }
}

void bootstrap();
