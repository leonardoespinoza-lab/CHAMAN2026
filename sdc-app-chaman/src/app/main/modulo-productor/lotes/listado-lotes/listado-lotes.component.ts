import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IClimaEstacionMeteorologica, IListado, ILote, IQueryParam } from 'modelos/src';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { evaluarRiegoFrontend } from '../riego-evidence';
import { evaluarSanidadFrontend } from '../sanidad-evidence';

export interface ILoteTabla extends ILote {
  estacion?: IClimaEstacionMeteorologica;
}

interface IndicadorLote {
  label: string;
  value: string;
  detail: string;
  tooltip: string;
  tone: 'ok' | 'warn' | 'danger' | 'muted' | 'info';
}

@Component({
  selector: 'app-listado-lotes',
  imports: [SharedModule],
  templateUrl: './listado-lotes.component.html',
  styleUrl: './listado-lotes.component.scss',
})
export class ListadoLotesComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoLotesComponent.name;
  public dataSource: ILoteTabla[] = [];
  public totalCount = 0;
  public expandedRow: ILoteTabla | null = null;
  private readonly numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
  private readonly entero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

  public dataSource$?: Subscription;

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private translate: TranslateService,
    private service: LoteService,
    private params: ParamsService,
    private router: Router
  ) {}

  // Acciones
  public async detalles(data: ILoteTabla) {
    this.params.set('detallesLote', data);
    this.router.navigate(['lotes', 'detalles', data._id]);
  }

  public async create() {
    this.params.set('editLote', false);
    this.router.navigate(['lotes', 'crear']);
  }

  public async edit(data: ILoteTabla) {
    this.params.set('editLote', data);
    this.router.navigate(['lotes', 'editar', data._id]);
  }

  public async delete(dato: ILoteTabla): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar el lote?'),
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
        this.loading = true;
        try {
          await this.service.eliminar(dato._id!);

          // Solo elimina el item en cache
          this.listado.deleteEntityItem('lotes', dato._id!);

          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  public async fertilizar(data: ILoteTabla): Promise<void> {
    this.params.set('fertilizarLote', data);
    this.params.set('editFertilizacion', false);
    this.router.navigate(['lotes', 'fertilizar', data._id]);
  }

  public async fumigar(data: ILoteTabla): Promise<void> {
    this.params.set('fumigarLote', data);
    this.params.set('editFumigacion', false);
    this.router.navigate(['lotes', 'fumigar', data._id]);
  }

  public async cosechar(data: ILoteTabla): Promise<void> {
    this.params.set('cosecharLote', data);
    this.router.navigate(['lotes', 'cosechar', data._id]);
  }

  public async sembrar(data: ILoteTabla): Promise<void> {
    this.params.set('sembrarLote', data);
    this.router.navigate(['lotes', 'sembrar', data._id]);
  }

  public elegirColor(n?: number) {
    switch (n) {
      case 1:
        return {
          color: 'green',
        };
      case 2:
        return {
          color: 'yellow',
        };
      case 3:
        return {
          color: 'red',
        };
      default:
        return {
          color: 'grey',
        };
    }
  }

  public getText(n?: number) {
    switch (n) {
      case 1:
        return this.translate.instant('Excelente');
      case 2:
        return this.translate.instant('Bueno');
      case 3:
        return this.translate.instant('Malo');
      default:
        return this.translate.instant('Sin datos');
    }
  }

  public estadoSiembra(data: ILoteTabla): string {
    if (data.siembra?.activa) return 'Campana activa';
    if (data.siembra?.fechaCosecha) return 'Cosechado';
    if (data.siembra?._id) return 'Siembra cargada';
    return 'Sin siembra';
  }

  public estadoSiembraClase(data: ILoteTabla): string {
    if (data.siembra?.activa) return 'active';
    if (data.siembra?.fechaCosecha) return 'harvested';
    if (data.siembra?._id) return 'loaded';
    return 'pending';
  }

  public ubicacionResumen(data: ILoteTabla): string {
    const partes = [
      data.establecimiento?.nombre,
      data.departamento?.nombre,
      data.departamento?.provincia?.nombre,
    ].filter(Boolean);
    if (partes.length) return partes.join(' · ');
    const centro = data.ubicacion?.centro;
    if (centro?.lat != null && centro?.lng != null) {
      return `${this.numero.format(Number(centro.lat))}, ${this.numero.format(Number(centro.lng))}`;
    }
    return 'Ubicacion pendiente';
  }

  public cultivoResumen(data: ILoteTabla): string {
    const cultivo = data.siembra?.semilla?.cultivo;
    const variedad = data.siembra?.semilla?.variedad;
    if (!cultivo) return 'Sin cultivo asignado';
    return [cultivo, variedad].filter(Boolean).join(' · ');
  }

  public superficie(data: ILoteTabla): string {
    const superficie = Number(data.ubicacion?.superficie || 0);
    return superficie > 0 ? `${this.numero.format(superficie)} ha` : 'Superficie pendiente';
  }

  public dispositivosResumen(data: ILoteTabla): string {
    const cantidad = data.dispositivos?.length || 0;
    if (!cantidad) return 'Sin sensores';
    return `${cantidad} sensor${cantidad === 1 ? '' : 'es'}`;
  }

  public indicadores(data: ILoteTabla): IndicadorLote[] {
    return [
      this.indicadorEnfermedades(data),
      this.indicadorMalezas(data),
      this.indicadorRiego(data),
      this.indicadorHuella(data),
      this.indicadorClima(data),
    ];
  }

  private indicadorEnfermedades(data: ILoteTabla): IndicadorLote {
    const evidencia = evaluarSanidadFrontend(data.siembra);
    if (evidencia.maximo === undefined) {
      if (evidencia.noAgregables.length) {
        return {
          label: 'Sanidad',
          value: 'Precaucion',
          detail: `${evidencia.noAgregables.length} modelo${evidencia.noAgregables.length === 1 ? '' : 's'} en seguimiento`,
          tooltip: 'Semaforo amarillo: existen lecturas provisionales, experimentales o incompletas. Se muestran dentro del lote, pero no constituyen una alerta confirmada.',
          tone: 'warn',
        };
      }
      return {
        label: 'Sanidad',
        value: 'Precaucion',
        detail: 'Enfermedades',
        tooltip: 'Abrir el lote para ejecutar o revisar prediccion de enfermedades.',
        tone: 'warn',
      };
    }
    const max = evidencia.maximo;
    return {
      label: 'Sanidad',
      value: `${this.entero.format(max)}%`,
      detail: `${evidencia.operativas.length} enfermedad${evidencia.operativas.length === 1 ? '' : 'es'} operativa${evidencia.operativas.length === 1 ? '' : 's'}`,
      tooltip: `Mayor riesgo sanitario calculado: ${this.entero.format(max)}%.`,
      tone: max >= 70 ? 'danger' : max >= 40 ? 'warn' : 'ok',
    };
  }

  private indicadorMalezas(data: ILoteTabla): IndicadorLote {
    const prediccion = data.siembra?.ultimaPrediccionMalezas;
    const especies = prediccion?.especies || [];
    const max = especies.length
      ? Math.max(...especies.map((item) => Number(item.avancePct || item.emergenciaPct || 0)))
      : undefined;
    if (!prediccion || max === undefined) {
      return {
        label: 'Malezas',
        value: 'Pendiente',
        detail: 'Sin curva',
        tooltip: 'Todavia no hay prediccion de malezas persistida para este lote.',
        tone: 'muted',
      };
    }
    return {
      label: 'Malezas',
      value: `${this.entero.format(max)}%`,
      detail: prediccion.calidadDatos ? `Calidad ${prediccion.calidadDatos}` : 'Emergencia',
      tooltip: prediccion.resumen || 'Prediccion de emergencia de malezas.',
      tone: max >= 70 ? 'danger' : max >= 35 ? 'warn' : 'ok',
    };
  }

  private indicadorRiego(data: ILoteTabla): IndicadorLote {
    const predicciones = data.siembra?.ultimaPrediccionRiego || [];
    const evaluacion = evaluarRiegoFrontend(data.siembra, data);
    const primero = predicciones[0] as any;
    const aguaUtilPct = evaluacion.serieDisponible ? Number(primero?.aguaUtilPct ?? Number.NaN) : Number.NaN;

    if (evaluacion.serieDisponible) {
      const value = Number.isFinite(aguaUtilPct)
        ? `${this.entero.format(aguaUtilPct)}%`
        : evaluacion.aguaUtilValor !== null
          ? `${this.numero.format(evaluacion.aguaUtilValor)} mm`
          : evaluacion.esEstimada
            ? 'Estimado'
            : 'Calculado';
      return {
        label: 'Riego',
        value,
        detail: evaluacion.esEstimada ? 'Balance modelado' : 'Agua util',
        tooltip: evaluacion.esEstimada
          ? evaluacion.origenEstado === 'legacy_v13'
            ? 'Estimacion legacy V13 reconocida por balance explicito; validar con sensor antes de decidir.'
            : 'Estimacion por clima, cultivo y suelo; validar con sensor antes de una decision critica.'
          : 'Calculo de riego disponible con estado operativo valido.',
        tone: Number.isFinite(aguaUtilPct) && aguaUtilPct < 35 ? 'warn' : evaluacion.esEstimada ? 'info' : 'ok',
      };
    }

    const tieneDatoNoValidado = predicciones.length > 0 || data.siembra?.aguaUtilReal != null;
    if (evaluacion.estado === 'estimada') {
      return {
        label: 'Riego',
        value: 'Estimacion pendiente',
        detail: 'Sin serie valida',
        tooltip: 'El estado es estimado, pero no hay cantidades validas; no se interpreta como ausencia de demanda.',
        tone: 'info',
      };
    }
    return {
      label: 'Riego',
      value: evaluacion.tieneSensor ? 'Sensor' : 'Sin sensor',
      detail:
        evaluacion.estado === 'fallida'
          ? 'Calculo fallido'
          : evaluacion.tieneSensor
            ? 'Sin recomendacion'
            : 'Pendiente',
      tooltip:
        evaluacion.estado === 'fallida' || evaluacion.estado === 'no_disponible' || tieneDatoNoValidado
          ? 'La recomendacion figura no disponible o fallida; no se muestran filas previas como vigentes.'
          : evaluacion.tieneSensor
            ? 'El lote tiene sensor de humedad asignado, pero no hay una recomendacion con estado valido.'
            : 'Asignar sensor o cargar un balance modelado valido para mejorar el seguimiento.',
      tone: evaluacion.tieneSensor ? 'info' : 'muted',
    };
  }

  private indicadorHuella(data: ILoteTabla): IndicadorLote {
    const huella = data.siembra?.huellaHidrica || data.huellaHidrica;
    const total = Number(huella?.total?.litrosKg || 0);
    if (total > 0) {
      return {
        label: 'Huella',
        value: `${this.entero.format(total)}`,
        detail: 'l/kg',
        tooltip: huella?.calidad
          ? `Huella consolidada. Calidad ${huella.calidad.nivel} (${huella.calidad.score}/100).`
          : 'Huella hidrica consolidada.',
        tone: 'ok',
      };
    }
    return {
      label: 'Huella',
      value: 'Seguim.',
      detail: 'En campana',
      tooltip: 'La huella se consolida al cosechar con rendimiento seco y clima del ciclo.',
      tone: 'info',
    };
  }

  private indicadorClima(data: ILoteTabla): IndicadorLote {
    const pronostico = data.establecimiento?.prediccionClimatica?.pronosticos?.[0] as any;
    const calidad = pronostico?.calidadDatos;
    const fuente = String(pronostico?.fuente || '');
    const fuenteNormalizada = fuente.toLowerCase().replace(/[^a-z]/g, '');
    const scoreFuente = fuenteNormalizada.includes('fieldclimate')
      ? 92
      : fuenteNormalizada.includes('meteoblue')
        ? 85
        : fuenteNormalizada.includes('meteosource')
          ? 72
          : fuenteNormalizada.includes('openmeteo')
            ? 62
            : undefined;
    const score = Number(calidad?.score ?? scoreFuente);
    const nivelFuente = String(
      calidad?.nivel || (Number.isFinite(score) ? (score >= 80 ? 'alta' : score >= 60 ? 'media' : 'baja') : '')
    ).toLowerCase();
    if (pronostico && ['alta', 'media', 'baja'].includes(nivelFuente)) {
      const etiqueta = nivelFuente.charAt(0).toUpperCase() + nivelFuente.slice(1);
      const fuenteActiva = fuente || 'fuente climatica activa';
      return {
        label: 'Clima',
        value: etiqueta,
        detail: Number.isFinite(score) ? `${this.entero.format(score)}/100` : 'Calidad',
        tooltip: `Calidad ${nivelFuente} de ${fuenteActiva}${Number.isFinite(score) ? ` (${this.entero.format(score)}/100)` : ''}.`,
        tone: nivelFuente === 'alta' ? 'ok' : nivelFuente === 'media' ? 'warn' : 'danger',
      };
    }

    const nivel = data.calidadClima?.nivel;
    return {
      label: 'Clima',
      value: this.getText(nivel),
      detail: 'Calidad',
      tooltip: `Calidad climatica para predicciones: ${this.getText(nivel)}.`,
      tone: nivel === 1 ? 'ok' : nivel === 2 ? 'warn' : nivel === 3 ? 'danger' : 'muted',
    };
  }

  // Listados

  private async listar(): Promise<void> {
    const populate = [
      {
        path: 'establecimiento',
        select: 'nombre climaActual prediccionClimatica',
      },
      {
        path: 'departamento',
        select: 'nombre idProvincia',
        populate: {
          path: 'provincia',
          select: 'nombre',
        },
      },
      {
        path: 'sondaSuelo',
        select: 'name.custom',
      },
      {
        path: 'siembra',
        populate: [
          {
            path: 'semilla',
          },
          {
            path: 'crono',
          },
        ],
      },
      { path: 'dispositivos' },
    ];
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };

    this.dataSource$?.unsubscribe();
    this.dataSource$ = this.listado.subscribe<IListado<ILote>>('lotes', queryParams).subscribe(async (data) => {
      this.totalCount = data.totalCount;
      this.dataSource = data.datos;
    });
    await this.listado.getLastValue('lotes', queryParams);
  }

  public async ngOnInit() {
    this.loading = true;
    await Promise.all([this.listar()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.dataSource$?.unsubscribe();
  }
}
