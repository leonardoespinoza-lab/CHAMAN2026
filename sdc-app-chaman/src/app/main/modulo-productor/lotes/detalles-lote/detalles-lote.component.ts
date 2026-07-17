import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  esCultivoPerenne,
  getNombreImplantacion,
  ICrono,
  IFertilizacion,
  IFumigacion,
  IEstadoFenologiaArveja,
  IDocumentoFichaVarietal,
  IQueryParam,
  IReferenciaTermicaVarietal,
  IResumenFichaVarietal,
  ISiembra,
  resolverFichaVarietal,
} from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { FenologiaService } from '../../../../auxiliares/http/fenologia.service';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { SiembraService } from '../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';
import { CardClimaLoteComponent } from './card-clima-lote/card-clima-lote.component';
import { CardCamarasLoteComponent } from './card-camaras-lote/card-camaras-lote.component';
import { CardCargaFitosanitariaComponent } from './card-carga-fitosanitaria/card-carga-fitosanitaria.component';
import { CardCalculosMeteorologicosComponent } from './card-calculos-meteorologicos/card-calculos-meteorologicos.component';
import { CardCentralMeteorologicaComponent } from './card-central-meteorologica/card-central-meteorologica.component';
import { CardDispositivosComponent } from './card-dispositivos/card-dispositivos.component';
import { CardEnfermedadesComponent } from './card-enfermedades/card-enfermedades.component';
import { CardEtapasFenologicasComponent } from './card-etapas-fenologicas/card-etapas-fenologicas.component';
import { CardFrioTermicoComponent } from './card-frio-termico/card-frio-termico.component';
import { CardHuellaHidricaComponent } from './card-huella-hidrica/card-huella-hidrica.component';
import { CardMalezasComponent } from './card-malezas/card-malezas.component';
import { CardNapasComponent } from './card-napas/card-napas.component';
import { CardNDVIComponent } from './card-ndvi/card-ndvi.component';
import { CardRendimientoComponent } from './card-rendimiento/card-rendimiento.component';
import { CardRiesgosAgroclimaticosComponent } from './card-riesgos-agroclimaticos/card-riesgos-agroclimaticos.component';
import { CardRiegoComponent } from './card-riego/card-riego.component';
import { CardUltimaFertilizacionComponent } from './card-ultima-fertilizacion/card-ultima-fertilizacion.component';
import { CardUltimaFumigacionComponent } from './card-ultima-fumigacion/card-ultima-fumigacion.component';
import { CardVientoLoteComponent } from './card-viento-lote/card-viento-lote.component';
import { DataQualityStripComponent } from './data-quality-strip/data-quality-strip.component';
import { CardUbicacionLoteComponent } from './card-ubicacion-lote/card-ubicacion-lote.component';
import { CardSueloAmbienteComponent } from './card-suelo-ambiente/card-suelo-ambiente.component';
import { DrawerListadoSiembrasComponent } from './drawer-listado-siembras/drawer-listado-siembras.component';

const CULTIVOS_CON_PREDICCION_MALEZAS = ['Soja', 'Trigo', 'Maiz'];

export interface IDetalleSiembra extends ISiembra {
  fumigaciones?: IFumigacion[];
}

export interface IDetallesLote extends ILoteTabla {
  fertilizaciones?: IFertilizacion[];
}

@Component({
  selector: 'app-detalles-lote',
  imports: [
    SharedModule,
    CardUltimaFumigacionComponent,
    CardDispositivosComponent,
    CardEnfermedadesComponent,
    CardCentralMeteorologicaComponent,
    CardClimaLoteComponent,
    CardRiegoComponent,
    CardHuellaHidricaComponent,
    CardUltimaFertilizacionComponent,
    CardRendimientoComponent,
    CardRiesgosAgroclimaticosComponent,
    DrawerListadoSiembrasComponent,
    CardNDVIComponent,
    CardEtapasFenologicasComponent,
    CardFrioTermicoComponent,
    CardMalezasComponent,
    CardNapasComponent,
    CardCamarasLoteComponent,
    CardVientoLoteComponent,
    CardCargaFitosanitariaComponent,
    CardCalculosMeteorologicosComponent,
    DataQualityStripComponent,
    CardUbicacionLoteComponent,
    CardSueloAmbienteComponent,
  ],
  templateUrl: './detalles-lote.component.html',
  styleUrl: './detalles-lote.component.scss',
})
export class DetallesLoteComponent implements OnInit, OnDestroy {
  private static readonly loteCache = new Map<string, IDetallesLote>();
  private static readonly lotePending = new Map<string, Promise<IDetallesLote>>();
  private static readonly siembraCache = new Map<string, IDetalleSiembra>();
  private static readonly cronoCache = new Map<string, ICrono | null>();
  private static readonly cronoPending = new Map<string, Promise<ICrono | null>>();

