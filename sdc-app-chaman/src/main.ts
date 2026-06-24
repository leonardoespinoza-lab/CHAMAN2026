import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { applyChamanHighchartsDefaults } from './app/auxiliares/componentes/chart/chaman-chart-theme';
import { AppComponent } from './app/app.component';

applyChamanHighchartsDefaults();

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
