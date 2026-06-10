import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNG } from 'primeng/config';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { SharedModule } from '../../auxiliares/shared.module';
import { HelperService } from '../../auxiliares/servicios/helper';
import { PRIMENG_BR } from '../../../../public/i18n/primeng-br';
import { PRIMENG_EN } from '../../../../public/i18n/primeng-en';
import { PRIMENG_ES } from '../../../../public/i18n/primeng-es';

interface LangOption {
  label: string;
  value: string;
  icon: string;
}

@Component({
  selector: 'app-aplicacion',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './aplicacion.component.html',
  styleUrl: './aplicacion.component.scss',
})
export class AplicacionComponent implements OnInit {
  public lang!: string;

  public languages: LangOption[] = [
    { label: 'Español', value: 'es', icon: 'images/flags/es.jpg' },
    { label: 'English', value: 'en', icon: 'images/flags/en.jpg' },
    { label: 'Português', value: 'br', icon: 'images/flags/br.jpg' },
  ];

  constructor(
    public helper: HelperService,
    private translate: TranslateService,
    private primeng: PrimeNG,
    private ref: DynamicDialogRef
  ) {}

  ngOnInit(): void {
    this.lang = localStorage.getItem('lang') || this.translate.currentLang || 'es';
  }

  public toggleTheme() {
    this.helper.toggleTheme();
  }

  public cerrar() {
    this.ref.close();
  }

  public changeLang(lang: string) {
    this.lang = lang;
    localStorage.setItem('lang', lang);
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
}
