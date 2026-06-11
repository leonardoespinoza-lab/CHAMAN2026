import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import {
  IFilter,
  IListado,
  ILote,
  IPronosticoEstacionMeteorologica,
  IQueryParam,
  IReporteNDVI,
  ISiembra,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
import { ReporteNDVIService } from '../../../../../auxiliares/http/reporte-ndvis.service';
import { DialogHandlerService } from '../../../../../auxiliares/servicios/dialog-handler.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { ENV } from '../../../../../environments/environment';
import { NdviLegendComponent } from '../../ndvi-legend/ndvi-legend.component';

interface NdviAnalisis {
  estado: string;
  tono: 'ok' | 'warn' | 'risk';
  resumen: string;
  recomendacion: string;
  contexto: string;
  tendencia: string;
  balance72: string;
}

interface SatelliteIndicator {
  key: keyof NonNullable<IReporteNDVI['indices']>;
  label: string;
  value: string;
  detail: string;
  source: string;
  image?: string;
  lectura: string;
  status: 'activo' | 'preparado' | 'contexto';
}

@Component({
  selector: 'app-card-ndvi',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-ndvi.component.html',
  styleUrl: './card-ndvi.component.scss',
})
export class CardNDVIComponent implements OnInit, OnDestroy {
  @Input() public lote?: ILote;
  @Input() public siembra?: ISiembra;

  public hoy: Date = new Date();
  public fecha: Date = this.hoy;
  public fechaMinima: Date = this.hoy;

  public reporte?: IReporteNDVI;
  public ndvis: IReporteNDVI[] = [];
  public generandoMuestra = false;
  public generandoSatelital = false;
  public readonly esLocal = ENV === 'Local';
  public capaSatelitalActiva: SatelliteIndicator['key'] = 'ndvi';

  private ndvi$?: Subscription;
  private refreshTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    public helper: HelperService,
    private listados: ListadosService,
    private dialogHandler: DialogHandlerService,
    private reporteNDVIService: ReporteNDVIService,
    private loteService: LoteService
  ) {}

  public onSelect(reporte: IReporteNDVI): void {
    this.reporte = reporte;
    this.fecha = reporte.fechaDeLaImagen ? new Date(reporte.fechaDeLaImagen) : this.hoy;
  }

  public get analisis(): NdviAnalisis {
    const ndvi = this.reporte?.ndviPromedio;
    const lluvia72 = this.suma(this.pronosticos.slice(0, 3).map((p) => this.numero(p.lluvia)));
    const et072 = this.suma(this.pronosticos.slice(0, 3).map((p) => this.numero(p.et0)));
    const balance = this.redondear(lluvia72 - et072);
    const balanceTxt = `${this.formatear(balance)} mm`;

    if (ndvi == null) {
      return {
        estado: 'Sin imagen activa',
        tono: 'warn',
        resumen: 'Todavia no hay una imagen NDVI seleccionada para interpretar.',
        recomendacion: 'Genera una muestra local o espera el worker satelital para comparar vigor por ambiente.',
        contexto: `Pronostico 72 h: lluvia ${this.formatear(lluvia72)} mm, ET0 ${this.formatear(et072)} mm.`,
        tendencia: 'Sin tendencia',
        balance72: balanceTxt,
      };
    }

    const base = this.estadoNdvi(ndvi);
    const tendencia = this.tendenciaNdvi();
    let recomendacion = 'Monitorear el lote y comparar la imagen con ambiente, suelo y manejo reciente.';

    if (ndvi < 0.35 && balance < -2) {
      recomendacion = 'Vigor bajo con balance seco: revisar humedad de suelo, riego y sectores con estres hidrico.';
    } else if (ndvi < 0.35 && lluvia72 > 12) {
      recomendacion = 'Vigor bajo con humedad alta: revisar anegamiento, enfermedades y zonas compactadas.';
    } else if (ndvi < 0.55 && balance < -2) {
      recomendacion = 'Vigor medio con demanda atmosferica: priorizar recorrida y verificar si hay deficit de agua.';
    } else if (ndvi < 0.55 && lluvia72 > 12) {
      recomendacion = 'Vigor medio con lluvias: revisar exceso de humedad y presion sanitaria por ambiente.';
    } else if (ndvi >= 0.72) {
      recomendacion = 'Vigor alto y cobertura buena: mantener monitoreo, especialmente si sube humedad o ET0.';
    }

    return {
      estado: base.estado,
      tono: base.tono,
      resumen: base.resumen,
      recomendacion,
      contexto: `Pronostico 72 h: lluvia ${this.formatear(lluvia72)} mm, ET0 ${this.formatear(et072)} mm.`,
      tendencia,
      balance72: balanceTxt,
    };
  }

  public get fechaImagenResumen(): string {
    if (!this.reporte?.fechaDeLaImagen) {
      return 'Sin imagen satelital activa';
    }
    const fechaImagen = new Date(this.reporte.fechaDeLaImagen);
    const fecha = fechaImagen.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
    });
    return `Ultima escena valida ${fecha}`;
  }

  public get imagenAtrasada(): boolean {
    if (!this.reporte?.fechaDeLaImagen) {
      return false;
    }
    return this.diasDesde(new Date(this.reporte.fechaDeLaImagen)) > 10;
  }

  public get satelliteIndicators(): SatelliteIndicator[] {
    const ndvi = this.reporte?.ndviPromedio;
    const ndviValue = ndvi == null ? 'Pendiente' : this.formatear(ndvi);
    const indices = this.reporte?.indices;
    const imagenes = this.reporte?.imagenes;
    const indexValue = (key: keyof NonNullable<IReporteNDVI['indices']>) =>
      indices?.[key] == null ? (this.reporte ? 'Pendiente' : 'Preparado') : this.formatear(indices[key]!);
    const indexStatus = (...keys: (keyof NonNullable<IReporteNDVI['indices']>)[]) =>
      keys.some((key) => indices?.[key] != null) ? 'activo' : 'preparado';
    return [
      {
        key: 'ndvi',
        label: 'NDVI',
        value: indexValue('ndvi') === 'Preparado' ? ndviValue : indexValue('ndvi'),
        detail: 'Vigor verde y cobertura activa del lote.',
        source: this.reporte?.coleccion || 'Sentinel-2 B08/B04',
        image: imagenes?.ndvi || this.reporte?.ndviUrl,
        lectura: this.lecturaIndice('ndvi', indices?.ndvi ?? ndvi),
        status: this.reporte ? 'activo' : 'preparado',
      },
      {
        key: 'ndmi',
        label: 'NDMI',
        value: indexValue('ndmi'),
        detail: 'Agua en canopia y estrés hídrico de la biomasa.',
        source: 'Sentinel-2 B08/B11',
        image: imagenes?.ndmi,
        lectura: this.lecturaIndice('ndmi', indices?.ndmi),
        status: indexStatus('ndmi'),
      },
      {
        key: 'ndwi',
        label: 'NDWI',
        value: indexValue('ndwi'),
        detail: 'Humedad superficial y contraste agua/suelo.',
        source: 'Sentinel-2 B03/B08',
        image: imagenes?.ndwi,
        lectura: this.lecturaIndice('ndwi', indices?.ndwi),
        status: indexStatus('ndwi'),
      },
      {
        key: 'ndre',
        label: 'NDRE',
        value: indexValue('ndre'),
        detail: 'Clorofila y respuesta a nitrógeno en etapas avanzadas.',
        source: 'Sentinel-2 B08/B05',
        image: imagenes?.ndre,
        lectura: this.lecturaIndice('ndre', indices?.ndre),
        status: indexStatus('ndre'),
      },
      {
        key: 'savi',
        label: 'SAVI',
        value: indexValue('savi'),
        detail: 'Vigor corregido para suelo expuesto.',
        source: 'Sentinel-2 multibanda',
        image: imagenes?.savi,
        lectura: this.lecturaIndice('savi', indices?.savi),
        status: indexStatus('savi'),
      },
      {
        key: 'evi',
        label: 'EVI',
        value: indexValue('evi'),
        detail: 'Vigor mejorado para alta biomasa.',
        source: 'Sentinel-2 multibanda',
        image: imagenes?.evi,
        lectura: this.lecturaIndice('evi', indices?.evi),
        status: indexStatus('evi'),
      },
    ];
  }

  public get capaActiva(): SatelliteIndicator {
    return (
      this.satelliteIndicators.find((indicator) => indicator.key === this.capaSatelitalActiva) ||
      this.satelliteIndicators[0]
    );
  }

  public get imagenCapaActiva(): string | undefined {
    return this.capaActiva?.image || this.reporte?.ndviUrl;
  }

  public seleccionarCapa(indicator: SatelliteIndicator): void {
    if (indicator.status === 'activo') {
      this.capaSatelitalActiva = indicator.key;
    }
  }

  private lecturaIndice(key: SatelliteIndicator['key'], value?: number): string {
    if (value == null) {
      return 'La capa queda preparada y se completa cuando el worker procese una escena con las bandas necesarias.';
    }

    const tendencia = this.tendenciaIndice(key);
    const sufijo = tendencia ? ` ${tendencia}` : '';

    if (key === 'ndvi') {
      if (value < 0.35) return `Vigor bajo: revisar implantación, suelo desnudo, estrés hídrico o presión sanitaria.${sufijo}`;
      if (value < 0.55) return `Vigor medio: conviene recorrer ambientes y comparar con lluvia, riego y fertilización.${sufijo}`;
      return `Cobertura activa buena: sostener monitoreo y buscar cambios por ambiente.${sufijo}`;
    }

    if (key === 'ndmi') {
      if (value < -0.05) return `Señal seca en canopia: puede indicar demanda de agua, estrés o baja cobertura.${sufijo}`;
      if (value > 0.25) return `Canopia con buena humedad: vigilar enfermedades si coincide con HR alta y lluvias.${sufijo}`;
      return `Humedad de canopia intermedia: usar junto con riego, NDVI y pronóstico.${sufijo}`;
    }

    if (key === 'ndwi') {
      if (value < -0.15) return `Superficie seca o suelo expuesto: revisar balance hídrico y sectores de bajo vigor.${sufijo}`;
      if (value > 0.1) return `Señal húmeda: revisar anegamiento, bajos o exceso de agua reciente.${sufijo}`;
      return `Humedad superficial moderada: comparar con lluvia acumulada y textura de suelo.${sufijo}`;
    }

    if (key === 'ndre') {
      if (value < 0.12) return `Baja señal de clorofila: revisar nitrógeno, estado fenológico y sanidad foliar.${sufijo}`;
      if (value > 0.32) return `Buena respuesta de clorofila: útil para seguir nutrición y hoja funcional.${sufijo}`;
      return `Clorofila intermedia: mirar tendencia antes de recomendar correcciones.${sufijo}`;
    }

    if (key === 'savi') {
      if (value < 0.25) return `Vigor ajustado bajo con peso de suelo expuesto: revisar nacimiento y cobertura.${sufijo}`;
      return `Vigor ajustado estable: buena capa para comparar lotes con cobertura parcial.${sufijo}`;
    }

    if (value < 0.25) return `EVI bajo: posible baja biomasa o estrés; confirmar con NDVI y recorrida.${sufijo}`;
    return `EVI acompaña biomasa activa; útil cuando NDVI empieza a saturarse en coberturas altas.${sufijo}`;
  }

  private tendenciaIndice(key: SatelliteIndicator['key']): string {
    if (!this.reporte?.indices || this.ndvis.length < 2) {
      return '';
    }
    const actual = this.reporte.indices[key] ?? (key === 'ndvi' ? this.reporte.ndviPromedio : undefined);
    if (actual == null) {
      return '';
    }
    const index = this.ndvis.findIndex((item) => item._id === this.reporte?._id);
    const previo = this.ndvis[index >= 0 ? index + 1 : 1];
    const previoValue = previo?.indices?.[key] ?? (key === 'ndvi' ? previo?.ndviPromedio : undefined);
    if (previoValue == null) {
      return '';
    }
    const delta = this.redondear(actual - previoValue);
    if (Math.abs(delta) < 0.03) {
      return 'Sin cambio importante contra la escena anterior.';
    }
    return delta > 0
      ? `Mejora ${this.formatear(delta)} contra la escena anterior.`
      : `Cae ${this.formatear(Math.abs(delta))} contra la escena anterior.`;
  }

  private calcularFechaMinima(): void {
    if (this.ndvis.length > 0) {
      const fechaMinimaNDVI = new Date(this.ndvis[this.ndvis.length - 1].fechaCreacion!);
      this.fechaMinima = new Date(
        fechaMinimaNDVI.getFullYear(),
        fechaMinimaNDVI.getMonth(),
        fechaMinimaNDVI.getDate() + 1
      );
    } else if (this.siembra?.fechaCosecha) {
      const fechaCosecha = new Date(this.siembra.fechaCosecha);
      this.fechaMinima = new Date(fechaCosecha.getFullYear(), fechaCosecha.getMonth(), fechaCosecha.getDate() + 1);
    } else {
      this.fechaMinima = new Date(this.hoy.getFullYear(), this.hoy.getMonth() - 1, this.hoy.getDate() + 1);
    }
  }

  private async listarNDVIs(): Promise<void> {
    const filter: IFilter<IReporteNDVI> = {
      idLote: this.lote?._id,
      fechaCreacion: {
        $gte: this.fechaMinima.toISOString(),
      },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 0,
      sort: '-fechaCreacion',
    };

    this.ndvi$?.unsubscribe();
    this.ndvi$ = this.listados.subscribe<IListado<IReporteNDVI>>('reportendvis', query).subscribe((data) => {
      this.ndvis = data.datos;
      this.calcularFechaMinima();
      if (this.ndvis.length > 0) {
        const estaEnLista = this.reporte && this.ndvis.some((n) => n._id === this.reporte!._id);
        if (!estaEnLista) {
          this.reporte = this.ndvis[0];
          this.fecha = new Date(this.ndvis[0].fechaCreacion!);
        }
      } else {
        this.reporte = undefined;
      }
    });

    await this.listados.getLastValue('reportendvis', query);
  }

  public mostrarLeyenda(): void {
    this.dialogHandler.open(NdviLegendComponent, {
      header: 'Leyenda NDVI',
      width: '250px',
      data: {
        orientation: 'vertical',
      },
    });
  }

  public async generarMuestraLocal(event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!this.lote?._id || this.generandoMuestra) return;

    this.generandoMuestra = true;
    try {
      const fecha = new Date().toISOString();
      await this.reporteNDVIService.crear({
        idLote: this.lote._id,
        idEstablecimiento: this.lote.idEstablecimiento,
        idProductor: this.lote.idProductor,
        idDistribuidor: this.lote.idDistribuidor,
        idQuimica: this.lote.idQuimica,
        idDepartamento: this.lote.idDepartamento,
        fechaCreacion: fecha,
        fechaDelReporte: fecha,
        fechaDeLaImagen: fecha,
        ndviPromedio: 0.62,
        ndviUrl: this.crearImagenNdviLocal(),
        coleccion: 'Muestra local CHAMAN2026',
      });
      await this.listarNDVIs();
      this.helper.notifSuccess('Muestra NDVI local creada');
    } catch (error) {
      this.helper.notifError(error);
    }
    this.generandoMuestra = false;
  }

  public async generarNdviSatelital(event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!this.lote?._id || this.generandoSatelital) return;

    this.generandoSatelital = true;
    try {
      const response = await this.loteService.generarNdvi(this.lote._id);
      if (response.encolado) {
        this.helper.notifSuccess(response.mensaje || 'NDVI satelital encolado');
        this.programarRefrescosSatelitales();
      } else {
        this.helper.notifWarn(response.mensaje || 'No se pudo encolar NDVI');
      }
    } catch (error) {
      this.helper.notifError(error);
    }
    this.generandoSatelital = false;
  }

  private get pronosticos(): IPronosticoEstacionMeteorologica[] {
    return ((this.lote as any)?.establecimiento?.prediccionClimatica?.pronosticos || []) as IPronosticoEstacionMeteorologica[];
  }

  private estadoNdvi(ndvi: number): Pick<NdviAnalisis, 'estado' | 'tono' | 'resumen'> {
    if (ndvi >= 0.72) {
      return {
        estado: 'Vigor alto',
        tono: 'ok',
        resumen: 'Cobertura activa y uniforme para una siembra en buen estado.',
      };
    }
    if (ndvi >= 0.55) {
      return {
        estado: 'Vigor bueno',
        tono: 'ok',
        resumen: 'El lote mantiene actividad verde, conviene seguir la evolucion por ambientes.',
      };
    }
    if (ndvi >= 0.35) {
      return {
        estado: 'Vigor medio',
        tono: 'warn',
        resumen: 'Hay senales de heterogeneidad o cobertura parcial que justifican recorrida.',
      };
    }
    return {
      estado: 'Vigor bajo',
      tono: 'risk',
      resumen: 'Puede indicar estres, suelo descubierto, fallas de implantacion o problemas sanitarios.',
    };
  }

  private tendenciaNdvi(): string {
    if (!this.reporte?.ndviPromedio || this.ndvis.length < 2) {
      return 'Sin comparativo previo';
    }
    const index = this.ndvis.findIndex((item) => item._id === this.reporte?._id);
    const previo = this.ndvis[index >= 0 ? index + 1 : 1];
    if (!previo?.ndviPromedio) {
      return 'Sin comparativo previo';
    }
    const delta = this.redondear(this.reporte.ndviPromedio - previo.ndviPromedio);
    if (Math.abs(delta) < 0.03) {
      return 'Estable respecto al reporte anterior';
    }
    return delta > 0 ? `Sube ${this.formatear(delta)}` : `Baja ${this.formatear(Math.abs(delta))}`;
  }

  private crearImagenNdviLocal(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 220">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#efe6bc"/>
            <stop offset="0.32" stop-color="#cadf7a"/>
            <stop offset="0.66" stop-color="#65b85b"/>
            <stop offset="1" stop-color="#1f7a3f"/>
          </linearGradient>
        </defs>
        <rect width="260" height="220" rx="10" fill="#f5f7ef"/>
        <path d="M38 30 L214 22 L232 188 L52 198 Z" fill="url(#g)"/>
        <path d="M52 58 C82 38 96 88 128 70 C164 50 174 98 210 82" fill="none" stroke="#f7f2d0" stroke-width="18" opacity=".45"/>
        <path d="M64 158 C96 135 132 170 164 144 C184 128 202 138 222 120" fill="none" stroke="#0e5d31" stroke-width="16" opacity=".28"/>
        <text x="24" y="32" font-family="Arial" font-size="13" fill="#31405a">NDVI local</text>
        <text x="24" y="52" font-family="Arial" font-size="22" font-weight="700" fill="#1f7a3f">0.62</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  private suma(values: Array<number | null | undefined>): number {
    return this.redondear(values.reduce<number>((acc, value) => acc + (value || 0), 0));
  }

  private numero(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return value;
  }

  private redondear(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private formatear(value: number): string {
    return value.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }

  private diasDesde(fecha: Date): number {
    const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
    const fin = new Date(this.hoy.getFullYear(), this.hoy.getMonth(), this.hoy.getDate()).getTime();
    return Math.max(0, Math.round((fin - inicio) / 86400000));
  }

  private programarRefrescosSatelitales(intentos = 4): void {
    if (intentos <= 0) return;
    clearTimeout(this.refreshTimeout);
    this.refreshTimeout = setTimeout(async () => {
      await this.listarNDVIs();
      if (!this.ndvis.length) {
        this.programarRefrescosSatelitales(intentos - 1);
      }
    }, 12000);
  }

  async ngOnInit(): Promise<void> {
    this.calcularFechaMinima();
    await this.listarNDVIs();
  }

  ngOnDestroy(): void {
    this.ndvi$?.unsubscribe();
    clearTimeout(this.refreshTimeout);
  }
}
