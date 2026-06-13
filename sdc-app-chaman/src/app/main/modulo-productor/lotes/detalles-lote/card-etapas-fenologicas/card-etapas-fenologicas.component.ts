import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';
import { ISemilla } from 'modelos/src';
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

type FuenteFenologia = 'crono' | 'semilla' | 'base';

const ETAPAS_BASE_POR_CULTIVO: Record<string, Record<string, number>> = {
  Trigo: {
    R0_R1: 12,
    R1_R2: 65,
    R2_R3: 18,
    R3_R4: 14,
    R4_R5: 5,
    R5_R6: 18,
    R6_R7: 25,
  },
  Soja: {
    siembra_emergencia: 8,
    emergencia_R1: 35,
    R1_R3: 18,
    R3_R5: 28,
    R5_R7: 38,
  },
  Maiz: {
    siembra_emergencia: 8,
    emergencia_floracion: 65,
    floracion_madurez: 55,
  },
  Papa: {
    Plantacion: 0,
    Emergencia: 18,
    Desarrollo_vegetativo: 24,
    Tuberizacion: 28,
    Llenado_de_tuberculos: 38,
    Madurez_y_cosecha: 22,
  },
  Vid: {
    Dormancia: 0,
    Brotacion: 28,
    Floracion: 35,
    Cuaje: 18,
    Envero: 55,
    Madurez: 45,
    Cosecha: 20,
  },
  Manzano: {
    Reposo_invernal: 0,
    Yema_hinchada: 35,
    Brotacion: 18,
    Floracion: 18,
    Cuaje: 15,
    Desarrollo_de_fruto: 95,
    Madurez: 35,
    Cosecha: 20,
  },
  Peral: {
    Reposo_invernal: 0,
    Yema_hinchada: 32,
    Brotacion: 16,
    Floracion: 16,
    Cuaje: 14,
    Desarrollo_de_fruto: 90,
    Madurez: 30,
    Cosecha: 20,
  },
  Pecan: {
    Dormancia: 0,
    Brotacion: 40,
    Floracion: 25,
    Cuaje: 20,
    Llenado_de_nuez: 90,
    Madurez: 45,
    Cosecha: 30,
  },
};

@Component({
  selector: 'app-card-etapas-fenologicas',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-etapas-fenologicas.component.html',
  styleUrl: './card-etapas-fenologicas.component.scss',
})
export class CardEtapasFenologicasComponent implements OnInit, OnChanges, OnDestroy {
  @Input() public lote?: IDetallesLote;
  public etapaActual?: string;
  public cultivo?: string;
  public cultivoClass = 'cultivo-trigo';
  public progreso = 0;
  public etapas: FenologiaStage[] = [];
  public fuenteFenologia: FuenteFenologia = 'crono';
  public fuenteTexto = 'crono cargado';

  constructor(public helper: HelperService) {}

