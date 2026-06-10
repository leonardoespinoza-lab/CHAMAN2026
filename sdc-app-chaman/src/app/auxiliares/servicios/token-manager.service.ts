import { Injectable } from '@angular/core';
import { IToken } from 'modelos/src';
import { LoginService } from '../http/login.service';
import { HelperService } from '../servicios/helper';

@Injectable({
  providedIn: 'root',
})
export class TokenManagerService {
  private refreshTimer: any;
  private readonly REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutos antes de expirar

  constructor(
    private helper: HelperService,
    private loginService: LoginService
  ) {
    this.startTokenMonitoring();
  }

  /**
   * Inicia el monitoreo del token para refresh automático
   */
  private startTokenMonitoring(): void {
    // Verificar cada minuto si el token necesita refresh
    setInterval(() => {
      this.checkTokenExpiry();
    }, 60 * 1000); // 1 minuto
  }

  /**
   * Verifica si el token necesita ser refrescado
   */
  private checkTokenExpiry(): void {
    const token = this.helper.token;
    if (!token || !token.accessTokenExpiresAt) {
      return;
    }

    const expiryTime = new Date(token.accessTokenExpiresAt).getTime();
    const currentTime = new Date().getTime();
    const timeUntilExpiry = expiryTime - currentTime;

    // Si falta poco para expirar y tenemos refresh token, renovar
    if (timeUntilExpiry <= this.REFRESH_THRESHOLD && token.refreshToken) {
      this.refreshTokenProactively();
    }
  }

  /**
   * Refresca el token de manera proactiva
   */
  private async refreshTokenProactively(): Promise<void> {
    try {
      await this.loginService.refreshToken();
    } catch (error) {
      // No hacer nada aquí, el interceptor manejará el error cuando sea necesario
    }
  }

  /**
   * Fuerza un refresh del token
   */
  public async forceRefresh(): Promise<IToken | null> {
    try {
      return await this.loginService.refreshToken();
    } catch (error) {
      return null;
    }
  }

  /**
   * Obtiene información sobre el estado del token
   */
  public getTokenInfo(): {
    hasToken: boolean;
    hasRefreshToken: boolean;
    isExpired: boolean;
    timeUntilExpiry: number | null;
    expiresAt: string | null;
    refreshExpiresAt: string | null;
    storageType: string;
    rawToken: any;
  } {
    const token = this.helper.token;
    const storageType = localStorage.getItem('token')
      ? 'localStorage (remember=true)'
      : sessionStorage.getItem('token')
        ? 'sessionStorage (remember=false)'
        : 'ninguno';

    if (!token) {
      return {
        hasToken: false,
        hasRefreshToken: false,
        isExpired: true,
        timeUntilExpiry: null,
        expiresAt: null,
        refreshExpiresAt: null,
        storageType,
        rawToken: null,
      };
    }

    const expiryTime = token.accessTokenExpiresAt ? new Date(token.accessTokenExpiresAt).getTime() : null;
    const currentTime = new Date().getTime();
    const timeUntilExpiry = expiryTime ? expiryTime - currentTime : null;
    const isExpired = timeUntilExpiry ? timeUntilExpiry <= 0 : true;

    return {
      hasToken: true,
      hasRefreshToken: !!token.refreshToken,
      isExpired,
      timeUntilExpiry,
      expiresAt: token.accessTokenExpiresAt || null,
      refreshExpiresAt: token.refreshTokenExpiresAt || null,
      storageType,
      rawToken: token,
    };
  }

  /**
   * Limpia todos los timers
   */
  public cleanup(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
