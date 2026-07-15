import { Component, Input } from '@angular/core';
import { IDispositivo, ILote, ISiembra } from 'modelos/src';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { evaluarRiegoFrontend } from '../../riego-evidence';

type QualityLevel = 'alta' | 'media' | 'baja' | 'sin_datos';

interface DataQualityItem {
  label: string;
  value: string;
  source: string;
  score: number;
  level: QualityLevel;
  updated?: string;
  detail: string;
  icon: string;
}

@Component({
  selector: 'app-data-quality-strip',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './data-quality-strip.component.html',
  styleUrl: './data-quality-strip.component.scss',
})
export class DataQualityStripComponent {
  @Input() lote?: ILote;
  @Input() siembra?: ISiembra;

  public get items(): DataQualityItem[] {
    return [
      this.climaItem(),
      this.sateliteItem(),
      this.fenologiaItem(),
      this.sanidadItem(),
      this.riegoItem(),
      this.sueloItem(),
      this.manejoItem(),
    ];
  }

  public get scoreGeneral(): number {
    const items = this.items.filter((item) => item.level !== 'sin_datos');
    if (!items.length) return 0;
    return Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
  }

  public get nivelGeneral(): QualityLevel {
    return this.levelFromScore(this.scoreGeneral);
  }

  public get resumenGeneral(): string {
    const sinDatos = this.items.filter((item) => item.level === 'sin_datos').length;
    if (!this.scoreGeneral) return 'Completar datos base para auditar los motores del lote.';
    if (sinDatos >= 3) return 'Buena base inicial, con servicios pendientes de conectar o alimentar.';
    if (this.scoreGeneral >= 80) return 'Base operativa robusta para lectura agronomica.';
    if (this.scoreGeneral >= 60) return 'Base util, conviene contrastar decisiones criticas con campo.';
    return 'Base parcial: usar como orientacion hasta completar fuentes clave.';
  }

  public levelLabel(level: QualityLevel): string {
    const labels: Record<QualityLevel, string> = {
      alta: 'Alta',
      media: 'Media',
      baja: 'Baja',
      sin_datos: 'Sin datos',
    };
    return labels[level];
  }

  private climaItem(): DataQualityItem {
    const climaActual = this.lote?.establecimiento?.climaActual as any;
    const clima = climaActual?.clima || climaActual;
    const calidad = clima?.calidadDatos;
    const fuente = clima?.fuente || this.lote?.establecimiento?.fuenteClimaPreferida || 'Open-Meteo';
    const score = this.scoreClima(fuente, calidad?.score);
    const updated =
      calidad?.fechaActualizacion || clima?.fecha || climaActual?.fecha || climaActual?.estado?.ultimoSync;

    return {
      label: 'Clima',
      value: `${score}/100`,
      source: fuente,
      score,
      level: this.levelFromScore(score),
      updated,
      detail: calidad?.resumen || this.detalleFuenteClima(fuente),
      icon: 'pi pi-cloud',
    };
  }

  private sateliteItem(): DataQualityItem {
    const reporte = this.getAny(this.lote, ['ultimoReporteNdvi', 'ultimoReporteNDVI', 'reporteNdvi', 'reporteNDVI']);
    const coverage = Number(
      reporte?.metadataImagen?.qualityMask?.validCoveragePct ??
        reporte?.metadataImagen?.indicesStats?.ndvi?.validCoveragePct ??
        reporte?.metadata?.qualityMask?.validCoveragePct
    );
    const score = reporte ? Math.max(45, Math.min(92, Number.isFinite(coverage) ? Math.round(coverage) : 72)) : 35;

    return {
      label: 'Satelite',
      value: reporte?.ndviPromedio != null ? `NDVI ${this.formatNumber(reporte.ndviPromedio, 2)}` : 'Pendiente',
      source: reporte?.coleccion || 'STAC / Worker Chaman',
      score,
      level: reporte ? this.levelFromScore(score) : 'baja',
      updated: reporte?.fechaDeLaImagen || reporte?.fechaCreacion,
      detail: reporte
        ? 'Escena asociada al lote; revisar cobertura y QA dentro del modulo satelital.'
        : 'El modulo satelital valida escena, poligono y cobertura cuando carga reportes del lote.',
      icon: 'pi pi-satellite',
    };
  }

