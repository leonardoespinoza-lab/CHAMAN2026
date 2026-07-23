import { Body, Controller, Logger, NotFoundException, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { ILogin } from './login.dto';
import { OauthService } from './oauth.service';

@Controller('oauth')
export class OauthController {
  constructor(private service: OauthService) {}

  @Post('/google_login')
  async googleLogin(@Body() body: { credential: string; remember?: boolean }) {
    if (process.env.GOOGLE_LOGIN_ENABLED !== 'true') {
      throw new NotFoundException('Login con Google deshabilitado');
    }
    return await this.service.googleLogin(body?.credential, body?.remember);
  }

  @Post('/google_login_apple')
  async googleLoginApple(
    @Body() body: { credential: string; remember?: boolean },
  ) {
    if (process.env.GOOGLE_LOGIN_ENABLED !== 'true') {
      throw new NotFoundException('Login con Google deshabilitado');
    }
    Logger.debug(`Logueando con apple`);
    return await this.service.googleLoginApple(
      body?.credential,
      body?.remember,
    );
  }

  @Post('/login')
  async login(@Req() req: Request, @Res() res: Response, @Body() body: ILogin) {
    const token = await this.service.login(req, res, body);
    res.json(token);
  }

  @Post('/authenticate')
  async authenticate(@Req() req: Request, @Res() res: Response) {
    const token = await this.service.authenticate(req, res);
    res.json(token);
  }

  @Post('/logout')
  async logout(
    @Body('accessToken') accessToken?: string,
    @Body('refreshToken') refreshToken?: string,
  ) {
    return { revoked: await this.service.logout(accessToken, refreshToken) };
  }

  @Post('/validate_password')
  async validate_password(
    @Req() req: Request,
    @Body('username') username: string,
    @Body('password') password: string,
  ) {
    const valid = await this.service.validate_password(
      username,
      password,
      req,
    );
    return { valid };
  }
}
