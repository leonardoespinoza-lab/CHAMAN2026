import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';
import {
  ETAPAS_MAIZ,
  ETAPAS_SOJA,
  ETAPAS_TRIGO,
} from '../drawer-grafico-enfermedades/drawer-grafico-enfermedades.component';

interface FenologiaStage {
  nombre: string;
  fecha: Date;
  periodoDias?: number;
  posicion: number;
  estado: 'done' | 'current' | 'pending';
}

@Component({
  selector: 'app-card-etapas-fenologicas',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-etapas-fenologicas.component.html',
  styleUrl: './card-etapas-fenologicas.component.scss',
})
export class CardEtapasFenologicasComponent implements OnInit, OnDestroy {
  @Input() public lote?: IDetallesLote;
  public etapaActual?: string;
  public cultivo?: string;
  public cultivoClass = 'cultivo-trigo';
  public progreso = 0;
  public etapas: FenologiaStage[] = [];

  constructor(public helper: HelperService) {}

  ngOnInit(): void {
    this.crearTimeline();
  }

  private crearTimeline(): void {
    const siembra = this.lote?.siembra;
    const crono = siembra?.crono;

    if (!siembra?.fechaSiembra || !crono || !siembra.semilla?.cultivo) {
      this.etapas = [];
      return;
    }

    const cultivo = siembra.semilla.cultivo;
    const fechaBase = new Date(siembra.fechaSiembra);
    const fechas: Date[] = [];
    let etapaActualNumero = -1;
    let etapasConfig: { nombres: string[]; claves: string[] } = { nombres: [], claves: [] };

    this.cultivo = cultivo;
    this.cultivoClass = `cultivo-${this.normalizarCultivo(cultivo)}`;

    switch (cultivo) {
      case 'Trigo':
        etapaActualNumero = HelperService.getEtapaPorFechaTrigo(siembra, new Date().toISOString(), crono);
        etapasConfig = {
          nombres: ETAPAS_TRIGO,
          claves: ['Siembra', 'R0_R1', 'R1_R2', 'R2_R3', 'R3_R4', 'R4_R5', 'R5_R6', 'R6_R7'],
        };
        break;
      case 'Soja': {
        const etapaSojaStr = HelperService.getEtapaPorFechaSoja(siembra, new Date().toISOString(), crono);
        etapaActualNumero = HelperService.etapaSojaANumero(etapaSojaStr);
        etapasConfig = {
          nombres: ETAPAS_SOJA,
          claves: ['siembra', 'siembra_emergencia', 'emergencia_R1', 'R1_R3', 'R3_R5', 'R5_R7'],
        };
        break;
      }
      case 'Maiz': {
        const etapaMaizStr = HelperService.getEtapaPorFechaMaiz(siembra, new Date().toISOString(), crono);
        etapaActualNumero = HelperService.etapaMaizANumero(etapaMaizStr);
        etapasConfig = {
          nombres: ETAPAS_MAIZ,
          claves: ['siembra', 'siembra_emergencia', 'emergencia_floracion', 'floracion_madurez'],
        };
        break;
      }
      default:
        etapasConfig = this.crearEtapasGenericas(crono.etapas as Record<string, number>);
        etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, etapasConfig.claves, crono.etapas as Record<string, number>);
        break;
    }

    etapasConfig.nombres.forEach((_, index) => {
      const dias = index > 0 ? (crono.etapas as any)[etapasConfig.claves[index]] || 0 : 0;
      fechaBase.setDate(fechaBase.getDate() + dias);
      fechas.push(new Date(fechaBase));
    });

    const fechaInicio = fechas[0].getTime();
    const fechaFin = fechas[fechas.length - 1].getTime();
    const duracionTotal = Math.max(fechaFin - fechaInicio, 1);
    this.progreso = this.limitar(((Date.now() - fechaInicio) / duracionTotal) * 100);
    this.etapaActual =
      etapaActualNumero > -1 ? etapasConfig.nombres[etapaActualNumero] : etapasConfig.nombres[0];

    this.etapas = etapasConfig.nombres.map((nombre, index) => {
      const posicion = this.posicionUniforme(index, etapasConfig.nombres.length);
      const estado = index < etapaActualNumero ? 'done' : index === etapaActualNumero ? 'current' : 'pending';
      const periodoDias =
        index > 0 ? Math.max(1, Math.round((fechas[index].getTime() - fechas[index - 1].getTime()) / 86400000)) : undefined;

      return {
        nombre,
        fecha: fechas[index],
        periodoDias,
        posicion,
        estado,
      };
    });
  }

  private normalizarCultivo(cultivo: string): string {
    if (cultivo === 'Maiz') {
      return 'maiz';
    }
    if (cultivo === 'Soja') {
      return 'soja';
    }
    return cultivo
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private crearEtapasGenericas(etapas?: Record<string, number>): { nombres: string[]; claves: string[] } {
    const claves = Object.keys(etapas || {});
    return {
      claves,
      nombres: claves.map((key) => this.formatearNombreEtapa(key)),
    };
  }

  private getEtapaGenericaPorFecha(fechaBase: Date, claves: string[], etapas?: Record<string, number>): number {
    if (!claves.length) return -1;
    const hoy = Date.now();
    const cursor = new Date(fechaBase);
    let actual = 0;

    claves.forEach((key, index) => {
      if (index > 0) {
        cursor.setDate(cursor.getDate() + Number(etapas?.[key] || 0));
      }
      if (cursor.getTime() <= hoy) {
        actual = index;
      }
    });

    return actual;
  }

  private formatearNombreEtapa(key: string): string {
    return key.replace(/_/g, ' ');
  }

  private limitar(valor: number): number {
    return Math.max(0, Math.min(100, valor));
  }

  private posicionUniforme(index: number, total: number): number {
    if (total <= 1) {
      return 50;
    }
    const margen = 1.5;
    const anchoUtil = 100 - margen * 2;
    return margen + (index / (total - 1)) * anchoUtil;
  }

  ngOnDestroy(): void {}
}
