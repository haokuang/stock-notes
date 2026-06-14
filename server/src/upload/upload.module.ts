import {
  Controller,
  Get,
  HttpCode,
  Module,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { CurrentUser } from '../storage/auth/current-user.decorator'
import { StorageService, UploadedImage } from './storage.service'

@Controller('upload')
export class UploadController {
  constructor(private readonly storageService: StorageService) {}

  @Post('image')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadImage(
    @UploadedFile() file: UploadedImage,
    @CurrentUser('id') userId: string,
  ) {
    return { data: await this.storageService.uploadImage(file, userId) }
  }

  @Get('health')
  @HttpCode(200)
  health() {
    return {
      data: {
        ok: this.storageService.isConfigured(),
        provider: 'tos',
        configured: this.storageService.isConfigured(),
      },
    }
  }
}

@Module({
  controllers: [UploadController],
  providers: [StorageService],
  exports: [StorageService],
})
export class UploadModule {}