  ngOnInit(): void {
    this.crearTimeline();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote']) {
      this.crearTimeline();
    }
  }

  private crearTimeline(): void {
    const siembra = this.lote?.siembra;
    const crono = siembra?.crono;

    if (!siembra?.fechaSiembra || !siembra.semilla?.cultivo) {
      this.etapas = [];
      this.etapaActual = undefined;
      this.progreso = 0;
      return;
    }

    const cultivo = siembra.semilla.cultivo;
    const etapasCrono = crono?.etapas as Record<string, number | string> | undefined;
    const etapasDisponibles = this.getEtapasDisponibles(cultivo, siembra.semilla, etapasCrono);
    const fechaBase = new Date(siembra.fechaSiembra);
    const fechas: Date[] = [];
    let etapaActualNumero = -1;
    let etapasConfig: { nombres: string[]; claves: string[] } = { nombres: [], claves: [] };

    this.cultivo = cultivo;
    this.cultivoClass = `cultivo-${this.normalizarCultivo(cultivo)}`;

    switch (cultivo) {
      case 'Trigo':
        if (crono) {
          etapaActualNumero = HelperService.getEtapaPorFechaTrigo(siembra, new Date().toISOString(), crono);
        } else {
          etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, ['Siembra', ...Object.keys(etapasDisponibles)], etapasDisponibles);
        }
        etapasConfig = {
          nombres: ETAPAS_TRIGO,
          claves: ['Siembra', 'R0_R1', 'R1_R2', 'R2_R3', 'R3_R4', 'R4_R5', 'R5_R6', 'R6_R7'],
        };
        break;
      case 'Soja': {
        if (crono) {
          const etapaSojaStr = HelperService.getEtapaPorFechaSoja(siembra, new Date().toISOString(), crono);
          etapaActualNumero = HelperService.etapaSojaANumero(etapaSojaStr);
        } else {
          etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, ['Siembra', ...Object.keys(etapasDisponibles)], etapasDisponibles);
        }
        etapasConfig = {
          nombres: ETAPAS_SOJA,
          claves: ['siembra', 'siembra_emergencia', 'emergencia_R1', 'R1_R3', 'R3_R5', 'R5_R7'],
        };
        break;
      }
      case 'Maiz': {
        if (crono) {
          const etapaMaizStr = HelperService.getEtapaPorFechaMaiz(siembra, new Date().toISOString(), crono);
          etapaActualNumero = HelperService.etapaMaizANumero(etapaMaizStr);
        } else {
          etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, ['Siembra', ...Object.keys(etapasDisponibles)], etapasDisponibles);
        }
        etapasConfig = {
          nombres: ETAPAS_MAIZ,
          claves: ['siembra', 'siembra_emergencia', 'emergencia_floracion', 'floracion_madurez'],
        };
        break;
      }
      default:
        etapasConfig = this.crearEtapasGenericas(etapasDisponibles);
        etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, etapasConfig.claves, etapasDisponibles);
        break;
    }

    if (!etapasConfig.nombres.length) {
      this.etapas = [];
      this.etapaActual = undefined;
      this.progreso = 0;
      return;
    }

    const cursor = new Date(fechaBase);
    etapasConfig.nombres.forEach((_, index) => {
      const dias = index > 0 ? this.getDuracionEtapa(etapasDisponibles, etapasConfig.claves[index]) : 0;
      cursor.setDate(cursor.getDate() + dias);
      fechas.push(new Date(cursor));
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

  private getEtapasDisponibles(
    cultivo: string,
    semilla?: ISemilla,
    etapasCrono?: Record<string, number | string>
  ): Record<string, number> {
    if (etapasCrono && Object.keys(etapasCrono).length) {
      this.fuenteFenologia = 'crono';
      this.fuenteTexto = 'crono cargado';
      return this.normalizarEtapas(etapasCrono);
    }

    const etapasSemilla = semilla?.fenologiaReferencia?.etapas;
    if (etapasSemilla && Object.keys(etapasSemilla).length) {
      this.fuenteFenologia = 'semilla';
      this.fuenteTexto = 'referencia de semilla';
      return this.normalizarEtapas(etapasSemilla);
    }

    this.fuenteFenologia = 'base';
    this.fuenteTexto = 'base editable';
    return ETAPAS_BASE_POR_CULTIVO[cultivo] || {
      Inicio: 0,
      Desarrollo: 30,
      Monitoreo: 30,
      Cierre: 30,
    };
  }

  private normalizarEtapas(etapas: Record<string, number | string>): Record<string, number> {
    return Object.entries(etapas).reduce<Record<string, number>>((acc, [key, value]) => {
      const numero = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      acc[key] = Number.isFinite(numero) ? numero : 0;
      return acc;
    }, {});
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
        cursor.setDate(cursor.getDate() + this.getDuracionEtapa(etapas, key));
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

  private getDuracionEtapa(etapas: Record<string, number> | undefined, key: string): number {
    const duracion = Number(etapas?.[key] || 0);
    return Number.isFinite(duracion) ? duracion : 0;
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
