import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { SupabaseClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  SUPABASE_CLIENT,
  SUPABASE_ANON_CLIENT,
  DRIZZLE_DB,
} from '../storage/database/database.module'
import * as schema from '../storage/database/shared/schema'
import type { SignInResult } from './auth.service'

/** 微信 code2session 接口返回结构 */
interface Code2SessionResponse {
  openid?: string
  session_key?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

/** 微信登录返回的 Session — 与邮箱登录一致,前端可直接 sessionStore.set() */
export interface WechatProfileResult {
  nickname: string | null
  avatar_url: string | null
}

export interface UpdateWechatProfileInput {
  nickname?: string
  avatar_url?: string
}

export interface UpdateWechatProfileResult extends WechatProfileResult {}

/**
 * 微信小程序登录服务
 *
 * 链路:Taro.login() → code → code2session(openid) →
 *   查/建 Supabase 用户(service-role admin API) →
 *   generateLink(magiclink) → anon.verifyOtp → 标准 Supabase Session
 *
 * 返回的 access_token 是标准 Supabase JWT,JwtGuard 验签零改动。
 */
@Injectable()
export class WechatAuthService {
  private readonly logger = new Logger(WechatAuthService.name)

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly adminClient: SupabaseClient,
    @Inject(SUPABASE_ANON_CLIENT) private readonly anonClient: SupabaseClient,
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** POST /api/auth/wechat-login — 用 wx.login code 换取标准 Session */
  async loginWithCode(code: string): Promise<SignInResult> {
    if (!code) throw new BadRequestException('code is required')

    // 1. code2session → openid
    const { openid, unionid } = await this.code2session(code)

    // 2. 查/建 Supabase 用户
    const email = this.buildVirtualEmail(openid)
    const userId = await this.findOrCreateUser(openid, unionid, email)

    // 3. generateLink + verifyOtp → session
    const session = await this.exchangeSession(email)
    this.logger.log(`WeChat login success: openid=${openid.slice(0, 8)}… userId=${userId}`)

    return session
  }

  /** GET /api/auth/wechat-profile — 获取微信头像昵称 */
  async getProfile(userId: string): Promise<WechatProfileResult> {
    const rows = await this.db
      .select({
        nickname: schema.wechatAccounts.nickname,
        avatar_url: schema.wechatAccounts.avatar_url,
      })
      .from(schema.wechatAccounts)
      .where(eq(schema.wechatAccounts.user_id, userId))
      .limit(1)

    const account = rows[0]
    return {
      nickname: account?.nickname ?? null,
      avatar_url: account?.avatar_url ?? null,
    }
  }

  /** POST /api/auth/wechat-profile — 更新微信头像昵称 */
  async updateProfile(
    userId: string,
    input: UpdateWechatProfileInput,
  ): Promise<UpdateWechatProfileResult> {
    const patch: Record<string, string> = {}
    if (input.nickname !== undefined) patch.nickname = input.nickname
    if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url

    if (Object.keys(patch).length === 0) {
      return this.getProfile(userId)
    }

    const updated = await this.db
      .update(schema.wechatAccounts)
      .set(patch)
      .where(eq(schema.wechatAccounts.user_id, userId))
      .returning({
        nickname: schema.wechatAccounts.nickname,
        avatar_url: schema.wechatAccounts.avatar_url,
      })

    const account = updated[0]
    return {
      nickname: account?.nickname ?? null,
      avatar_url: account?.avatar_url ?? null,
    }
  }

  // ────────────────────────────────────────────────────────────
  //  内部方法
  // ────────────────────────────────────────────────────────────

