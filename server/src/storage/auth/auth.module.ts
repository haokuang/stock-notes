import { Module, Global } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtGuard } from './jwt.guard'

/**
 * 注册全局 JWT guard
 * 所有路由默认需要 Bearer token
 * 公开路由用 @Public() 装饰器跳过
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
  ],
})
export class AuthModule {}