  public lote?: IDetallesLote;
  public siembra?: IDetalleSiembra;
  public siembraActual? = true;
  public esUltimaEtapa?: boolean;
  public verDrawerSiembras: boolean = false;
  public verCalidadDatos: boolean = false;
  public verFichaVarietal: boolean = false;
  public estadoFenologiaArveja?: IEstadoFenologiaArveja;
  public cargandoPrimario: boolean = false;
  public refrescandoDetalle: boolean = false;
  private readonly numeroAr = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
  private destroyed = false;

  constructor(
    private paramsService: ParamsService,
    public helper: HelperService,
    public params: ParamsService,
    private router: Router,
    private fenologiaService: FenologiaService,
    private activatedRoute: ActivatedRoute,
    private loteService: LoteService,
    private siembraService: SiembraService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService
  ) {}

  public verSiembraActual(): void {
    const siembra = this.getSiembraOperativa();
    if (!siembra) {
      this.siembra = undefined;
      this.siembraActual = false;
      return;
    }
    this.siembra = JSON.parse(JSON.stringify(siembra));
    this.siembraActual = !this.siembra?.fechaCosecha;
  }

  public async selectSiembra(siembra: ISiembra): Promise<void> {
    if (!siembra) return;
    let siembraCompleta = siembra as IDetalleSiembra;
    if (siembra._id && (!siembra.semilla || !siembra.crono)) {
      siembraCompleta = await this.obtenerSiembraCompleta(siembra);
    }
    await this.completarCronoSiembra(siembraCompleta);
    this.publicarSiembra(siembraCompleta, this.lote?.idSiembra === siembraCompleta._id);
  }

  public async refrescarDetalle(): Promise<void> {
    const idLote = this.lote?._id || this.activatedRoute.snapshot.paramMap.get('id');
    if (!idLote || this.refrescandoDetalle) return;
    await this.cargarLoteEnSegundoPlano(idLote);
  }

  public async sembrar(): Promise<void> {
    const data = this.lote;
    this.params.set('sembrarLote', data);
    this.params.set('editSiembra', false);
    this.router.navigate(['lotes', 'sembrar', data?._id]);
  }

  public async editarLote(): Promise<void> {
    if (!this.lote?._id) return;
    this.params.set('editLote', this.lote);
    this.router.navigate(['lotes', 'editar', this.lote._id]);
  }

  public async editarSiembra(): Promise<void> {
    if (!this.lote?._id || !this.siembra?._id) return;
    this.params.set('sembrarLote', this.lote);
    this.params.set('editSiembra', this.siembra);
    this.router.navigate(['lotes', 'sembrar', this.lote._id]);
  }

  public async cosechar(): Promise<void> {
    if (!this.lote?._id || !this.siembra?._id) return;
    this.params.set('cosecharLote', this.lote);
    this.params.set('editCosecha', this.siembra.fechaCosecha ? this.siembra : false);
    this.router.navigate(['lotes', 'cosechar', this.lote._id]);
  }

  public async descargarCertificado(): Promise<void> {
    if (!this.lote?._id) return;
    try {
      const fecha = new Date().toISOString().slice(0, 10);
      const nombreLote = this.slugArchivo(this.lote.nombre || 'lote');
      await this.loteService.certificado(this.lote._id, `certificado-chaman-${nombreLote}-${fecha}.html`);
    } catch (error) {
      this.helper.notifError(error);
    }
  }

  public async eliminarLote(event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!this.lote?._id) return;

