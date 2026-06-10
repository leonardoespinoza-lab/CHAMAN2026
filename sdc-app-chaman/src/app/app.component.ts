import { Component, HostListener } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { App } from '@capacitor/app';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNG } from 'primeng/config';
import { PRIMENG_BR } from '../../public/i18n/primeng-br';
import { PRIMENG_EN } from '../../public/i18n/primeng-en';
import { PRIMENG_ES } from '../../public/i18n/primeng-es';
import { TokenDebugComponent } from './auxiliares/components/token-debug.component';
import { HelperService } from './auxiliares/servicios/helper';
import { PwaService } from './auxiliares/servicios/pwa.service';
import { TokenManagerService } from './auxiliares/servicios/token-manager.service';
import { SharedModule } from './auxiliares/shared.module';

@Component({
  selector: 'app-root',
  imports: [SharedModule, RouterOutlet, TokenDebugComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  showTokenDebug = false; // Oculto por defecto

  constructor(
    private translate: TranslateService,
    private primeng: PrimeNG,
    public helper: HelperService,
    private pws: PwaService,
    private router: Router,
    private tokenManager: TokenManagerService // Inicialización automática del monitoreo de tokens
  ) {
    this.setInitialLanguage();
    this.setInitialTheme();
    this.lockOrientation();
    this.pws.initPWA();
    this.initializeBackButton();
  }

  private setInitialLanguage() {
    const savedLang = localStorage.getItem('lang');
    const browserLang = this.translate.getBrowserLang() || 'es';
    const langs = ['es', 'en', 'br'];
    this.translate.addLangs(langs);
    this.translate.setDefaultLang('es');
    const lang = savedLang && langs.includes(savedLang) ? savedLang : langs.includes(browserLang) ? browserLang : 'es';
    this.translate.use(lang);

    switch (lang) {
      case 'es':
        this.primeng.setTranslation(PRIMENG_ES);
        break;
      case 'en':
        this.primeng.setTranslation(PRIMENG_EN);
        break;
      case 'br':
        this.primeng.setTranslation(PRIMENG_BR);
        break;
    }
  }

  private setInitialTheme() {
    if (this.helper.darkTheme) {
      this.helper.toggleTheme();
    }
  }

  private async lockOrientation() {
    try {
      await (screen.orientation as any)?.lock('portrait-primary'); // webkit only
    } catch (error) {
      //
    }
  }

  @HostListener('window:orientationchange', ['$event'])
  onOrientationChange(event: Event) {
    event.preventDefault();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    // Ctrl+Alt+T para toggle del debug de tokens
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      console.log('🔧 Debug: Combinación Ctrl+Alt+T detectada');
      this.toggleTokenDebug();
    }

    // También probar con F9 como alternativa
    if (event.key === 'F9') {
      event.preventDefault();
      console.log('🔧 Debug: F9 detectado');
      this.toggleTokenDebug();
    }
  }

  private toggleTokenDebug() {
    this.showTokenDebug = !this.showTokenDebug;
    console.log('🔧 Debug: showTokenDebug =', this.showTokenDebug);
  }

  private initializeBackButton() {
    App.addListener('backButton', (e) => {
      if (this.shouldExitApp()) {
        App.minimizeApp();
      } else {
        if (e.canGoBack) {
          window.history.back();
        }
      }
    });
  }

  private shouldExitApp(): boolean {
    return this.router.url === '/mapa';
  }
}
