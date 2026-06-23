import { Body, Controller, Post, Get, HttpCode } from '@nestjs/common'
import { IsEmail, IsString, MinLength, IsOptional, MaxLength } from 'class-validator'
import { AuthService } from './auth.service'
import { WechatAuthService } from './wechat-auth.service'
import { Public } from '../storage/auth/public.decorator'
import { CurrentUser } from '../storage/auth/current-user.decorator'

class CredentialsDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(6)
  password!: string
}

class RefreshTokenDto {
  @IsString()
  @MinLength(1)
  refresh_token!: string
}

class WechatLoginDto {
  @IsString()
  @MinLength(1)
  code!: string
}

class WechatProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  nickname?: string

  @IsString()
  @IsOptional()
  @MaxLength(500)
  avatar_url?: string
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly wechatAuth: WechatAuthService,
  ) {}

  @Public()
  @Post('sign-up')
  @HttpCode(200)
  async signUp(@Body() dto: CredentialsDto) {
    const data = await this.auth.signUp(dto.email, dto.password)
    return { data }
  }

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  async signIn(@Body() dto: CredentialsDto) {
    const data = await this.auth.signIn(dto.email, dto.password)
    return { data }
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshTokenDto) {
    return { data: await this.auth.refresh(dto.refresh_token) }
  }

  @Public()
  @Post('wechat-login')
  @HttpCode(200)
  async wechatLogin(@Body() dto: WechatLoginDto) {
    return { data: await this.wechatAuth.loginWithCode(dto.code) }
  }

  @Get('wechat-profile')
  wechatProfile(@CurrentUser('id') userId: string) {
    return { data: this.wechatAuth.getProfile(userId) }
  }

  @Post('wechat-profile')
  @HttpCode(200)
  async updateWechatProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: WechatProfileDto,
  ) {
    return { data: await this.wechatAuth.updateProfile(userId, dto) }
  }

  @Get('me')
  me(@CurrentUser() user: { id: string; email: string }) {
    return { data: this.auth.me(user.id, user.email) }
  }
}
