import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { IToken } from 'modelos/src';
import { firstValueFrom, Observable } from 'rxjs';
import { API } from '../../environments/environment';
import { HelperService } from '../servicios/helper';

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  public esAdmin = false;
  public esQuimica = false;
  public esDistribuidor = false;
  public esProductor = false;
  public esEstablecimiento = false;

  constructor(
    private http: HttpClient,
    private helper: HelperService
  ) {}

  // LOGIN

  public resetPermisos(): void {
    this.esAdmin = false;
    this.esQuimica = false;
    this.esDistribuidor = false;
    this.esProductor = false;
    this.esEstablecimiento = false;
  }

  public _login(username: string, password: string, remember?: boolean): Observable<IToken> {
    return this.http.post<IToken>(`${API}/auth/login`, {
      username,
      password,
      remember,
    });
  }

  public async login(username: string, password: string, remember = false): Promise<IToken> {
    this.resetPermisos();
    const token = await firstValueFrom(this._login(username, password, remember));
    this.helper.removePermiso();
    this.helper.removeNumeroPermiso();
    this.helper.setToken(token, remember);
    return token;
  }

  public _loginGoogle(idToken: string, remember?: boolean): Observable<IToken> {
    return this.http.post<IToken>(`${API}/auth/google-login`, {
      credential: idToken,
      remember,
    });
  }

  public _loginGoogleApple(idToken: string, remember?: boolean): Observable<IToken> {
    return this.http.post<IToken>(`${API}/auth/google-login-apple`, {
      credential: idToken,
      remember,
    });
  }

  public async loginGoogle(idToken: string, remember = false): Promise<IToken> {
    this.resetPermisos();
    const token = await firstValueFrom(this._loginGoogle(idToken, remember));
    this.helper.removePermiso();
    this.helper.removeNumeroPermiso();
    this.helper.setToken(token, remember);
    return token;
  }

  public async loginGoogleApple(idToken: string, remember = false): Promise<IToken> {
    this.resetPermisos();
    const token = await firstValueFrom(this._loginGoogleApple(idToken, remember));
    this.helper.removePermiso();
    this.helper.removeNumeroPermiso();
    this.helper.setToken(token, remember);
    return token;
  }

  // REFRESH TOKEN

  private _refreshToken(refresh_token: string): Observable<IToken> {
    return this.http.post<IToken>(`${API}/auth/refresh_token`, {
      refresh_token,
    });
  }

  public async refreshToken(): Promise<IToken> {
    const refresh_token = this.helper.refreshToken;
    if (!refresh_token) {
      throw 'No hay refresh token';
    }

    // Determinar si el token actual estaba en localStorage (remember = true)
    const wasRemembered = localStorage.getItem('token') !== null;

    const token = await firstValueFrom(this._refreshToken(refresh_token));
    this.helper.setToken(token, wasRemembered);
    return token!;
    // "Invalid grant: refresh token is invalid"
  }

  // ACCESS TOKEN

  private _accessToken(access_token: string): Observable<IToken> {
    return this.http.post<IToken>(`${API}/auth/access_token`, {
      access_token,
    });
  }

  public async accessToken(ac: string): Promise<IToken> {
    try {
      // Determinar si el token actual estaba en localStorage (remember = true)
      const wasRemembered = localStorage.getItem('token') !== null;

      const token = await firstValueFrom(this._accessToken(ac));
      this.helper.setToken(token, wasRemembered);
      return token!;
    } catch (error) {
      // this.helper.notifError(error);
      throw error;
    }
  }
}
