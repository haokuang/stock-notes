import { ExecutionContext, InternalServerErrorException } from '@nestjs/common'

/**
 * 从当前请求上下文读取 user_id。
 * JwtGuard 已经在 req.user 上挂了 { id, email, jwt }。
 *
 * 兜底(无 JWT,例如未来 @Public 路由也想拿到默认用户):
 *   - 读 process.env.DEFAULT_USER_ID
 *
 * 后续如果需要"多请求共享 user"模式(例如后台 cron),
 * 直接传 uid 给 service 即可,不需要经过这里。
 */
export function getUserIdFromRequest(ctx: ExecutionContext): string {
  const req = ctx.switchToHttp().getRequest()
  if (req.user?.id) return req.user.id as string

  const fallback = process.env.DEFAULT_USER_ID
  if (fallback) return fallback

  throw new InternalServerErrorException(
    'No user identity available. Either send Authorization: Bearer <jwt> or set DEFAULT_USER_ID in .env.',
  )
}
