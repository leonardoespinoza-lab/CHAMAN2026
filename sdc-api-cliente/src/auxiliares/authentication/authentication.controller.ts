import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  UseInterceptors,
  NotFoundException,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticationService } from './authentication.service';
import { IToken } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { LoginCacheWarmingInterceptor } from '../cache-warming/login-cache-warming.interceptor';
import {
  assertCookieCsrf,
  clearBrowserSession,
  issueBrowserSession,
  refreshCookie,
  rememberCookie,
  wantsCookieSession,
} from './session-cookie';
import { normalizedLoginOrigin } from './login-origin';

@ApiTags('Authentication')
@Controller('auth')
export class AuthenticationController {
  private logger = new Logger(AuthenticationController.name);

  constructor(private service: AuthenticationService) {}

  @Post('/google-login')
  @UseInterceptors(LoginCacheWarmingInterceptor)
  async googleLogin(
    @Body() body: { credential: string; remember?: boolean },
  ): Promise<IToken> {
    if (process.env.GOOGLE_LOGIN_ENABLED !== 'true') {
      throw new NotFoundException('Login con Google deshabilitado');
    }
    return await this.service.googleLogin(body);
  }

  @Post('/google-login-apple')
  @UseInterceptors(LoginCacheWarmingInterceptor)
  async googleLoginApple(
    @Body() body: { credential: string; remember?: boolean },
  ): Promise<IToken> {
    if (process.env.GOOGLE_LOGIN_ENABLED !== 'true') {
      throw new NotFoundException('Login con Google deshabilitado');
    }
    return await this.service.googleLoginApple(body);
  }

  @Post('/login')
  @UseInterceptors(LoginCacheWarmingInterceptor)
  public async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('username') username: string,
    @Body('password') password: string,
    @Body('remember') remember?: boolean,
  ): Promise<IToken> {
    const token = await this.service.login(
      username,
      password,
      remember,
      normalizedLoginOrigin(req),
    );
    return wantsCookieSession(req)
      ? issueBrowserSession(res, token, !!remember)
      : token;
  }

  @Post('/refresh_token')
  public async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('refresh_token') bodyRefreshToken?: string,
  ): Promise<IToken> {
    const cookieToken = wantsCookieSession(req)
      ? refreshCookie(req)
      : undefined;
    const refreshToken = cookieToken || bodyRefreshToken;
    if (!refreshToken) {
      throw new BadRequestException('No se encontro una sesion renovable');
    }
    if (cookieToken) {
      assertCookieCsrf(req, cookieToken);
    }
    const token = await this.service.refreshToken(refreshToken);
    return cookieToken
      ? issueBrowserSession(res, token, rememberCookie(req))
      : token;
  }

  @Post('/access_token')
  public async accessToken(
    @Body('access_token') access_token: string,
  ): Promise<IToken> {
    return await this.service.accessToken(access_token);
  }

  @Post('/logout')
  public async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authorization?: string,
    @Body('refresh_token') refreshToken?: string,
  ): Promise<{ revoked: true }> {
    const accessToken = authorization?.replace(/^Bearer\s+/i, '');
    const cookieToken = wantsCookieSession(req)
      ? refreshCookie(req)
      : undefined;
    if (cookieToken) {
      assertCookieCsrf(req, cookieToken);
    }
    await this.service.logout(accessToken, cookieToken || refreshToken);
    if (cookieToken) {
      clearBrowserSession(res);
    }
    return { revoked: true };
  }
}
