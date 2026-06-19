import { Injectable } from '@angular/core';
import {
  IAlerta,
  IAgroquimico,
  IApikey,
  ICrono,
  IDepartamento,
  IDispositivo,
  IDistribuidor,
  IEstablecimiento,
  IEstacion,
  IFertilizacion,
  IFertilizante,
  IFoto,
  IFumigacion,
  ILicencia,
  IListado,
  ILote,
  IPrediccion,
  IPrincipioActivo,
  IProductor,
  IProvincia,
  IQueryParam,
  IQuimica,
  IReporte,
  IReporteNDVI,
  ISemilla,
  IFenologia,
  ISiembra,
  ISocketMessage,
  IUsuario,
} from 'modelos/src';
import { Observable, Subject } from 'rxjs';
import { AlertaService } from '../http/alerta.service';
import { AgroquimicoService } from '../http/agroquimico.service';
import { ApikeyService } from '../http/apikey.service';
import { CronoService } from '../http/crono.service';
import { DepartamentoService } from '../http/departamento.service';
import { DispositivoService } from '../http/dispositivos.service';
import { DistribuidorService } from '../http/distribuidor.service';
import { EstablecimientoService } from '../http/establecimiento.service';
import { EstacionService } from '../http/estacion.service';
import { FertilizacionService } from '../http/fertilizacion.service';
import { FertilizanteService } from '../http/fertilizante.service';
import { FotoService } from '../http/foto.service';
import { FumigacionService } from '../http/fumigacion.service';
import { LicenciaService } from '../http/licencia.service';
import { LoteService } from '../http/lote.service';
import { PrediccionService } from '../http/prediccion.service';
import { PrincipioActivoService } from '../http/principio-activos.service';
import { ProductorsService } from '../http/productor.service';
import { ProvinciaService } from '../http/provincia.service';
import { QuimicaService } from '../http/quimica.service';
import { ReporteNDVIService } from '../http/reporte-ndvis.service';
import { ReporteService } from '../http/reporte.service';
import { SemillaService } from '../http/semilla.service';
import { SiembraService } from '../http/siembra.service';
import { UsuarioService } from '../http/usuario.service';
import { FenologiaService } from '../http/fenologia.service';
import { WebSocketService } from './websocket';

type Tipo =
  | IUsuario
  | IListado<IUsuario>
  | IQuimica
  | IListado<IQuimica>
  | IDistribuidor
  | IListado<IDistribuidor>
  | IProductor
  | IListado<IProductor>
  | IEstablecimiento
  | IListado<IEstablecimiento>
  | ILote
  | IListado<ILote>
  | IProvincia
  | IListado<IProvincia>
  | IDepartamento
  | IListado<IDepartamento>
  | ISemilla
  | IListado<ISemilla>
  | ISiembra
  | IListado<ISiembra>
  | IPrediccion
  | IListado<IPrediccion>
  | ICrono
  | IListado<ICrono>
  | IAlerta
  | IListado<IAlerta>
  | IFumigacion
  | IListado<IFumigacion>
  | IEstacion
  | IListado<IEstacion>
  | IApikey
  | IListado<IApikey>
  | IAgroquimico
  | IListado<IAgroquimico>
  | ILicencia
  | IListado<ILicencia>
  | IDispositivo
  | IListado<IDispositivo>
  | IReporte
  | IListado<IReporte>
  | IFenologia
  | IListado<IFenologia>;

interface IEntidades {
  usuarioPropio: IRequestQuery;
  ///
  usuario: IRequestId;
  usuarios: IRequestQuery;
  quimica: IRequestId;
  quimicas: IRequestQuery;
  distribuidor: IRequestId;
  distribuidors: IRequestQuery;
  productor: IRequestId;
  productors: IRequestQuery;
  establecimiento: IRequestId;
  establecimientos: IRequestQuery;
  lote: IRequestId;
  lotes: IRequestQuery;
  provincia: IRequestId;
  provincias: IRequestQuery;
  departamento: IRequestId;
  departamentos: IRequestQuery;
  semilla: IRequestId;
  semillas: IRequestQuery;
  siembra: IRequestId;
  siembras: IRequestQuery;
  prediccion: IRequestId;
  prediccions: IRequestQuery;
  crono: IRequestId;
  cronos: IRequestQuery;
  alerta: IRequestId;
  alertas: IRequestQuery;
  fumigacion: IRequestId;
  fumigacions: IRequestQuery;
  estacion: IRequestId;
  estaciones: IRequestQuery;
  apikey: IRequestId;
  apikeys: IRequestQuery;
  agroquimicos: IRequestQuery;
  principioActivos: IRequestQuery;
  fertilizantes: IRequestQuery;
  fertilizacions: IRequestQuery;
  reportendvi: IRequestId;
  reportendvis: IRequestQuery;
  licencia: IRequestId;
  licencias: IRequestQuery;
  dispositivo: IRequestId;
  dispositivos: IRequestQuery;
  reporte: IRequestId;
  reportes: IRequestQuery;
  diario: IRequestId;
  foto: IRequestId;
  fotos: IRequestQuery;
  fenologia: IRequestId;
  fenologias: IRequestQuery;
}

