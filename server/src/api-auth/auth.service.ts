import { Inject, Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common'
import { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_CLIENT } from '../storage/database/database.module'

export interface SignUpResult {
  user: { id: string; email: string }
  access_token: string
  refresh_token: string
  expires_in: number
}

export interface SignInResult extends SignUpResult {}

export interface MeResult {
  user: { id: string; email: string }
}

/**
 * Auth service — 全部走 Supabase Auth API
 * 1. signUp:    邮箱+密码注册 → 立即返回 session(项目开启了 auto-confirm 的话)
 * 2. signIn:    邮箱+密码登录 → 返回 access_token / refresh_token
 * 3. me:        从 JWT 拿当前 user(由 controller 用 req.user 转发,这里只是个 wrapper)
 */
@Injectable()
export class AuthService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async signUp(email: string, password: string): Promise<SignUpResult> {
    if (!email || !password) throw new BadRequestException('email and password are required')
    if (password.length < 6) throw new BadRequestException('password must be at least 6 characters')

    const { data, error } = await this.supabase.auth.signUp({ email, password })
    if (error) {
      if (error.status === 422 || /already registered/i.test(error.message)) {
        throw new ConflictException(`User already registered: ${email}`)
      }
      throw new BadRequestException(`signUp failed: ${error.message}`)
    }
    if (!data.user) throw new BadRequestException('signUp returned no user')
    if (!data.session) {
      throw new BadRequestException(
        'signUp succeeded but no session returned. ' +
          'Enable "Auto Confirm User" in Supabase Dashboard → Auth → Providers, or check the user email for confirmation link.',
      )
    }

    return {
      user: { id: data.user.id, email: data.user.email ?? email },
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in ?? 3600,
    }
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    if (!email || !password) throw new BadRequestException('email and password are required')

    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password })
    if (error || !data?.session) {
      throw new UnauthorizedException(`Invalid credentials: ${error?.message ?? 'unknown'}`)
    }

    return {
      user: { id: data.user.id, email: data.user.email ?? email },
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in ?? 3600,
    }
  }

  me(uid: string, email?: string): MeResult {
    return { user: { id: uid, email: email ?? '' } }
  }
}
