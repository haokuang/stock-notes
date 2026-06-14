import { SetMetadata } from '@nestjs/common'

/**
 * 标记一个 controller 方法为公开(跳过 JWT 鉴权)
 * 配合 JwtGuard 全局使用
 */
export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