  private fenologiaItem(): DataQualityItem {
    const registros = this.siembra?.registrosFenologicos || [];
    const tieneCrono = !!this.siembra?.crono || !!this.siembra?.semilla?.fenologiaReferencia;
    const score = registros.length ? 90 : tieneCrono ? 74 : 35;

    return {
      label: 'Fenologia',
      value: registros.length ? `${registros.length} registro(s)` : tieneCrono ? 'Base cargada' : 'Pendiente',
      source: registros.length ? 'Registro de campo Chaman' : (this.siembra?.crono as any)?.fuente || 'Catalogo Chaman',
      score,
      level: this.levelFromScore(score),
      updated: registros[0]?.fecha || registros[0]?.actualizadoEn,
      detail: registros.length
        ? 'Tiene observacion fenologica registrada para ajustar la lectura local.'
        : tieneCrono
          ? 'Cronologia estimada por cultivo, ciclo, zona o variedad.'
          : 'Falta cronologia o referencia fenologica para el cultivo.',
      icon: 'pi pi-seedling',
    };
  }

  private sanidadItem(): DataQualityItem {
    const prediccion = this.siembra?.ultimaPrediccion as any;
    const enfermedades = prediccion?.enfermedades || [];
    const score = enfermedades.length ? (prediccion?.calidadDatos?.score ?? 68) : 35;

    return {
      label: 'Sanidad',
      value: enfermedades.length ? `${enfermedades.length} enfermedad(es)` : 'Sin prediccion',
      source: prediccion?.fuenteDatos || prediccion?.calidadDatos?.fuente || 'Motor Chaman',
      score,
      level: enfermedades.length ? this.levelFromScore(score) : 'baja',
      updated: prediccion?.fechaPrediccion || prediccion?.fecha,
      detail: enfermedades.length
        ? 'Cruza etapa fenologica, clima y sensibilidad del cultivo/variedad.'
        : 'Requiere prediccion diaria o actualizacion del motor sanitario.',
      icon: 'pi pi-shield',
    };
  }

  private riegoItem(): DataQualityItem {
    const evaluacion = evaluarRiegoFrontend(this.siembra, this.lote);
    const score = evaluacion.serieDisponible
      ? evaluacion.esEstimada
        ? evaluacion.tieneSensor
          ? 75
          : 62
        : evaluacion.tieneSensor
          ? 90
          : 72
      : evaluacion.estado === 'estimada'
        ? 45
        : evaluacion.tieneSensor
          ? 52
          : 38;
    const value = evaluacion.serieDisponible
      ? evaluacion.esEstimada
        ? 'Modelo estimado'
        : evaluacion.tieneSensor
          ? 'Sensor + recomendacion'
          : 'Calculo disponible'
      : evaluacion.estado === 'estimada'
        ? 'Estimacion pendiente'
        : evaluacion.tieneSensor
          ? 'Sensor sin recomendacion'
          : 'Sin datos validos';
    const source =
      evaluacion.fuente === 'sensor_suelo'
        ? 'Sensor de suelo'
        : evaluacion.fuente === 'balance_climatico'
          ? 'ET0 + cultivo + suelo'
          : evaluacion.tieneSensor
            ? 'Sensor asignado; estado invalido'
            : 'Sin fuente valida';
    const detail = evaluacion.serieDisponible
      ? evaluacion.esEstimada
        ? evaluacion.sinDemanda
          ? 'Balance modelado con ceros validos: no proyecta aporte; validar a campo.'
          : 'Balance modelado identificado como estimacion; validar a campo antes de decidir.'
        : 'Recomendacion calculada con estado y fuente validos.'
      : evaluacion.estado === 'estimada'
        ? 'La estimacion no contiene cantidades validas; no equivale a ausencia de demanda.'
        : 'Las filas previas no se consideran vigentes si la recomendacion figura no disponible, fallida o sin estado.';

    return {
      label: 'Riego',
      value,
      source,
      score,
      level: this.levelFromScore(score),
      updated: this.getUltimoReporteDispositivo(this.lote?.dispositivos),
      detail,
      icon: 'pi pi-droplet',
    };
  }

