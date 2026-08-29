/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ENV } from '../../environments/environment';

export const debeAplicarActualizacionAutomaticamente = (
  environment: 'Local' | 'Test' | 'Production',
  hostname: string
): boolean =>
  environment === 'Test' ||
  hostname.toLowerCase().includes('testing-web-testing-dc8e');

@Injectable({
  providedIn: 'root',
})
export class PwaService {
  public promptEvent: any;
  private timer?: ReturnType<typeof setInterval>;
  private interval = 1 * (1000 * 60); // 1 minuto
  private checkingVersion = false;
  private updatePromptOpen = false;

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
    if (this.checkingVersion || this.updatePromptOpen) {
      return;
    }
    this.checkingVersion = true;
    try {
      const newVersion = await this.swUpdate.checkForUpdate();
      if (newVersion) {
        console.log('SW - Nueva versión de app detectada');
        if (
          debeAplicarActualizacionAutomaticamente(
            ENV,
            globalThis.location?.hostname || ''
          )
        ) {
          await this.activateAndReload();
        } else {
          await this.promptReload();
        }
      } else {
        console.log('SW - No hay nueva versión');
      }
    } catch (error) {
      console.warn('SW - No se pudo comprobar la versión', error);
    } finally {
      this.checkingVersion = false;
    }
  }

  private async activateAndReload() {
    await this.swUpdate.activateUpdate();
    window.location.reload();
  }

  private async promptReload() {
    if (this.updatePromptOpen) {
      return;
    }
    this.updatePromptOpen = true;
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
        try {
          await this.activateAndReload();
        } finally {
          this.updatePromptOpen = false;
        }
      },
      reject: () => {
        // El intervalo sigue activo. Si el usuario pospone la actualización,
        // la app vuelve a ofrecerla en el siguiente control.
        this.updatePromptOpen = false;
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
