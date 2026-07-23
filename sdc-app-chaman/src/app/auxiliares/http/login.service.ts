import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { IToken } from 'modelos/src';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { API } from '../../environments/environment';
import { COOKIE_AUTH } from '../../environments/environment';
import { HelperService } from '../servicios/helper';

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  private refreshPromise?: Promise<IToken>;
  private identityTransition = false;
  private authEpoch = 0;
  public esAdmin = false;
  public esTenant = false;
  public esQuimica = false;
  public esDistribuidor = false;
  public esAsesor = false;
  public esProductor = false;
  public esEstablecimiento = false;

  constructor(
    private http: HttpClient,
    private helper: HelperService
  ) {}

  // LOGIN

  public resetPermisos(): void {
    this.esAdmin = false;
    this.esTenant = false;
    this.esQuimica = false;
    this.esDistribuidor = false;
    this.esAsesor = false;
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
    await this.beginIdentityTransition();
    try {
      // Un login siempre comienza desde una identidad local limpia.
      await this.revokeCurrentSession();
      this.clearClientSession();
      const token = await firstValueFrom(this._login(username, password, remember));
      this.helper.setToken(token, remember);
      return token;
    } catch (error) {
      this.clearClientSession();
      throw error;
    } finally {
      this.identityTransition = false;
    }
  }

  // REFRESH TOKEN

  private _refreshToken(refresh_token?: string): Observable<IToken> {
    return this.http.post<IToken>(`${API}/auth/refresh_token`, {
      ...(refresh_token ? { refresh_token } : {}),
    });
  }

  public async refreshToken(): Promise<IToken> {
    if (this.identityTransition) {
      throw new Error('Cambio de identidad en curso');
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.performRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async performRefresh(): Promise<IToken> {
    const refreshEpoch = this.authEpoch;
    const refresh_token = this.helper.refreshToken;
    if (!COOKIE_AUTH && !refresh_token) {
      throw 'No hay refresh token';
    }

    // Determinar si el token actual estaba en localStorage (remember = true)
    const wasRemembered = localStorage.getItem('token') !== null;

    const token = await firstValueFrom(
      this._refreshToken(refresh_token).pipe(timeout({ first: 8000 }))
    );
    if (this.identityTransition || refreshEpoch !== this.authEpoch) {
      throw new Error('Respuesta de refresh descartada por cambio de identidad');
    }
    this.helper.setToken(token, wasRemembered);
    return token!;
    // "Invalid grant: refresh token is invalid"
  }

  public async logout(): Promise<void> {
    await this.beginIdentityTransition();
    try {
      await this.revokeCurrentSession();
    } finally {
      this.clearClientSession();
      this.identityTransition = false;
    }
  }

  private async beginIdentityTransition(): Promise<void> {
    if (this.identityTransition) {
      throw new Error('Ya hay un cambio de identidad en curso');
    }
    this.identityTransition = true;
    this.authEpoch += 1;

    // Invalida y espera cualquier refresh anterior antes de emitir un
    // login/logout nuevo, para que una respuesta tardía no restaure al usuario
    // anterior.
    const pendingRefresh = this.refreshPromise;
    if (pendingRefresh) {
      try {
        await pendingRefresh;
      } catch {
        // La respuesta fue descartada por el cambio de epoch.
      }
    }
  }

  private async revokeCurrentSession(): Promise<void> {
    const hadClientSession =
      !!this.helper.token ||
      !!this.helper.permiso ||
      this.helper.numeroPermiso !== null;

    if (!hadClientSession) {
      return;
    }

    const refresh_token = this.helper.refreshToken;
    try {
      // firstValueFrom suscribe inmediatamente la solicitud: el interceptor
      // alcanza a adjuntar CSRF/access antes de limpiar el marcador local.
      const revocation = firstValueFrom(
        this.http.post(`${API}/auth/logout`, {
          ...(!COOKIE_AUTH && refresh_token ? { refresh_token } : {}),
        }).pipe(timeout({ first: 5000 }))
      );
      this.clearClientSession();
      await revocation;
    } catch {
      // La revocación remota es best effort. La limpieza local es obligatoria.
    } finally {
      this.clearClientSession();
    }
  }

  private clearClientSession(): void {
    this.resetPermisos();
    this.helper.removeToken();
    this.helper.removePermiso();
    this.helper.removeNumeroPermiso();
  }

  public get sessionEpoch(): number {
    return this.authEpoch;
  }

  public get isChangingIdentity(): boolean {
    return this.identityTransition;
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