    this.confirmationService.confirm({
      header: this.translate.instant('Por favor, confirme la accion'),
      message: this.translate.instant('Desea eliminar el lote y sus reportes asociados?'),
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
        severity: 'danger',
      },
      accept: async () => {
        try {
          await this.loteService.eliminar(this.lote!._id!);
          this.listado.deleteEntityItem('lotes', this.lote!._id!);
          this.params.set('detallesLote', null);
          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
          this.router.navigate(['mapa']);
        } catch (error) {
          this.helper.notifError(error);
        }
      },
    });
  }

  public get ubicacionResumen(): string {
    const centro = this.lote?.ubicacion?.centro;
    if (!centro?.lat || !centro?.lng) {
      return 'Sin coordenadas';
    }
    return `${centro.lat.toFixed(4)}, ${centro.lng.toFixed(4)}`;
  }

  public get departamentoResumen(): string {
    const oficial = this.lote?.ubicacionAdministrativa;
    const departamento = oficial?.nivelAdministrativo2?.nombre || this.lote?.departamento?.nombre;
    const provincia = oficial?.provincia?.nombre || this.lote?.departamento?.provincia?.nombre;
    if (departamento && provincia) {
      return `${departamento}, ${provincia}`;
    }
    if (oficial?.estado === 'processing' || oficial?.estado === 'pending') {
      return 'Ubicacion oficial en proceso';
    }
    return departamento || provincia || 'Ubicacion oficial pendiente';
  }

  public get contextoOperativoResumen(): string {
    if (this.departamentoResumen === 'Ubicacion oficial pendiente') {
      return 'Se calculara automaticamente desde el poligono del lote';
    }
    return this.departamentoResumen;
  }

  public mostrarCentralMeteorologica(): boolean {
    const establecimiento = this.lote?.establecimiento;
    return (
      !!establecimiento?.estacionMeteorologica ||
      establecimiento?.fuenteClimaPreferida === 'FieldClimate' ||
      establecimiento?.climaActual?.clima?.fuente === 'FieldClimate'
    );
  }

  public get superficieResumen(): string {
    const superficie = this.lote?.ubicacion?.superficie;
    if (!superficie || Number.isNaN(superficie)) {
      return 'Sin dato';
    }
    return `${this.numeroAr.format(superficie)} ha`;
  }

  public get sueloResumen(): string {
    const principal =
      this.lote?.texturaEscorrentia ||
      this.lote?.texturaLixiviacion ||
      this.lote?.suelos?.find((suelo) => !!suelo.textura)?.textura;
    return principal || 'Sin dato';
  }

  public get sueloDetalleResumen(): string {
    const niveles = this.lote?.suelos?.filter((suelo) => suelo.textura || suelo.profundidad) || [];
    const sources: Record<string, string> = {
      manual: 'Override confirmado',
      laboratory: 'Análisis de laboratorio',
      sensor: 'Calibrado con sensor',
      inta_local: 'Cartografía INTA regional',
      inta_national: 'Cartografía INTA nacional',
      sisinta: 'Referencia SISINTA',
      soilgrids: 'Estimación SoilGrids',
      derived: 'Estimación cartográfica',
      unknown: 'Fuente pendiente',
    };
    const source = this.lote?.sueloConfirmadoPorUsuario
      ? 'Override confirmado'
      : this.lote?.sueloProcedencia
        ? sources[this.lote.sueloProcedencia]
        : this.sueloResumen === 'Sin dato'
          ? sources['unknown']
          : 'Dato legacy sin fuente';
    if (!niveles.length && this.sueloResumen === 'Sin dato') {
      return 'Se caracteriza automáticamente desde el polígono';
    }
    const profile = niveles.length ? `${niveles.length} nivel${niveles.length === 1 ? '' : 'es'}` : '';
    return [source, profile].filter(Boolean).join(' · ');
  }

  public get rindeResumen(): string {
    const rendimientoSeco = this.siembra?.rendimientoObtenidoKgHaSeco || this.siembra?.rendimientoObtenidoKgHa;
    if (rendimientoSeco) {
      return `${this.numeroAr.format(rendimientoSeco)} kg/ha`;
    }
    if (this.siembra?.rendimiento) {
      return this.siembra.rendimiento;
    }
    return 'Sin historico suficiente';
  }

  public get mostrarPrediccionMalezas(): boolean {
    const cultivo = this.siembra?.semilla?.cultivo;
    return !!cultivo && CULTIVOS_CON_PREDICCION_MALEZAS.includes(cultivo);
  }

  public get mostrarRiesgosAgroclimaticos(): boolean {
    const centro = this.lote?.ubicacion?.centro || this.lote?.establecimiento?.ubicacion?.[0]?.centro;
    return !!centro && !!this.siembra?.semilla?.cultivo && !this.siembra?.fechaCosecha;
  }

  public get requiereImplantacion(): boolean {
    return !this.siembra || !!(this.siembraActual && this.siembra.fechaCosecha);
  }

  public get esPlantacion(): boolean {
    return esCultivoPerenne(this.siembra?.semilla?.cultivo);
  }

  public get implantacionLabel(): string {
    return getNombreImplantacion(this.siembra?.semilla?.cultivo);
  }

  public get fichaVarietal(): IResumenFichaVarietal | undefined {
    return resolverFichaVarietal(this.siembra?.semilla);
  }

  public get estadoFichaVarietalLabel(): string {
    const labels: Record<string, string> = {
      sin_fuentes: 'Sin fuentes oficiales',
      en_relevamiento: 'En relevamiento',
      referencia_documental: 'Referencia documental',
      calibrada_localmente: 'Calibrada localmente',
      validada: 'Validada',
    };
    return labels[this.fichaVarietal?.estado || 'sin_fuentes'];
  }

  public tipoDocumentoVarietalLabel(documento: IDocumentoFichaVarietal): string {
    const labels: Record<string, string> = {
      registro_oficial: 'Registro oficial',
      ficha_obtentor: 'Ficha del obtentor',
      extension_oficial: 'Extension oficial',
      publicacion_cientifica: 'Publicacion cientifica',
      validacion_local: 'Validacion local',
    };
    return labels[documento.tipo] || 'Documento tecnico';
  }

  public valorReferenciaTermica(referencia: IReferenciaTermicaVarietal): string {
    if (Number.isFinite(referencia.objetivo)) {
      return `${this.numeroAr.format(Number(referencia.objetivo))} ${referencia.unidad}`;
    }
    if (Number.isFinite(referencia.minimo) && Number.isFinite(referencia.maximo)) {
      return `${this.numeroAr.format(Number(referencia.minimo))}-${this.numeroAr.format(Number(referencia.maximo))} ${referencia.unidad}`;
    }
    if (Number.isFinite(referencia.minimo)) {
      return `Desde ${this.numeroAr.format(Number(referencia.minimo))} ${referencia.unidad}`;
    }
    if (Number.isFinite(referencia.maximo)) {
      return `Hasta ${this.numeroAr.format(Number(referencia.maximo))} ${referencia.unidad}`;
    }
    return `Sin umbral numerico · ${referencia.unidad}`;
  }

  async ngOnInit(): Promise<void> {
    const idLote = this.activatedRoute.snapshot.paramMap.get('id');
    const loteParam = this.paramsService.get('detallesLote') as IDetallesLote | undefined;
    const loteCacheado = idLote ? DetallesLoteComponent.loteCache.get(idLote) : undefined;
    const loteInicial = loteCacheado || loteParam || undefined;

    if (loteInicial) {
      this.aplicarLote(loteInicial);
      this.publicarSiembra(this.getSiembraOperativa());
      void this.hidratarSiembraOperativa();
    } else {
      this.cargandoPrimario = true;
    }

    if (idLote) {
      void this.cargarLoteEnSegundoPlano(idLote);
      return;
    }

    void this.hidratarSiembraOperativa();
  }

  private getSiembraOperativa(): IDetalleSiembra | undefined {
    const siembra = this.lote?.siembra as IDetalleSiembra | undefined;
    if (siembra?._id || siembra?.fechaSiembra) {
      return siembra;
    }

    const siembras = ((this.lote as unknown as { siembras?: IDetalleSiembra[] })?.siembras || [])
      .filter(Boolean)
      .sort((a, b) => new Date(b.fechaSiembra || 0).getTime() - new Date(a.fechaSiembra || 0).getTime());

    if (!siembras.length) {
      return undefined;
    }

    return (
      siembras.find((item) => item._id === this.lote?.idSiembra) ||
      siembras.find((item) => !item.fechaCosecha) ||
      siembras[0]
    );
  }

  private slugArchivo(value: string): string {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'lote'
    );
  }

  private async hidratarSiembraOperativa(): Promise<void> {
    let siembra = this.getSiembraOperativa();
    if (!siembra) {
      return;
    }

    this.publicarSiembra(siembra);

    if (siembra._id && (!siembra.semilla || !siembra.crono)) {
      try {
        siembra = await this.obtenerSiembraCompleta(siembra);
      } catch (error) {
        this.helper.notifError(error);
      }
    }

    await this.completarCronoSiembra(siembra);
    if (this.lote) {
      this.lote.siembra = siembra;
      this.lote.idSiembra = this.lote.idSiembra || siembra._id;
    }
    this.publicarSiembra(siembra);
  }

  private async completarCronoSiembra(siembra?: ISiembra): Promise<void> {
    if (!siembra || siembra.crono || !siembra.semilla?.cultivo) {
      return;
    }

    const cultivo = siembra.semilla.cultivo;
    const ciclo = siembra.semilla.ciclo;
    const idDepartamento = this.lote?.departamento?._id;
    const filters = [
      { cultivo, ciclo, idDepartamento },
      { cultivo, idDepartamento },
      { cultivo, ciclo },
      { cultivo },
    ].map((filter) =>
      Object.fromEntries(
        Object.entries(filter).filter(([, value]) => value !== undefined && value !== null && value !== '')
      )
    );

    const filtrosUnicos = filters.filter(
      (filter, index, array) => array.findIndex((item) => JSON.stringify(item) === JSON.stringify(filter)) === index
    );

    const resultados = await Promise.all(
      filtrosUnicos.map(async (filter, index) => ({
        index,
        crono: await this.obtenerCrono(filter),
      }))
    );

    const resultado = resultados.sort((a, b) => a.index - b.index).find((item) => !!item.crono);

    if (resultado?.crono) {
      siembra.crono = resultado.crono;
    }
  }

  private aplicarLote(lote: IDetallesLote): void {
    this.lote = {
      ...(this.lote || {}),
      ...lote,
    };

    if (this.lote?._id) {
      DetallesLoteComponent.loteCache.set(this.lote._id, JSON.parse(JSON.stringify(this.lote)));
    }
  }

  private publicarSiembra(siembra?: IDetalleSiembra, actualizarLote = true): void {
    if (!siembra) {
      this.verSiembraActual();
      return;
    }

    if (this.lote && actualizarLote) {
      this.lote.siembra = siembra;
      this.lote.idSiembra = this.lote.idSiembra || siembra._id;
    }
    this.siembra = JSON.parse(JSON.stringify(siembra));
    this.siembraActual = this.lote?.idSiembra === siembra._id && !siembra.fechaCosecha;

    if (siembra._id) {
      DetallesLoteComponent.siembraCache.set(siembra._id, JSON.parse(JSON.stringify(siembra)));
    }
  }

  public actualizarSiembraFenologica(siembra: ISiembra): void {
    this.publicarSiembra(siembra as IDetalleSiembra);
  }

  private async cargarLoteEnSegundoPlano(idLote: string): Promise<void> {
    this.refrescandoDetalle = true;
    try {
      const loteActualizado = await this.obtenerLote(idLote);
      if (this.destroyed) return;
      this.aplicarLote(loteActualizado);
      this.cargandoPrimario = false;
      this.publicarSiembra(this.getSiembraOperativa());
      await this.hidratarSiembraOperativa();
    } catch (error) {
      if (!this.destroyed) {
        this.helper.notifError(error);
        this.cargandoPrimario = false;
      }
    } finally {
      if (!this.destroyed) {
        this.refrescandoDetalle = false;
      }
    }
  }

  private async obtenerLote(idLote: string): Promise<IDetallesLote> {
    const pendiente = DetallesLoteComponent.lotePending.get(idLote);
    if (pendiente) {
      return pendiente;
    }

    const request = this.loteService
      .listarPorId(idLote)
      .then((lote) => {
        const detalle = lote as IDetallesLote;
        DetallesLoteComponent.loteCache.set(idLote, JSON.parse(JSON.stringify(detalle)));
        return detalle;
      })
      .finally(() => DetallesLoteComponent.lotePending.delete(idLote));

    DetallesLoteComponent.lotePending.set(idLote, request);
    return request;
  }

  private async obtenerSiembraCompleta(siembra: IDetalleSiembra): Promise<IDetalleSiembra> {
    if (!siembra._id) {
      return siembra;
    }

    const cacheada = DetallesLoteComponent.siembraCache.get(siembra._id);
    if (cacheada && cacheada.semilla) {
      return {
        ...siembra,
        ...JSON.parse(JSON.stringify(cacheada)),
      };
    }

    const completa = {
      ...siembra,
      ...((await this.siembraService.listarPorId(siembra._id)) as IDetalleSiembra),
    };
    DetallesLoteComponent.siembraCache.set(siembra._id, JSON.parse(JSON.stringify(completa)));
    return completa;
  }

  private async obtenerCrono(filter: Record<string, unknown>): Promise<ICrono | null> {
    const key = JSON.stringify(filter);
    if (DetallesLoteComponent.cronoCache.has(key)) {
      return DetallesLoteComponent.cronoCache.get(key) || null;
    }

    const pendiente = DetallesLoteComponent.cronoPending.get(key);
    if (pendiente) {
      return pendiente;
    }

    const request = this.fenologiaService
      .listar({
        filter: key,
        limit: 1,
      } as IQueryParam)
      .then((result) => (result.datos?.[0] as unknown as ICrono | undefined) || null)
      .catch(() => null)
      .then((crono) => {
        DetallesLoteComponent.cronoCache.set(key, crono);
        return crono;
      })
      .finally(() => DetallesLoteComponent.cronoPending.delete(key));

    DetallesLoteComponent.cronoPending.set(key, request);
    return request;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
