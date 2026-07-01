import {
  Controller,
  Post,
  Body,
  Logger,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import { IToken } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { LoginCacheWarmingInterceptor } from '../cache-warming/login-cache-warming.interceptor';

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
    @Body('username') username: string,
    @Body('password') password: string,
    @Body('remember') remember?: boolean,
  ): Promise<IToken> {
    return await this.service.login(username, password, remember);
  }

  @Post('/refresh_token')
  @UseInterceptors(LoginCacheWarmingInterceptor)
  public async refreshToken(
    @Body('refresh_token') refresh_token: string,
  ): Promise<IToken> {
    return await this.service.refreshToken(refresh_token);
  }

  @Post('/access_token')
  public async accessToken(
    @Body('access_token') access_token: string,
  ): Promise<IToken> {
    return await this.service.accessToken(access_token);
  }
}
