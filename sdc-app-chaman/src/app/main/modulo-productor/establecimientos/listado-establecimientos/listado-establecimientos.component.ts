import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IEstablecimiento, IListado, ILote, IQueryParam } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { EstablecimientoService } from '../../../../auxiliares/http/establecimiento.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

interface IndicadorEstablecimiento {
  label: string;
  value: string;
  detail: string;
  tooltip: string;
  tone: 'ok' | 'warn' | 'danger' | 'muted' | 'info';
}

@Component({
  selector: 'app-listado-establecimientos',
  imports: [SharedModule],
  templateUrl: './listado-establecimientos.component.html',
  styleUrl: './listado-establecimientos.component.scss',
})
export class ListadoEstablecimientosComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoEstablecimientosComponent.name;
  public dataSource: IEstablecimiento[] = [];
  public lotes: ILote[] = [];
  public totalCount = 0;

  public dataSource$?: Subscription;
  public lotes$?: Subscription;

  private readonly numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
  private readonly entero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  private readonly fecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' });
  private lotesPorEstablecimiento = new Map<string, ILote[]>();

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: EstablecimientoService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editEstablecimiento', false);
    this.router.navigate(['establecimientos', 'crear']);
  }

  public async edit(data: IEstablecimiento) {
    this.params.set('editEstablecimiento', data);
    this.router.navigate(['establecimientos', 'editar', data._id]);
  }

  public async abrirMapa(data: IEstablecimiento) {
    this.params.set('establecimientoMapa', data);
    this.router.navigate(['mapa']);
  }

  public async delete(dato: IEstablecimiento): Promise<void> {
    this.confirmationService.confirm({
      header: this.translate.instant('Por favor, confirme la accion'),
      message: this.translate.instant('Desea eliminar el establecimiento?'),
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

          this.listado.deleteEntityItem('establecimientos', dato._id!);

          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  public estadoOperativo(data: IEstablecimiento): string {
    const lotes = this.getLotes(data);
    if (lotes.some((lote) => lote.siembra?.activa)) return 'Campana activa';
    if (data.climaActual?.clima || data.idEstacionMeteorologica) return 'Clima conectado';
    if (lotes.length) return 'Con lotes';
    return 'Base cargada';
  }

  public estadoOperativoClase(data: IEstablecimiento): string {
    const lotes = this.getLotes(data);
    if (lotes.some((lote) => lote.siembra?.activa)) return 'active';
    if (data.climaActual?.clima || data.idEstacionMeteorologica) return 'climate';
    if (lotes.length) return 'loaded';
    return 'pending';
  }

  public ubicacionResumen(data: IEstablecimiento): string {
    const ubicacion = data.ubicacionOficial;
    const partes = this.unicos([
      ubicacion?.localidadReferencia?.nombre,
      ubicacion?.nivelAdministrativo2?.nombre,
      ubicacion?.provincia?.nombre,
    ]);
    if (partes.length) return partes.join(' - ');

    const punto = ubicacion?.puntoRepresentativo?.coordinates;
    const centro = data.ubicacion?.[0]?.centro || (punto?.length ? { lng: punto[0], lat: punto[1] } : undefined);
    if (centro?.lat != null && centro?.lng != null) {
      return `${this.numero.format(Number(centro.lat))}, ${this.numero.format(Number(centro.lng))}`;
    }
    return 'Ubicacion pendiente';
  }

  public productorResumen(data: IEstablecimiento): string {
    if (data.productor?.nombre) return data.productor.nombre;
    if (data.distribuidor?.nombre) return data.distribuidor.nombre;
    if (data.quimica?.nombre) return data.quimica.nombre;
    return 'Sin productor vinculado';
  }

  public fuenteClima(data: IEstablecimiento): string {
    if (data.fuenteClimaPreferida) return data.fuenteClimaPreferida;
    if (data.climaActual?.clima?.fuente) return data.climaActual.clima.fuente;
    if (data.idEstacionMeteorologica) return 'Central asignada';
    if (this.tieneUbicacion(data)) return 'Open-Meteo';
    return 'Clima pendiente';
  }

  public poligonosResumen(data: IEstablecimiento): string {
    const cantidad = data.ubicacion?.length || 0;
    if (!cantidad) return 'Sin poligono';
    return `${cantidad} poligono${cantidad === 1 ? '' : 's'}`;
  }

  public cultivosResumen(data: IEstablecimiento): string {
    const cultivos = this.cultivos(data);
    if (!cultivos.length) return 'Sin cultivos activos';
    if (cultivos.length <= 2) return cultivos.join(' / ');
    return `${cultivos.length} cultivos`;
  }

  public indicadores(data: IEstablecimiento): IndicadorEstablecimiento[] {
    return [
      this.indicadorLotes(data),
      this.indicadorSuperficie(data),
      this.indicadorCultivos(data),
      this.indicadorClima(data),
      this.indicadorSensores(data),
    ];
  }

  private indicadorLotes(data: IEstablecimiento): IndicadorEstablecimiento {
    const lotes = this.getLotes(data);
    const activos = lotes.filter((lote) => lote.siembra?.activa).length;
    return {
      label: 'Lotes',
      value: lotes.length ? this.entero.format(lotes.length) : '0',
      detail: activos ? `${activos} activos` : 'Sin campana',
      tooltip: lotes.length
        ? `${lotes.length} lotes asociados al establecimiento.`
        : 'Crear lotes para activar seguimiento agronomico.',
      tone: lotes.length ? 'ok' : 'muted',
    };
  }

  private indicadorSuperficie(data: IEstablecimiento): IndicadorEstablecimiento {
    const total = this.superficieTotal(data);
    return {
      label: 'Superficie',
      value: total > 0 ? this.numero.format(total) : 'Pendiente',
      detail: total > 0 ? 'ha cargadas' : 'Sin hectareas',
      tooltip:
        total > 0
          ? `${this.numero.format(total)} ha calculadas desde lotes o poligono del establecimiento.`
          : 'Dibujar poligono o cargar lotes para calcular superficie.',
      tone: total > 0 ? 'ok' : 'warn',
    };
  }

  private indicadorCultivos(data: IEstablecimiento): IndicadorEstablecimiento {
    const cultivos = this.cultivos(data);
    return {
      label: 'Cultivos',
      value: cultivos.length ? this.entero.format(cultivos.length) : '0',
      detail: cultivos.length ? cultivos.slice(0, 2).join(' / ') : 'Sin siembra',
      tooltip: cultivos.length
        ? `Cultivos activos detectados: ${cultivos.join(', ')}.`
        : 'No hay cultivos activos cargados en los lotes asociados.',
      tone: cultivos.length ? 'info' : 'muted',
    };
  }

  private indicadorClima(data: IEstablecimiento): IndicadorEstablecimiento {
    const fecha = data.climaActual?.fecha || data.climaActual?.clima?.fecha;
    if (fecha) {
      return {
        label: 'Clima',
        value: 'Actual',
        detail: this.fechaRelativa(fecha),
        tooltip: `Lectura climatica disponible. Fuente: ${this.fuenteClima(data)}.`,
        tone: 'ok',
      };
    }
    if (data.prediccionClimatica?.pronosticos?.length) {
      return {
        label: 'Clima',
        value: 'Pronostico',
        detail: '72 h',
        tooltip: `Pronostico disponible. Fuente: ${this.fuenteClima(data)}.`,
        tone: 'info',
      };
    }
    return {
      label: 'Clima',
      value: this.tieneUbicacion(data) ? 'Pendiente' : 'Sin ubic.',
      detail: this.tieneUbicacion(data) ? 'Sin lectura' : 'Revisar mapa',
      tooltip: this.tieneUbicacion(data)
        ? 'El establecimiento tiene ubicacion, pero no registra lectura climatica reciente.'
        : 'Cargar ubicacion para habilitar clima y pronosticos.',
      tone: this.tieneUbicacion(data) ? 'warn' : 'muted',
    };
  }

  private indicadorSensores(data: IEstablecimiento): IndicadorEstablecimiento {
    const sensores = this.sensores(data);
    const central = data.idEstacionMeteorologica || data.estacionMeteorologica;
    const total = sensores + (central ? 1 : 0);
    return {
      label: 'Sensores',
      value: total ? this.entero.format(total) : '0',
      detail: central ? 'Incluye central' : 'Campo/lotes',
      tooltip: total
        ? `${total} dispositivos o centrales asociados directa o indirectamente.`
        : 'Sin dispositivos asociados al establecimiento o sus lotes.',
      tone: total ? 'ok' : 'muted',
    };
  }

  private superficieTotal(data: IEstablecimiento): number {
    const lotes = this.getLotes(data);
    const superficieLotes = lotes.reduce((acc, lote) => acc + this.toNumber(lote.ubicacion?.superficie), 0);
    if (superficieLotes > 0) return superficieLotes;
    return (data.ubicacion || []).reduce((acc, ubicacion) => acc + this.toNumber(ubicacion.superficie), 0);
  }

  private cultivos(data: IEstablecimiento): string[] {
    const cultivos = this.getLotes(data)
      .map((lote) => lote.siembra?.semilla?.cultivo)
      .filter((cultivo) => !!cultivo)
      .map((cultivo) => String(cultivo));
    return this.unicos(cultivos);
  }

  private sensores(data: IEstablecimiento): number {
    const ids = new Set<string>();
    this.getLotes(data).forEach((lote) => {
      (lote.idsDispositivo || []).forEach((id) => ids.add(id));
      (lote.dispositivos || []).forEach((dispositivo) => {
        if (dispositivo._id) ids.add(dispositivo._id);
      });
    });
    return ids.size;
  }

  private getLotes(data: IEstablecimiento): ILote[] {
    if (!data._id) return [];
    return this.lotesPorEstablecimiento.get(data._id) || [];
  }

  private reconstruirLotesPorEstablecimiento(): void {
    this.lotesPorEstablecimiento = new Map<string, ILote[]>();
    this.lotes.forEach((lote) => {
      const id = lote.idEstablecimiento || lote.establecimiento?._id;
      if (!id) return;
      const actuales = this.lotesPorEstablecimiento.get(id) || [];
      actuales.push(lote);
      this.lotesPorEstablecimiento.set(id, actuales);
    });
  }

  private tieneUbicacion(data: IEstablecimiento): boolean {
    const punto = data.ubicacionOficial?.puntoRepresentativo?.coordinates;
    const centro = data.ubicacion?.[0]?.centro || (punto?.length ? { lng: punto[0], lat: punto[1] } : undefined);
    return centro?.lat != null && centro?.lng != null;
  }

  private fechaRelativa(fecha: string): string {
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return 'Fecha a revisar';
    const diff = Date.now() - date.getTime();
    const dias = Math.floor(diff / 86400000);
    if (dias <= 0) return `Hoy ${this.fecha.format(date)}`;
    if (dias === 1) return 'Ayer';
    if (dias < 8) return `Hace ${dias} dias`;
    return this.fecha.format(date);
  }

  private unicos(valores: Array<string | undefined>): string[] {
    return Array.from(new Set(valores.map((valor) => valor?.trim()).filter((valor): valor is string => !!valor)));
  }

  private toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private async listar(): Promise<void> {
    const populate = [
      { path: 'productor', select: 'nombre' },
      { path: 'distribuidor', select: 'nombre' },
      { path: 'quimica', select: 'nombre' },
      { path: 'estacionMeteorologica', select: 'name origen estado idExterno' },
    ];
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };

    this.dataSource$?.unsubscribe();
    this.dataSource$ = this.listado
      .subscribe<IListado<IEstablecimiento>>('establecimientos', queryParams)
      .subscribe(async (data) => {
        this.totalCount = data.totalCount;
        this.dataSource = data.datos;
      });
    await this.listado.getLastValue('establecimientos', queryParams);
  }

  private async listarLotes(): Promise<void> {
    const populate = [
      {
        path: 'siembra',
        populate: {
          path: 'semilla',
          select: 'cultivo variedad',
        },
      },
      { path: 'dispositivos', select: 'tipo name' },
    ];
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };

    this.lotes$?.unsubscribe();
    this.lotes$ = this.listado.subscribe<IListado<ILote>>('lotes', queryParams).subscribe(async (data) => {
      this.lotes = data.datos || [];
      this.reconstruirLotesPorEstablecimiento();
    });
    await this.listado.getLastValue('lotes', queryParams);
  }

  public async ngOnInit() {
    this.loading = true;
    await Promise.all([this.listar(), this.listarLotes()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.dataSource$?.unsubscribe();
    this.lotes$?.unsubscribe();
  }
}
