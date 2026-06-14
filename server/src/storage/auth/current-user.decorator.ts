import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/**
 * @CurrentUser() 装饰器 — 从 req.user 拿 JWT 解析出来的用户信息
 * 用法:
 *   async handler(@CurrentUser() user: { id: string; email: string }) { ... }
 *   async handler(@CurrentUser('id') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest()
    const user = req.user
    if (!user) return undefined
    return field ? user[field] : user
  },
)
