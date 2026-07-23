import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { IToken } from 'modelos/src';
import { LoginService } from '../http/login.service';
import { HelperService } from '../servicios/helper';

@Injectable({
  providedIn: 'root',
})
export class TokenManagerService {
  private refreshTimer?: ReturnType<typeof setInterval>;
  private readonly REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutos antes de expirar
  private readonly SESSION_IDLE_MS = 30 * 60 * 1000;
  private readonly SERVER_ACTIVITY_SYNC_MS = 15 * 60 * 1000;
  private readonly activityEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
  private lastActivityAt = Date.now();
  private lastServerActivitySyncAt = 0;
  private closingSession = false;
  private readonly recordActivity = () => {
    this.lastActivityAt = Date.now();
  };

  constructor(
    private helper: HelperService,
    private loginService: LoginService,
    private router: Router
  ) {
    this.bindActivityMonitoring();
    this.startTokenMonitoring();
  }

  private bindActivityMonitoring(): void {
    for (const eventName of this.activityEvents) {
      document.addEventListener(eventName, this.recordActivity, { passive: true });
    }
  }

  /**
   * Inicia el monitoreo del token para refresh automático
   */
  private startTokenMonitoring(): void {
    // Verificar cada minuto si el token necesita refresh
    this.refreshTimer = setInterval(() => {
      void this.checkTokenExpiry();
    }, 60 * 1000); // 1 minuto
  }

  /**
   * Verifica si el token necesita ser refrescado
   */
  private async checkTokenExpiry(): Promise<void> {
    if (document.visibilityState !== 'visible') {
      return;
    }
    const token = this.helper.token;
    if (!token || !token.accessTokenExpiresAt) {
      return;
    }

    if (Date.now() - this.lastActivityAt >= this.SESSION_IDLE_MS) {
      await this.closeInactiveSession();
      return;
    }

    const expiryTime = new Date(token.accessTokenExpiresAt).getTime();
    const currentTime = new Date().getTime();
    const timeUntilExpiry = expiryTime - currentTime;
    const hasRenewableSession =
      !!token.refreshToken ||
      (token as IToken & { cookieAuth?: boolean }).cookieAuth === true;

    // Si falta poco para expirar y tenemos refresh token, renovar
    const necesitaSincronizarActividad =
      currentTime - this.lastServerActivitySyncAt >=
      this.SERVER_ACTIVITY_SYNC_MS;
    if (
      hasRenewableSession &&
      (timeUntilExpiry <= this.REFRESH_THRESHOLD ||
        necesitaSincronizarActividad)
    ) {
      await this.refreshTokenProactively();
    }
  }

  private async closeInactiveSession(): Promise<void> {
    if (this.closingSession) return;
    this.closingSession = true;
    try {
      await this.loginService.logout();
    } catch {
      this.helper.removeToken();
    } finally {
      await this.router.navigate(['/auth']);
      this.helper.notifWarn(
        'La sesion se cerro despues de 30 minutos sin actividad.',
        'Sesion finalizada'
      );
      this.closingSession = false;
    }
  }

  /**
   * Refresca el token de manera proactiva
   */
  private async refreshTokenProactively(): Promise<void> {
    try {
      await this.loginService.refreshToken();
      this.lastServerActivitySyncAt = Date.now();
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
      };
    }

    const expiryTime = token.accessTokenExpiresAt ? new Date(token.accessTokenExpiresAt).getTime() : null;
    const currentTime = new Date().getTime();
    const timeUntilExpiry = expiryTime ? expiryTime - currentTime : null;
    const isExpired = timeUntilExpiry ? timeUntilExpiry <= 0 : true;

    return {
      hasToken: true,
      hasRefreshToken:
        !!token.refreshToken ||
        (token as IToken & { cookieAuth?: boolean }).cookieAuth === true,
      isExpired,
      timeUntilExpiry,
      expiresAt: token.accessTokenExpiresAt || null,
      refreshExpiresAt: token.refreshTokenExpiresAt || null,
      storageType,
    };
  }

  /**
   * Limpia todos los timers
   */
  public cleanup(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    for (const eventName of this.activityEvents) {
      document.removeEventListener(eventName, this.recordActivity);
    }
  }
}
