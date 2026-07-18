import { Module } from '@nestjs/common';
import { ClamAvService } from './clamav.service';
import { DocumentExtractorService } from './document-extractor.service';
import { FileProcessingWorkerService } from './file-processing-worker.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    StorageService,
    ClamAvService,
    DocumentExtractorService,
    FileProcessingWorkerService,
  ],
  exports: [
    FilesService,
    FileProcessingWorkerService,
    ClamAvService,
    StorageService,
  ],
})
export class FilesModule {}