class RequestQueue {
  subscribe: Subject<Tipo>;
  requests: number;
  cache?: Tipo;

  constructor() {
    this.requests = 0;
    this.subscribe = new Subject<Tipo>();
    this.cache = undefined;
  }
}

interface IRequestId {
  fn: (id: string) => Promise<any>;
  keys: { [key: string]: RequestQueue };
}

interface IRequestQuery {
  fn: (query: IQueryParam) => Promise<any>;
  keys: { [key: string]: RequestQueue };
}

@Injectable({
  providedIn: 'root',
})
export class ListadosService {
  private entidades: IEntidades = this.getInitCache();

  constructor(
    private webSocketService: WebSocketService,
    private usuariosService: UsuarioService,
    private quimicasService: QuimicaService,
    private distribuidorsService: DistribuidorService,
    private productorsService: ProductorsService,
    private establecimientosService: EstablecimientoService,
    private lotesService: LoteService,
    private provinciasService: ProvinciaService,
    private departamentosService: DepartamentoService,
    private semillasService: SemillaService,
    private siembrasService: SiembraService,
    private prediccionsService: PrediccionService,
    private cronosService: CronoService,
    private alertasService: AlertaService,
    private fumigacionsService: FumigacionService,
    private estacionService: EstacionService,
    private apikeysService: ApikeyService,
    private agroquimicosService: AgroquimicoService,
    private principioActivosService: PrincipioActivoService,
    private fertilizantesService: FertilizanteService,
    private fertilizacionsService: FertilizacionService,
    private reportendvisService: ReporteNDVIService,
    private licenciasService: LicenciaService,
    private dispositivosService: DispositivoService,
    private reportesService: ReporteService,
    private fotoService: FotoService,
    private fenologiaService: FenologiaService
  ) {
    this.subscribeWsUpdates();
  }

  // Subscribe

  public subscribe<Tipo>(entidad: keyof IEntidades, query: IQueryParam | string): Observable<Tipo> {
    const key = typeof query === 'string' ? query : JSON.stringify(query);
    const ent = this.entidades[entidad];
    if (!this.entidades[entidad]) {
      throw new Error(`No existe la entidad ${entidad}`);
    } else {
      if (!ent.keys[key]) {
        ent.keys[key] = new RequestQueue();
      }
    }
    return ent.keys[key].subscribe.asObservable() as any;
  }

  public async getLastValue(entidad: keyof IEntidades, query: IQueryParam | string): Promise<void> {
    const ent = this.entidades[entidad];
    if (!this.entidades[entidad]) {
      throw new Error(`No existe la entidad ${entidad}`);
    } else {
      if (typeof query === 'string') {
        await this.listarId(entidad, query, (ent as IRequestId).fn);
      } else {
        await this.listarQuery(entidad, query, (ent as IRequestQuery).fn);
      }
    }
  }

