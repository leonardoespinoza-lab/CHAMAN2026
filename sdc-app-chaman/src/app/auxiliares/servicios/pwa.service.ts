/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';

@Injectable({
  providedIn: 'root',
})
export class PwaService {
  public promptEvent: any;
  private timer?: NodeJS.Timeout;
  private interval = 1 * (1000 * 60); // 1 minuto

  constructor(
    private swUpdate: SwUpdate,
    private translate: TranslateService,
    private confirmationService: ConfirmationService
  ) {}

  public initPWA() {
    if (this.swUpdate.isEnabled) {
      // Verifica si la app esta instalada
      window.addEventListener('beforeinstallprompt', (event) => {
        console.log('App no instalada');
        event.preventDefault();
        this.promptEvent = event;
      });

      // Verifica si hay nuevas versiones de la app cada X min
      this.checkVersion();
      this.timer = setInterval(this.checkVersion.bind(this), this.interval);
    } else {
      console.log('Service Worker No Disponible');
    }
  }

  private async checkVersion() {
    const newVersion = await this.swUpdate.checkForUpdate();
    if (newVersion) {
      console.log('SW - Nueva versión de app detectada');
      clearInterval(this.timer!);
      this.timer = undefined;
      await this.promptReaload();
    } else {
      console.log('SW - No hay nueva versión');
    }
  }

  private async promptReaload() {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Nueva versión disponible'),
      message: this.translate.instant('Recargar ahora para aplicarla?'),
      closable: true,
      closeOnEscape: true,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: this.translate.instant('Cancelar'),
        severity: 'secondary',
        outlined: true,
      },
      acceptButtonProps: {
        label: this.translate.instant('Aceptar'),
      },
      accept: async () => {
        window.location.reload();
      },
    });
  }

  public installPwa(): void {
    this.promptEvent.prompt();
    this.promptEvent.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        this.promptEvent = null;
      }
    });
  }
}
