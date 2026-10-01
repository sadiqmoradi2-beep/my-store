import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthResult, AuthService } from './auth.service';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TotpCodeDto } from './dto/totp-code.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { UpdateUiPrefsDto } from './dto/ui-prefs.dto';

const REFRESH_COOKIE = 'my_store_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register-tenant')
  async registerTenant(
    @Body() dto: RegisterTenantDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withRefreshCookie(res, await this.authService.registerTenant(dto), isMobile(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    if ('requires2fa' in result) return result;
    return this.withRefreshCookie(res, result, isMobile(req));
  }

  /**
   * Web: the token is read from the httpOnly cookie and never exposed in the response.
   * Mobile (no reliable cookie): the token comes from the Authorization header — since
   * the caller already held the raw token value (proof of ownership), returning it
   * in the response is not a new security leak; the web cookie path stays untouched and httpOnly.
   */
  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const bearerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const token = bearerToken || req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('Session not found');
    return this.withRefreshCookie(res, await this.authService.refresh(token), Boolean(bearerToken));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @HttpCode(200)
  @ApiBearerAuth()
  @Post('logout')
  async logout(@CurrentUser() user: RequestUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.userId);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { loggedOut: true };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.authService.me(user.userId);
  }

  @ApiBearerAuth()
  @Patch('me/prefs')
  updatePrefs(@CurrentUser() user: RequestUser, @Body() dto: UpdateUiPrefsDto) {
    return this.authService.updateUiPrefs(user.userId, { ...dto });
  }

  @ApiBearerAuth()
  @Patch('me/email')
  changeEmail(@CurrentUser() user: RequestUser, @Body() dto: ChangeEmailDto) {
    return this.authService.changeEmail(user.userId, dto);
  }

  @ApiBearerAuth()
  @Patch('me/password')
  changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto);
  }

  @ApiBearerAuth()
  @Post('2fa/setup')
  setupTwoFactor(@CurrentUser() user: RequestUser) {
    return this.authService.setupTwoFactor(user.userId);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('2fa/enable')
  enableTwoFactor(@CurrentUser() user: RequestUser, @Body() dto: TotpCodeDto) {
    return this.authService.enableTwoFactor(user.userId, dto.code);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('2fa/disable')
  disableTwoFactor(@CurrentUser() user: RequestUser, @Body() dto: DisableTwoFactorDto) {
    return this.authService.disableTwoFactor(user.userId, dto.code, dto.password);
  }

  private withRefreshCookie(res: Response, result: AuthResult, keepTokenInBody = false) {
    const { refreshToken, ...body } = result;
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_MAX_AGE_MS,
    });
    return keepTokenInBody ? result : body;
  }
}

/** Request from the mobile app — since relying on an httpOnly cookie in React Native isn't reliable */
function isMobile(req: Request): boolean {
  return req.headers['x-client-platform'] === 'mobile';
}
