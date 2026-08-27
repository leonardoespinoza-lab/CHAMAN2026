import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IChamanMeteoAdminStatus,
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoHourlyDerived,
  IChamanMeteoImportJob,
} from 'modelos/src';
import { ChamanMeteoService } from '../../../auxiliares/http/chaman-meteo.service';
import { SharedModule } from '../../../auxiliares/shared.module';

@Component({
  selector: 'app-chaman-meteo',
  imports: [SharedModule],
  templateUrl: './chaman-meteo.component.html',
  styleUrl: './chaman-meteo.component.scss',
})
export class ChamanMeteoComponent implements OnInit {
  public status?: IChamanMeteoAdminStatus;
  public gridPoints: IChamanMeteoGridPoint[] = [];
  public jobs: IChamanMeteoImportJob[] = [];
  public hourly: IChamanMeteoHourlyDerived[] = [];
  public daily: IChamanMeteoDaily[] = [];
  public selectedGridPoint = '';
  public loading = false;
  public error = '';

  constructor(
    private readonly service: ChamanMeteoService,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  public volver(): void {
    this.router.navigateByUrl('/dashboard-admin');
  }

  public async refresh(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const [status, gridPage, jobPage] = await Promise.all([
        this.service.status(),
        this.service.gridPoints(),
        this.service.jobs(),
      ]);
      this.status = status;
      this.gridPoints = gridPage.datos || [];
      this.jobs = jobPage.datos || [];
      if (!this.selectedGridPoint && this.gridPoints.length) {
        this.selectedGridPoint = this.gridPoints[0].key;
      }
      await this.loadValues();
    } catch (error: any) {
      this.error = error?.error?.message || error?.message || 'No se pudo consultar Chaman-Meteo.';
    } finally {
      this.loading = false;
    }
  }

  public async loadValues(): Promise<void> {
    const key = this.selectedGridPoint || undefined;
    const [hourly, daily] = await Promise.all([this.service.hourly(key), this.service.daily(key)]);
    this.hourly = hourly.datos || [];
    this.daily = daily.datos || [];
  }

  public async changeGridPoint(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      await this.loadValues();
    } catch (error: any) {
      this.error = error?.error?.message || error?.message || 'No se pudieron cargar los valores.';
    } finally {
      this.loading = false;
    }
  }

  public get latestHourly(): IChamanMeteoHourlyDerived | undefined {
    return this.hourly[0];
  }

  public stateLabel(): string {
    switch (this.status?.state) {
      case 'AVAILABLE':
        return 'Datos disponibles';
      case 'IMPORTING':
        return 'Importando';
      case 'READY':
        return 'Listo para importar';
      case 'ERROR':
        return 'Revisar importacion';
      default:
        return 'Integracion desactivada';
    }
  }

  public stateClass(): string {
    return String(this.status?.state || 'DISABLED').toLowerCase();
  }

  public number(value?: number, decimals = 1): string {
    return Number.isFinite(value) ? Number(value).toFixed(decimals) : '-';
  }

  public date(value?: string): string {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('es-AR');
  }
}