  /** 调微信 code2session 接口,用 js_code 换 openid */
  private async code2session(code: string): Promise<{
    openid: string
    unionid?: string
  }> {
    const appid = process.env.WECHAT_APPID
    const secret = process.env.WECHAT_SECRET
    if (!appid || !secret) {
      throw new InternalServerErrorException(
        'WECHAT_APPID / WECHAT_SECRET not configured',
      )
    }

    const url =
      `https://api.weixin.qq.com/sns/jscode2session` +
      `?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}` +
      `&grant_type=authorization_code`

    let res: Code2SessionResponse
    try {
      const raw = await fetch(url, { method: 'GET' })
      res = (await raw.json()) as Code2SessionResponse
    } catch (e: any) {
      throw new UnauthorizedException(
        `WeChat code2session request failed: ${e?.message ?? 'unknown'}`,
      )
    }

    if (res.errcode || !res.openid) {
      throw new UnauthorizedException(
        `WeChat code2session failed: [${res.errcode ?? 'no-errcode'}] ${res.errmsg ?? 'no openid returned'}`,
      )
    }

    return { openid: res.openid, unionid: res.unionid }
  }

  /** 查 wechat_accounts;不存在则建 Supabase 用户 + 绑定记录 */
  private async findOrCreateUser(
    openid: string,
    unionid: string | undefined,
    email: string,
  ): Promise<string> {
    // 查已有绑定
    const existing = await this.db
      .select({ user_id: schema.wechatAccounts.user_id })
      .from(schema.wechatAccounts)
      .where(eq(schema.wechatAccounts.openid, openid))
      .limit(1)

    if (existing[0]?.user_id) {
      return existing[0].user_id
    }

    // 首次登录:用 admin API 建 Supabase 用户(email_confirm 直接跳过邮箱验证)
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    if (error || !data?.user) {
      // 并发情况下可能用户已被另一个请求创建,尝试查一次
      const retry = await this.db
        .select({ user_id: schema.wechatAccounts.user_id })
        .from(schema.wechatAccounts)
        .where(eq(schema.wechatAccounts.openid, openid))
        .limit(1)
      if (retry[0]?.user_id) return retry[0].user_id

      throw new InternalServerErrorException(
        `Supabase createUser failed: ${error?.message ?? 'unknown'}`,
      )
    }

    // 插入绑定记录
    try {
      await this.db.insert(schema.wechatAccounts).values({
        user_id: data.user.id,
        openid,
        unionid: unionid ?? null,
      })
    } catch (e: any) {
      // 并发重复插入兜底:再次查询
      const retry = await this.db
        .select({ user_id: schema.wechatAccounts.user_id })
        .from(schema.wechatAccounts)
        .where(eq(schema.wechatAccounts.openid, openid))
        .limit(1)
      if (retry[0]?.user_id) return retry[0].user_id
      throw new InternalServerErrorException(
        `Insert wechat_accounts failed: ${e?.message ?? 'unknown'}`,
      )
    }

    return data.user.id
  }

  /**
   * 无密码登录链路:
   * 1. service-role generateLink(type=magiclink) → properties.hashed_token
   * 2. anon verifyOtp(token_hash, type=magiclink) → { session, user }
   *
   * verifyOtp 必须用 anon 客户端(service-role 无法换出 session)。
   */
  private async exchangeSession(email: string): Promise<SignInResult> {
    // Step 1: generateLink
    const { data: linkData, error: linkError } =
      await this.adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })
    if (linkError || !linkData?.properties?.hashed_token) {
      throw new InternalServerErrorException(
        `generateLink failed: ${linkError?.message ?? 'no hashed_token'}`,
      )
    }

    // Step 2: verifyOtp (anon)
    const { data: otpData, error: otpError } =
      await this.anonClient.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
      })
    if (otpError || !otpData?.session || !otpData?.user) {
      throw new UnauthorizedException(
        `verifyOtp failed: ${otpError?.message ?? 'no session returned'}`,
      )
    }

    return {
      user: {
        id: otpData.user.id,
        email: otpData.user.email ?? email,
      },
      access_token: otpData.session.access_token,
      refresh_token: otpData.session.refresh_token,
      expires_in: otpData.session.expires_in ?? 3600,
    }
  }

  /** 虚拟邮箱:wx_${openid}@wechat.local(永不发邮件,仅作 Supabase 用户标识) */
  private buildVirtualEmail(openid: string): string {
    return `wx_${openid}@wechat.local`
  }
}