  // Listados Entidades
  private async listarUsuario(id: string): Promise<IUsuario> {
    const response = await this.usuariosService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarUsuarios(query: IQueryParam): Promise<IListado<IUsuario>> {
    const response = await this.usuariosService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarQuimica(id: string): Promise<IQuimica> {
    const response = await this.quimicasService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarQuimicas(query: IQueryParam): Promise<IListado<IQuimica>> {
    const response = await this.quimicasService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarDistribuidor(id: string): Promise<IDistribuidor> {
    const response = await this.distribuidorsService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarDistribuidors(query: IQueryParam): Promise<IListado<IDistribuidor>> {
    const response = await this.distribuidorsService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarProductor(id: string): Promise<IProductor> {
    const response = await this.productorsService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarProductors(query: IQueryParam): Promise<IListado<IProductor>> {
    const response = await this.productorsService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarEstablecimiento(id: string): Promise<IEstablecimiento> {
    const response = await this.establecimientosService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarEstablecimientos(query: IQueryParam): Promise<IListado<IEstablecimiento>> {
    const response = await this.establecimientosService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarLote(id: string): Promise<ILote> {
    const response = await this.lotesService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarLotes(query: IQueryParam): Promise<IListado<ILote>> {
    const response = await this.lotesService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarProvincia(id: string): Promise<IProvincia> {
    const response = await this.provinciasService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarProvincias(query: IQueryParam): Promise<IListado<IProvincia>> {
    const response = await this.provinciasService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarDepartamento(id: string): Promise<IDepartamento> {
    const response = await this.departamentosService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarDepartamentos(query: IQueryParam): Promise<IListado<IDepartamento>> {
    const response = await this.departamentosService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarSemilla(id: string): Promise<ISemilla> {
    const response = await this.semillasService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarSemillas(query: IQueryParam): Promise<IListado<ISemilla>> {
    const response = await this.semillasService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarSiembra(id: string): Promise<ISiembra> {
    const response = await this.siembrasService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarSiembras(query: IQueryParam): Promise<IListado<ISiembra>> {
    const response = await this.siembrasService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarPrediccion(id: string): Promise<IPrediccion> {
    const response = await this.prediccionsService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarPrediccions(query: IQueryParam): Promise<IListado<IPrediccion>> {
    const response = await this.prediccionsService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarCrono(id: string): Promise<ICrono> {
    const response = await this.cronosService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarCronos(query: IQueryParam): Promise<IListado<ICrono>> {
    const response = await this.cronosService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarAlerta(id: string): Promise<IAlerta> {
    const response = await this.alertasService.listarPorId(id);

    return JSON.parse(JSON.stringify(response));
  }

  private async listarAlertas(query: IQueryParam): Promise<IListado<IAlerta>> {
    const response = await this.alertasService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarFumigacion(id: string): Promise<IFumigacion> {
    const response = await this.fumigacionsService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarFumigacions(query: IQueryParam): Promise<IListado<IFumigacion>> {
    const response = await this.fumigacionsService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarEstacion(id: string): Promise<IEstacion> {
    const response = await this.estacionService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarEstacions(query: IQueryParam): Promise<IListado<IEstacion>> {
    const response = await this.estacionService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarApikey(id: string): Promise<IApikey> {
    const response = await this.apikeysService.getById(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarApikeys(query: IQueryParam): Promise<IListado<IApikey>> {
    const response = await this.apikeysService.getFiltered(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarAgroquimicos(query: IQueryParam): Promise<IListado<IAgroquimico>> {
    const response = await this.agroquimicosService.getFiltered(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarPrincipioActivos(query: IQueryParam): Promise<IListado<IPrincipioActivo>> {
    const response = await this.principioActivosService.getFiltered(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarFertilizantes(query: IQueryParam): Promise<IListado<IFertilizante>> {
    const response = await this.fertilizantesService.getFiltered(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarFertilizacions(query: IQueryParam): Promise<IListado<IFertilizacion>> {
    const response = await this.fertilizacionsService.getFiltered(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarReporteNDVI(id: string): Promise<IReporteNDVI> {
    const response = await this.reportendvisService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarReporteNDVIs(query: IQueryParam): Promise<IListado<IReporteNDVI>> {
    const response = await this.reportendvisService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarLicencia(id: string): Promise<ILicencia> {
    const response = await this.licenciasService.getById(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarLicencias(query: IQueryParam): Promise<IListado<ILicencia>> {
    const response = await this.licenciasService.getFiltered(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarDispositivo(id: string): Promise<IDispositivo> {
    const response = await this.dispositivosService.getById(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarDispositivos(query: IQueryParam): Promise<IListado<IDispositivo>> {
    const response = await this.dispositivosService.getFiltered(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarReporte(id: string): Promise<IReporte> {
    const response = await this.dispositivosService.getById(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarReportes(query: IQueryParam): Promise<IListado<IReporte>> {
    const response = await this.dispositivosService.getFiltered(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarDiario(id: string, dias?: number): Promise<IListado<IReporte>> {
    const response = await this.reportesService.diario(id, dias);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarFoto(id: string): Promise<IFoto> {
    const response = await this.fotoService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarFotos(query: IQueryParam): Promise<IListado<IFoto>> {
    const response = await this.fotoService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarFenologia(id: string): Promise<IFenologia> {
    const response = await this.fenologiaService.listarPorId(id);
    return JSON.parse(JSON.stringify(response));
  }

  private async listarFenologias(query: IQueryParam): Promise<IListado<IFenologia>> {
    const response = await this.fenologiaService.listar(query);
    return JSON.parse(JSON.stringify(response));
  }

  //
  private async listarUsuarioPropio(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    query: IQueryParam
  ): Promise<IUsuario> {
    // No se usa query
    const response = await this.usuariosService.listarPropio();
    return JSON.parse(JSON.stringify(response));
  }

  // Borrar cache
  private getInitCache(): IEntidades {
    return {
      usuarioPropio: { fn: this.listarUsuarioPropio.bind(this), keys: {} },
      usuario: { fn: this.listarUsuario.bind(this), keys: {} },
      usuarios: { fn: this.listarUsuarios.bind(this), keys: {} },
      quimica: { fn: this.listarQuimica.bind(this), keys: {} },
      quimicas: { fn: this.listarQuimicas.bind(this), keys: {} },
      distribuidor: { fn: this.listarDistribuidor.bind(this), keys: {} },
      distribuidors: { fn: this.listarDistribuidors.bind(this), keys: {} },
      productor: { fn: this.listarProductor.bind(this), keys: {} },
      productors: { fn: this.listarProductors.bind(this), keys: {} },
      establecimiento: {
        fn: this.listarEstablecimiento.bind(this),
        keys: {},
      },
      establecimientos: {
        fn: this.listarEstablecimientos.bind(this),
        keys: {},
      },
      lote: { fn: this.listarLote.bind(this), keys: {} },
      lotes: { fn: this.listarLotes.bind(this), keys: {} },
      provincia: {
        fn: this.listarProvincia.bind(this),
        keys: {},
      },
      provincias: {
        fn: this.listarProvincias.bind(this),
        keys: {},
      },
      departamento: {
        fn: this.listarDepartamento.bind(this),
        keys: {},
      },
      departamentos: {
        fn: this.listarDepartamentos.bind(this),
        keys: {},
      },
      semilla: { fn: this.listarSemilla.bind(this), keys: {} },
      semillas: { fn: this.listarSemillas.bind(this), keys: {} },
      siembra: { fn: this.listarSiembra.bind(this), keys: {} },
      siembras: { fn: this.listarSiembras.bind(this), keys: {} },
      prediccion: { fn: this.listarPrediccion.bind(this), keys: {} },
      prediccions: { fn: this.listarPrediccions.bind(this), keys: {} },
      crono: { fn: this.listarCrono.bind(this), keys: {} },
      cronos: { fn: this.listarCronos.bind(this), keys: {} },
      alerta: { fn: this.listarAlerta.bind(this), keys: {} },
      alertas: { fn: this.listarAlertas.bind(this), keys: {} },
      fumigacion: { fn: this.listarFumigacion.bind(this), keys: {} },
      fumigacions: { fn: this.listarFumigacions.bind(this), keys: {} },
      estacion: { fn: this.listarEstacion.bind(this), keys: {} },
      estaciones: { fn: this.listarEstacions.bind(this), keys: {} },
      apikey: { fn: this.listarApikey.bind(this), keys: {} },
      apikeys: { fn: this.listarApikeys.bind(this), keys: {} },
      agroquimicos: {
        fn: this.listarAgroquimicos.bind(this),
        keys: {},
      },
      principioActivos: {
        fn: this.listarPrincipioActivos.bind(this),
        keys: {},
      },
      fertilizantes: {
        fn: this.listarFertilizantes.bind(this),
        keys: {},
      },
      fertilizacions: {
        fn: this.listarFertilizacions.bind(this),
        keys: {},
      },
      reportendvi: { fn: this.listarReporteNDVI.bind(this), keys: {} },
      reportendvis: { fn: this.listarReporteNDVIs.bind(this), keys: {} },
      licencia: { fn: this.listarLicencia.bind(this), keys: {} },
      licencias: { fn: this.listarLicencias.bind(this), keys: {} },
      dispositivo: { fn: this.listarDispositivo.bind(this), keys: {} },
      dispositivos: { fn: this.listarDispositivos.bind(this), keys: {} },
      reporte: { fn: this.listarReporte.bind(this), keys: {} },
      reportes: { fn: this.listarReportes.bind(this), keys: {} },
      diario: { fn: this.listarDiario.bind(this), keys: {} },
      foto: { fn: this.listarFoto.bind(this), keys: {} },
      fotos: { fn: this.listarFotos.bind(this), keys: {} },
      fenologia: { fn: this.listarFenologia.bind(this), keys: {} },
      fenologias: { fn: this.listarFenologias.bind(this), keys: {} },
    };
  }

  public borrarCache() {
    this.entidades = this.getInitCache();
  }

  // Actualizar Entidades
  private async actualizarQuery(entidad: keyof IEntidades): Promise<void> {
    const ent = this.entidades[entidad] as IRequestQuery;
    for (const key in ent.keys) {
      if (ent.keys[key].requests === 0) {
        if (Object.prototype.hasOwnProperty.call(ent.keys, key)) {
          ent.keys[key].cache = undefined;
          const query = JSON.parse(key);
          if (ent.keys[key].subscribe.observers.length) {
            ent.keys[key].requests++;
            while (ent.keys[key].requests) {
              ent.keys[key].cache = undefined;
              await this.listarQuery(entidad, query, ent.fn);
              ent.keys[key].requests--;
            }
          }
        }
      } else if (ent.keys[key].requests < 2) {
        ent.keys[key].requests++;
      }
    }
  }

  private async actualizarId(entidad: keyof IEntidades, id?: string): Promise<void> {
    if (id) {
      const ent = this.entidades[entidad] as IRequestId;
      if (ent.keys[id]) {
        if (ent.keys[id].requests === 0) {
          ent.keys[id].cache = undefined;
          if (ent.keys[id].subscribe.observers.length) {
            ent.keys[id].requests++;
            while (ent.keys[id].requests) {
              ent.keys[id].cache = undefined;
              await this.listarId(entidad, id, ent.fn);
              ent.keys[id].requests--;
            }
          }
        } else if (ent.keys[id].requests < 2) {
          ent.keys[id].requests++;
        }
      }
    }
  }

  // Listados Generales

  private async listarQuery(
    entidad: keyof IEntidades,
    query: IQueryParam,
    fn: (query: IQueryParam) => Promise<any>
  ): Promise<void> {
    const ent = this.entidades[entidad];
    const key = JSON.stringify(query);
    if (!ent.keys[key].cache) {
      const response = await fn(query);
      ent.keys[key].cache = JSON.parse(JSON.stringify(response));
    }
    ent.keys[key].subscribe.next(ent.keys[key].cache!);
  }

  private async listarId(entidad: keyof IEntidades, id: string, fn: (id: string) => Promise<any>): Promise<void> {
    const ent = this.entidades[entidad];
    if (!ent.keys[id].cache) {
      const response = await fn(id);
      ent.keys[id].cache = JSON.parse(JSON.stringify(response));
    }
    ent.keys[id].subscribe.next(ent.keys[id].cache!);
  }

  // Suscripcion a WS Service para eliminar cache y actualizar entidades
  private subscribeWsUpdates() {
    this.webSocketService.getMessage().subscribe({
      next: this.handleUpdateResponse.bind(this),
    });
  }
  private handleUpdateResponse(message: ISocketMessage) {
    if (message.paths?.includes('usuarios')) {
      this.actualizarQuery('usuarios');
      this.actualizarQuery('usuarioPropio');
      this.actualizarId('usuario', message.body?.['_id']);
    }
    if (message.paths?.includes('quimicas')) {
      this.actualizarQuery('quimicas');
      this.actualizarId('quimica', message.body?.['_id']);
    }
    if (message.paths?.includes('distribuidors')) {
      this.actualizarQuery('distribuidors');
      this.actualizarId('distribuidor', message.body?.['_id']);
    }
    if (message.paths?.includes('productors')) {
      this.actualizarQuery('productors');
      this.actualizarId('productor', message.body?.['_id']);
    }
    if (message.paths?.includes('establecimientos')) {
      this.actualizarQuery('establecimientos');
      this.actualizarId('establecimiento', message.body?.['_id']);
    }
    if (message.paths?.includes('lotes')) {
      this.actualizarQuery('lotes');
      this.actualizarId('lote', message.body?.['_id']);
    }
    if (message.paths?.includes('departamentos')) {
      this.actualizarQuery('departamentos');
      this.actualizarId('departamento', message.body?.['_id']);
    }
    if (message.paths?.includes('semillas')) {
      this.actualizarQuery('semillas');
      this.actualizarId('semilla', message.body?.['_id']);
    }
    if (message.paths?.includes('siembras')) {
      this.actualizarQuery('siembras');
      this.actualizarId('siembra', message.body?.['_id']);
    }
    if (message.paths?.includes('prediccions')) {
      this.actualizarQuery('prediccions');
      this.actualizarId('prediccion', message.body?.['_id']);
    }
    if (message.paths?.includes('cronos')) {
      this.actualizarQuery('cronos');
      this.actualizarId('crono', message.body?.['_id']);
    }
    if (message.paths?.includes('alertas')) {
      this.actualizarQuery('alertas');
      this.actualizarId('alerta', message.body?.['_id']);
    }
    if (message.paths?.includes('fumigacions')) {
      this.actualizarQuery('fumigacions');
      this.actualizarId('fumigacion', message.body?.['_id']);
    }
    if (message.paths?.includes('apikeys')) {
      this.actualizarQuery('apikeys');
      this.actualizarId('apikey', message.body?.['_id']);
    }
    if (message.paths?.includes('agroquimicos')) {
      this.actualizarQuery('agroquimicos');
    }
    if (message.paths?.includes('principioActivos')) {
      this.actualizarQuery('principioActivos');
    }
    if (message.paths?.includes('fertilizantes')) {
      this.actualizarQuery('fertilizantes');
    }
    if (message.paths?.includes('fertilizacions')) {
      this.actualizarQuery('fertilizacions');
    }
    if (message.paths?.includes('reportendvis')) {
      this.actualizarQuery('reportendvis');
      this.actualizarId('reportendvi', message.body?.['_id']);
    }
    if (message.paths?.includes('licencias')) {
      this.actualizarQuery('licencias');
      this.actualizarId('licencia', message.body?.['_id']);
    }
    if (message.paths?.includes('dispositivos')) {
      this.actualizarQuery('dispositivos');
      this.actualizarId('dispositivo', message.body?.['_id']);
    }
    if (message.paths?.includes('reportes')) {
      this.actualizarQuery('reportes');
      this.actualizarId('reporte', message.body?.['_id']);
      this.actualizarId('diario', message.body?.['_id']);
    }
    if (message.paths?.includes('fotos')) {
      this.actualizarQuery('fotos');
      this.actualizarId('foto', message.body?.['_id']);
    }
  }

  public patchEntityItem<T extends { _id?: string }>(
    entidad: keyof IEntidades,
    updated: T
  ): void {
    const ent = this.entidades[entidad];
    if (!ent) return;

    for (const key of Object.keys(ent.keys)) {
      const rq = ent.keys[key];
      const cache = rq.cache as IListado<T> | undefined;

      if (!cache || !Array.isArray(cache.datos)) continue;

      const index = cache.datos.findIndex(
        (item) => item._id === updated._id
      );

      if (index === -1) continue;
      
      cache.datos[index] = {
        ...cache.datos[index],
        ...updated,
      };

      cache.datos = [...cache.datos];
      
      rq.subscribe.next(cache);
    }
  }

  public deleteEntityItem<T extends { _id?: string }>(
    entidad: keyof IEntidades,
    id: string
  ): void {
    const ent = this.entidades[entidad];
    if (!ent) return;

    for (const key of Object.keys(ent.keys)) {
      const rq = ent.keys[key];
      const cache = rq.cache as IListado<T> | undefined;

      if (!cache || !Array.isArray(cache.datos)) continue;

      const index = cache.datos.findIndex((item) => item._id === id);

      if (index === -1) continue;
      
      cache.datos.splice(index, 1);      
      cache.datos = [...cache.datos];
      cache.totalCount = Math.max(0, (cache.totalCount || 1) - 1);      
      rq.subscribe.next(cache);
    }
  }

  public createEntityItem<T extends { _id?: string }>(
    entidad: keyof IEntidades,
    item: T
  ): void {
    const ent = this.entidades[entidad];
    if (!ent) return;

    for (const key of Object.keys(ent.keys)) {
      const rq = ent.keys[key];
      const cache = rq.cache as IListado<T> | undefined;

      if (!cache || !Array.isArray(cache.datos)) continue;

      cache.datos = [item, ...cache.datos];
      cache.totalCount = (cache.totalCount || 0) + 1;

      rq.subscribe.next(cache);
    }
  }

}
