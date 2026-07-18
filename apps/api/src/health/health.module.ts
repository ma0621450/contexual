import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { HealthService } from './health.service';

@Module({
  imports: [FilesModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
