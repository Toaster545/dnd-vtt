import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService, type AuthClientType } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() @MinLength(3) username: string;
}

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
  @IsOptional() @IsIn(['web', 'native']) client_type?: AuthClientType;
}

class RefreshDto {
  @IsOptional() @IsString() refresh_token?: string;
}

const REFRESH_COOKIE = 'dnd_refresh_token';
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.username);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      dto.email,
      dto.password,
      dto.client_type ?? 'web',
    );
    return this.deliverRefreshCredential(result, response);
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = dto.refresh_token ?? this.cookie(request, REFRESH_COOKIE);
    const result = await this.auth.refresh(token ?? '');
    return this.deliverRefreshCredential(result, response);
  }

  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = dto.refresh_token ?? this.cookie(request, REFRESH_COOKIE);
    const result = await this.auth.logout(token);
    response.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return result;
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@CurrentUser() user: RequestUser) {
    return this.auth.getProfile(user.id);
  }

  private deliverRefreshCredential(
    result:
      | Awaited<ReturnType<AuthService['login']>>
      | Awaited<ReturnType<AuthService['refresh']>>,
    response: Response,
  ) {
    if (result.client_type === 'native') return result;
    response.cookie(REFRESH_COOKIE, result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: REFRESH_MAX_AGE_MS,
    });
    return {
      access_token: result.access_token,
      refresh_expires_at: result.refresh_expires_at,
      client_type: result.client_type,
      profile: result.profile,
    };
  }

  private cookie(request: Request, name: string): string | undefined {
    const header = request.headers.cookie;
    if (!header) return undefined;
    for (const pair of header.split(';')) {
      const [key, ...value] = pair.trim().split('=');
      if (key === name) return decodeURIComponent(value.join('='));
    }
    return undefined;
  }
}
