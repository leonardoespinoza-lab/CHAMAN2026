import { Injectable } from '@nestjs/common';
import { IToken } from 'modelos/src';
import { AxiosService } from '../axios/axios.service';
import { API_AUTH, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET } from '../../env';

@Injectable()
export class AuthenticationRepository {
  constructor(private axios: AxiosService) {}

  private getFormHeaders() {
    const credentials = Buffer.from(
      `${AUTH_CLIENT_ID}:${AUTH_CLIENT_SECRET}`,
    ).toString('base64');

    return {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  async login(
    username: string,
    password: string,
    remember?: boolean,
  ): Promise<IToken> {
    const url = `${API_AUTH}/oauth/login`;
    const headers = this.getFormHeaders();
    const body = new URLSearchParams({
      username,
      password,
      grant_type: 'password',
    });
    if (remember !== undefined) {
      body.set('remember', `${remember}`);
    }
    return await this.axios.POST<IToken>(url, body.toString() as any, {
      headers,
    });
  }

  async refreshToken(refreshToken: string): Promise<IToken> {
    const url = `${API_AUTH}/oauth/login`;
    const headers = this.getFormHeaders();
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return await this.axios.POST<IToken>(url, body.toString() as any, {
      headers,
    });
  }

  async authorization(authorization: string): Promise<IToken> {
    const url = `${API_AUTH}/oauth/authenticate`;
    const headers = {
      authorization: authorization,
      'content-type': 'application/x-www-form-urlencoded',
    };
    return await this.axios.POST<IToken>(url, {}, { headers });
  }

  async logout(accessToken?: string, refreshToken?: string): Promise<void> {
    await this.axios.POST(`${API_AUTH}/oauth/logout`, { accessToken, refreshToken });
  }


  async googleLogin(body: {
    credential: string;
    remember?: boolean;
  }): Promise<IToken> {
    const url = `${API_AUTH}/oauth/google_login`;
    return await this.axios.POST<IToken>(url, body);
  }

  async googleLoginApple(body: {
    credential: string;
    remember?: boolean;
  }): Promise<IToken> {
    const url = `${API_AUTH}/oauth/google_login_apple`;
    return await this.axios.POST<IToken>(url, body);
  }

  async validate_password(
    username: string,
    password: string,
  ): Promise<{ valid: boolean }> {
    const url = `${API_AUTH}/oauth/validate_password`;
    return await this.axios.POST<{ valid: boolean }>(url, {
      username,
      password,
    });
  }
}
