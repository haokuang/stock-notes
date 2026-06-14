import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { S3Storage } from 'coze-coding-dev-sdk'
import { getStorageConfig } from './storage-config'

export interface UploadedImage {
  buffer: Buffer
  mimetype: string
  originalname: string
  size: number
}

@Injectable()
export class StorageService {
  private readonly storage: S3Storage | null

  constructor() {
    const config = getStorageConfig(process.env)
    this.storage = config ? new S3Storage(config) : null
  }

  isConfigured() {
    return Boolean(this.storage)
  }

  async uploadImage(file: UploadedImage, userId: string) {
    if (!file) throw new BadRequestException('file 必填')
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('仅支持图片文件')
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('图片不能超过 10MB')
    }
    if (!this.storage) {
      throw new ServiceUnavailableException('TOS 对象存储未配置')
    }

    const extension = file.originalname.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ''
    const fileName = `images/${userId}/${Date.now()}-${randomUUID()}${extension}`
    const url = await this.storage.uploadFile({
      fileContent: file.buffer,
      fileName,
      contentType: file.mimetype,
    })

    return { url, key: fileName }
  }
}
