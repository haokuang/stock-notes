import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { WechatAuthService } from './wechat-auth.service'

@Module({
  controllers: [AuthController],
  providers: [AuthService, WechatAuthService],
  exports: [AuthService, WechatAuthService],
})
export class ApiAuthModule {}
