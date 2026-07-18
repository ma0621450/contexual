import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveOrg } from '../common/decorators/active-org.decorator';
import { CreateTextFileDto } from './dto/files.dto';
import { FilesService } from './files.service';

type UploadedFilePayload = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  list(@ActiveOrg() organizationId: string) {
    return this.filesService.list(organizationId);
  }

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10_000_000 } }),
  )
  upload(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: UploadedFilePayload,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload');
    return this.filesService.createUpload(organizationId, user.id, file);
  }

  @Post('text')
  @HttpCode(HttpStatus.ACCEPTED)
  createText(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTextFileDto,
  ) {
    return this.filesService.createText(
      organizationId,
      user.id,
      dto.filename,
      dto.content,
    );
  }

  @Get(':id')
  detail(@ActiveOrg() organizationId: string, @Param('id') fileId: string) {
    return this.filesService.getDetail(organizationId, fileId);
  }

  @Get(':id/download')
  async download(
    @ActiveOrg() organizationId: string,
    @Param('id') fileId: string,
    @Res() res: Response,
  ) {
    const { file, body } = await this.filesService.download(
      organizationId,
      fileId,
    );
    res.setHeader('Content-Type', file.detectedMimeType ?? file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.send(body);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') fileId: string,
  ) {
    return this.filesService.remove(organizationId, user, fileId);
  }
}
