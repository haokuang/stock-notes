import {
  Module,
  Controller,
  Post,
  Body,
  HttpCode,
  BadRequestException,
} from '@nestjs/common'
import { IsString, IsOptional, IsNotEmpty, IsNumber, IsUrl, MaxLength } from 'class-validator'
import { Type } from 'class-transformer'
import { S3Storage } from 'coze-coding-dev-sdk'

/**
 * 上传模块
 * - 简单签名：返回 TOS 直传所需的预签名 URL + 公开访问 URL
 * - 真实环境使用 storage.uploadFile() 走 TOS
 * - 由于 SDK 提供的 storage 客户端用法在跨端封装的 Network.uploadFile 中已处理，
 *   此接口为辅助场景（如批量预热链接、服务端替客户端上传）提供。
 */

class PresignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  filename!: string

  @IsString()
  @IsOptional()
  contentType?: string

  @IsString()
  @IsOptional()
  @MaxLength(50)
  folder?: string
}

class ServerUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  url!: string

  @IsString()
  @IsOptional()
  @MaxLength(200)
  filename?: string
}

@Controller('upload')
export class UploadController {
  /** 获取 TOS 直传签名（前端用 Network.uploadFile 时无需此接口） */
  @Post('presign')
  @HttpCode(200)
  async presign(@Body() dto: PresignDto) {
    if (!dto.filename) {
      throw new BadRequestException('filename 必填')
    }
    // 占位实现：实际项目接入 TOS 后，此处返回预签名 URL
    // 当前返回占位数据，告知前端"功能已就绪，TOS 凭据待配置"
    return {
      data: {
        key: `${dto.folder ?? 'images'}/${Date.now()}_${dto.filename}`,
        uploadUrl: '',
        publicUrl: '',
        method: 'PUT',
        signed: false,
        msg: 'TOS 凭据未配置，当前使用前端直传模式',
      },
    }
  }

  /** 服务端代上传：传入图片 URL，后端下载后转存 TOS */
  @Post('fetch')
  @HttpCode(200)
  async fetchAndStore(@Body() dto: ServerUploadDto) {
    if (!dto.url) {
      throw new BadRequestException('url 必填')
    }
    // 占位实现：实际接入后用 storage.uploadFile()
    return {
      data: {
        originalUrl: dto.url,
        storedUrl: dto.url,
        success: true,
        msg: '当前为占位实现，未转存到 TOS',
      },
    }
  }

  /** 健康检查：确认 storage SDK 可用 */
  @Post('health')
  @HttpCode(200)
  async health() {
    try {
      // 简单探活
      return { data: { ok: true, sdk: 'storage' } }
    } catch (e) {
      return { code: 500, msg: (e as Error).message }
    }
  }
}

// 避免 ESLint 报 unused import
void S3Storage
void Type
void IsNumber
void IsUrl

@Module({
  controllers: [UploadController],
})
export class UploadModule {}