  private sueloItem(): DataQualityItem {
    const ref = this.lote?.sueloReferencia;
    const niveles = this.lote?.suelos?.filter((suelo) => suelo.textura || suelo.profundidad) || [];
    const score = ref?.confianza
      ? this.scoreConfianza(ref.confianza)
      : niveles.length
        ? Math.min(82, 55 + niveles.length * 7)
        : 30;

    return {
      label: 'Suelo',
      value: ref?.confianza
        ? this.levelLabel(ref.confianza)
        : niveles.length
          ? `${niveles.length} nivel(es)`
          : 'Pendiente',
      source: ref?.fuente || (niveles.length ? 'Carga del lote' : 'Sin perfil'),
      score,
      level: this.levelFromScore(score),
      updated: ref?.fechaConsulta,
      detail:
        ref?.unidadCartografica ||
        ref?.servicio ||
        'Completar textura, profundidad, capacidad de campo y PMP mejora riego/huella.',
      icon: 'pi pi-compass',
    };
  }

  private manejoItem(): DataQualityItem {
    const fumigaciones = this.getAny(this.siembra, ['fumigaciones']) || [];
    const fertilizaciones = this.getAny(this.lote, ['fertilizaciones']) || [];
    const total = fumigaciones.length + fertilizaciones.length;
    const score = total ? Math.min(90, 55 + total * 6) : 35;

    return {
      label: 'Manejo',
      value: total ? `${total} registro(s)` : 'Sin registros',
      source: 'Carga operativa',
      score,
      level: this.levelFromScore(score),
      updated: this.ultimaFecha([
        ...fumigaciones.map((item: any) => item.fechaFumigacion || item.fecha),
        ...fertilizaciones.map((item: any) => item.fechaFertilizacion || item.fecha),
      ]),
      detail: total
        ? 'Aplicaciones registradas alimentan huella, carga fitosanitaria e informe.'
        : 'Registrar fertilizaciones/fumigaciones para trazabilidad y calculos ambientales.',
      icon: 'pi pi-clipboard',
    };
  }

  private scoreClima(fuente?: string, score?: number): number {
    if (Number.isFinite(Number(score))) return Math.round(Number(score));
    const normalized = this.normalize(fuente);
    if (normalized.includes('fieldclimate') || normalized.includes('sensor')) return 92;
    if (normalized.includes('meteoblue')) return 85;
    if (normalized.includes('meteosource')) return 74;
    if (normalized.includes('openmeteo')) return 66;
    return 48;
  }

  private detalleFuenteClima(fuente?: string): string {
    const normalized = this.normalize(fuente);
    if (normalized.includes('fieldclimate') || normalized.includes('sensor')) {
      return 'Dato de estacion/sensor asignado; validar recencia y continuidad.';
    }
    if (normalized.includes('meteoblue')) {
      return 'Fuente profesional por coordenada; ideal para contraste de alertas.';
    }
    if (normalized.includes('openmeteo')) {
      return 'Fuente abierta por coordenada; buena cobertura, menor confianza que sensor en campo.';
    }
    return 'Fuente climatica no identificada completamente.';
  }

  private levelFromScore(score: number): QualityLevel {
    if (!score) return 'sin_datos';
    if (score >= 80) return 'alta';
    if (score >= 60) return 'media';
    if (score >= 35) return 'baja';
    return 'sin_datos';
  }

  private scoreConfianza(confianza: string): number {
    if (confianza === 'alta') return 88;
    if (confianza === 'media') return 68;
    if (confianza === 'baja') return 46;
    return 35;
  }

  private getAny(target: unknown, keys: string[]): any {
    const source = target as Record<string, any> | undefined;
    return keys.map((key) => source?.[key]).find((value) => value !== undefined && value !== null);
  }

  private getUltimoReporteDispositivo(dispositivos?: IDispositivo[]): string | undefined {
    const fechas = (dispositivos || [])
      .map(
        (dispositivo: any) => dispositivo?.estado?.ultimoReporte || dispositivo?.ultimoReporte || dispositivo?.updatedAt
      )
      .filter(Boolean);
    return this.ultimaFecha(fechas);
  }

  private ultimaFecha(fechas: string[]): string | undefined {
    const ordenadas = fechas
      .map((fecha) => ({ fecha, time: new Date(fecha).getTime() }))
      .filter((item) => Number.isFinite(item.time))
      .sort((a, b) => b.time - a.time);
    return ordenadas[0]?.fecha;
  }

  private normalize(value?: string): string {
    return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private formatNumber(value: number, digits = 1): string {
    return new Intl.NumberFormat('es-AR', {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    }).format(value);
  }
}
