import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { TokenManagerService } from '../servicios/token-manager.service';

@Component({
  selector: 'app-token-debug',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="token-debug" *ngIf="showDebug">
      <div class="debug-header">
        <h4>🔑 Token Debug Info (ACTIVO)</h4>
        <button (click)="toggleDebug()" class="close-btn">×</button>
      </div>

      <div class="debug-content">
        <div class="status-row">
          <span class="label">Estado:</span>
          <span [class]="'status ' + (tokenInfo.isExpired ? 'expired' : 'valid')">
            {{ tokenInfo.isExpired ? '❌ Expirado' : '✅ Válido' }}
          </span>
        </div>

        <div class="status-row" *ngIf="tokenInfo.timeUntilExpiry !== null">
          <span class="label">Expira en:</span>
          <span class="value">{{ formatTime(tokenInfo.timeUntilExpiry) }}</span>
        </div>

        <div class="status-row" *ngIf="tokenInfo.expiresAt">
          <span class="label">Expira el:</span>
          <span class="value">{{ formatDate(tokenInfo.expiresAt) }}</span>
        </div>

        <div class="status-row" *ngIf="tokenInfo.refreshExpiresAt">
          <span class="label">Refresh expira:</span>
          <span class="value">{{ formatDate(tokenInfo.refreshExpiresAt) }}</span>
        </div>

        <div class="status-row">
          <span class="label">Refresh Token:</span>
          <span [class]="'status ' + (tokenInfo.hasRefreshToken ? 'valid' : 'invalid')">
            {{ tokenInfo.hasRefreshToken ? '✅ Disponible' : '❌ No disponible' }}
          </span>
        </div>

        <div class="status-row">
          <span class="label">Storage:</span>
          <span class="value">{{ tokenInfo.storageType }}</span>
        </div>

        <div class="raw-token" *ngIf="showRawToken">
          <div class="section-title">📋 Token Raw Data:</div>
          <pre class="token-data">{{ formatTokenData() }}</pre>
        </div>

        <div class="actions">
          <button (click)="forceRefresh()" [disabled]="!tokenInfo.hasRefreshToken" class="refresh-btn">
            🔄 Forzar Refresh
          </button>
          <button (click)="toggleRawToken()" class="toggle-btn">
            {{ showRawToken ? '🙈 Ocultar' : '👁️ Ver Raw' }}
          </button>
          <button (click)="logTokenDetails()" class="log-btn">📝 Log Details</button>
        </div>
      </div>
    </div>

    <div class="debug-toggle" *ngIf="!showDebug" (click)="toggleDebug()">🔑</div>
  `,
  styles: [
    `
      .token-debug {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        min-width: 280px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      .debug-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        border-bottom: 1px solid #333;
        padding-bottom: 8px;
      }

      .debug-header h4 {
        margin: 0;
        font-size: 14px;
      }

      .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
      }

      .status-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 5px;
      }

      .label {
        font-weight: bold;
      }

      .status.valid {
        color: #4ade80;
      }

      .status.expired,
      .status.invalid {
        color: #f87171;
      }

      .value {
        color: #94a3b8;
      }

      .actions {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #333;
      }

      .refresh-btn {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
      }

      .refresh-btn:disabled {
        background: #6b7280;
        cursor: not-allowed;
      }

      .toggle-btn,
      .log-btn {
        background: #10b981;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        margin-left: 5px;
      }

      .log-btn {
        background: #f59e0b;
      }

      .raw-token {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #333;
      }

      .section-title {
        font-weight: bold;
        margin-bottom: 5px;
        font-size: 11px;
      }

      .token-data {
        background: #1f2937;
        padding: 8px;
        border-radius: 4px;
        font-size: 10px;
        max-height: 200px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      .debug-toggle {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10000;
        font-size: 16px;
      }

      @media (max-width: 768px) {
        .token-debug {
          top: 10px;
          right: 10px;
          left: 10px;
          min-width: auto;
        }

        .debug-toggle {
          top: 10px;
          right: 10px;
        }
      }
    `,
  ],
})
export class TokenDebugComponent implements OnInit, OnDestroy {
  tokenInfo: any = {};
  showDebug = false;
  showRawToken = false;
  private subscription?: Subscription;

  constructor(private tokenManager: TokenManagerService) {}

  ngOnInit() {
    console.log('🔧 TokenDebugComponent: Componente inicializado');
    // Siempre estará disponible (controlado por AppComponent)
    this.showDebug = true;

    // Actualizar info cada segundo
    this.subscription = interval(1000).subscribe(() => {
      this.tokenInfo = this.tokenManager.getTokenInfo();
    });

    // Cargar info inicial
    this.tokenInfo = this.tokenManager.getTokenInfo();
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  toggleDebug() {
    this.showDebug = !this.showDebug;
    console.log('🔧 TokenDebugComponent: toggleDebug interno =', this.showDebug);
  }

  async forceRefresh() {
    await this.tokenManager.forceRefresh();
  }

  formatTime(ms: number): string {
    if (ms <= 0) return '⏰ Expirado';

    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }

    return `${minutes}m ${seconds}s`;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  toggleRawToken() {
    this.showRawToken = !this.showRawToken;
  }

  formatTokenData(): string {
    const token = this.tokenManager['helper'].token;
    return JSON.stringify(token, null, 2);
  }

  logTokenDetails() {
    const token = this.tokenManager['helper'].token;
    const tokenInfo = this.tokenManager.getTokenInfo();

    console.group('🔑 TOKEN DEBUG INFO');
    console.log('📋 Token completo:', token);
    console.log('⏰ Info procesada:', tokenInfo);
    console.log('💾 localStorage token:', localStorage.getItem('token'));
    console.log('💾 sessionStorage token:', sessionStorage.getItem('token'));

    if (token) {
      console.log('🕐 Access Token expira:', token.accessTokenExpiresAt);
      console.log('🔄 Refresh Token expira:', token.refreshTokenExpiresAt);
      console.log('📅 Fechas parseadas:');
      console.log('  - Access:', new Date(token.accessTokenExpiresAt));
      if (token.refreshTokenExpiresAt) {
        console.log('  - Refresh:', new Date(token.refreshTokenExpiresAt));
      }

      const now = new Date();
      const accessExpiry = new Date(token.accessTokenExpiresAt);

      console.log('⏳ Tiempo hasta expiración:');
      console.log('  - Access:', Math.floor((accessExpiry.getTime() - now.getTime()) / 1000 / 60), 'minutos');

      if (token.refreshTokenExpiresAt) {
        const refreshExpiry = new Date(token.refreshTokenExpiresAt);
        console.log(
          '  - Refresh:',
          Math.floor((refreshExpiry.getTime() - now.getTime()) / 1000 / 60 / 60 / 24),
          'días'
        );
      }
    }

    console.groupEnd();
  }
}
