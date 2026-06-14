import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { IS_PUBLIC_KEY } from './public.decorator'

/**
 * 全局 JWT 鉴权 guard
 * 1. 读取 Authorization: Bearer <jwt>
 * 2. 用 Supabase auth.getUser(jwt) 验签 + 拿 user
 * 3. 把 user 挂到 req.user,下游 controller/service 可通过 @CurrentUser() 装饰器拿到
 * 4. @Public() 装饰的方法跳过
 */
@Injectable()
export class JwtGuard implements CanActivate {
  private client: SupabaseClient

  constructor(private reflector: Reflector) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — JwtGuard cannot initialize')
    }
    this.client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isPublic) return true

    const req = ctx.switchToHttp().getRequest()
    const auth = req.headers['authorization'] || req.headers['Authorization']
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Authorization header')
    }
    const jwt = auth.slice(7).trim()
    if (!jwt) throw new UnauthorizedException('Empty bearer token')

    const { data, error } = await this.client.auth.getUser(jwt)
    if (error || !data?.user) {
      throw new UnauthorizedException(`Invalid or expired token: ${error?.message ?? 'unknown'}`)
    }

    req.user = { id: data.user.id, email: data.user.email, jwt }
    return true
  }
}
