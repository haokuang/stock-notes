import { Body, Controller, Post, Get, HttpCode } from '@nestjs/common'
import { IsEmail, IsString, MinLength } from 'class-validator'
import { AuthService } from './auth.service'
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

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

  @Get('me')
  me(@CurrentUser() user: { id: string; email: string }) {
    return { data: this.auth.me(user.id, user.email) }
  }
}
