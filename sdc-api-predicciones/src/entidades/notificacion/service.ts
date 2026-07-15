import { Injectable, Logger } from '@nestjs/common';
import {
  esFechaPrediccionSanitariaReciente,
  esPrediccionSanitariaAlertable,
  ICreateNotificacion,
  INotificacion,
  IPrediccion,
  IPrediccionEnfermedad,
  IPrediccionMalezaEspecie,
  IQueryParam,
  IResultadoPrediccionMalezas,
  ISiembra,
  IUsuario,
  ModuloPermiso,
} from 'modelos/src';
import { NotificacionsRepository } from './repository';
import { UsuariosService } from '../usuarios/service';
import { TokenPushsService } from '../tokenPush/service';
import { PushNotificationsService } from '../../auxiliares/push-notifications/service';

interface EventoNotificacion {
  modulo: ModuloPermiso;
  titulo: string;
  mensaje: string;
  siembra: ISiembra;
  idProductor?: string;
  eventKey: string;
  data: Record<string, string | number | undefined>;
  sanitaria?: {
    dedupeKey: string;
    resultado: number;
  };
}

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const RECORDATORIO_SANITARIO_MS = 7 * DIA_MS;

@Injectable()
export class NotificacionsService {
  private logger = new Logger(NotificacionsService.name);
  constructor(
    private repository: NotificacionsRepository,
    private usuariosService: UsuariosService,
    private tokenPushsService: TokenPushsService,
    private pushNotificationsService: PushNotificationsService,
  ) {}

  private async create(data: ICreateNotificacion): Promise<INotificacion> {
    return await this.repository.create(data);
  }

  async enviarNotificaciones(predicciones: IPrediccion[], siembra: ISiembra) {
    if (!predicciones?.length) {
      return;
    }

    for (const {
      prediccion,
      enfermedad,
    } of this.ultimasPrediccionesPorEnfermedad(predicciones)) {
      if (
        esFechaPrediccionSanitariaReciente(prediccion.fecha) &&
        enfermedad.modelo?.validacion !== 'experimental' &&
        esPrediccionSanitariaAlertable(enfermedad)
      ) {
        await this.enviarNotificacion(prediccion, enfermedad, siembra);
      }
    }
  }

  async enviarNotificacionesMalezas(
    resultado: IResultadoPrediccionMalezas,
    siembra: ISiembra,
  ) {
    if (resultado?.estado !== 'operativo') {
      return;
    }

    const especies = (resultado.especies || []).filter(
      (especie) => especie.severidad === 'alta',
    );

    for (const especie of especies) {
      await this.enviarNotificacionMaleza(resultado, especie, siembra);
    }
  }

  async enviarEventoAgroclimatico(evento: {
    titulo: string;
    mensaje: string;
    siembra: ISiembra;
    eventKey: string;
    data: Record<string, string | number | undefined>;
  }) {
    await this.enviarEvento({
      modulo: 'Clima',
      titulo: evento.titulo,
      mensaje: evento.mensaje,
      siembra: evento.siembra,
      idProductor: evento.siembra.idProductor,
      eventKey: evento.eventKey,
      data: evento.data,
    });
  }

  private async enviarNotificacion(
    prediccion: IPrediccion,
    enfermedad: IPrediccionEnfermedad,
    siembra: ISiembra,
  ) {
    const idProductor = prediccion.idProductor || siembra.idProductor;
    const idSiembra = prediccion.idSiembra || siembra._id;
    const fecha = prediccion.fecha;
    const versionMotor = this.versionMotor(enfermedad);
    const slugEnfermedad = this.slug(enfermedad.enfermedad);
    const dedupeKey = `${idSiembra}:sanitaria:enfermedad:${slugEnfermedad}`;
    const eventKey = `enfermedad:${idSiembra}:${this.slug(
      enfermedad.enfermedad,
    )}:${versionMotor}:${this.dateKeyPrediccion(fecha)}`;
    const titulo = 'Predicción sanitaria';
    const mensaje = `Siembra de ${siembra.semilla?.cultivo || 'cultivo'} en ${
      siembra.lote?.nombre || 'lote'
    }: predicción meteorológica de severidad/incidencia para ${enfermedad.enfermedad} de ${Number(enfermedad.resultado).toFixed(1)}%. No confirma enfermedad; requiere validación a campo.`;

    await this.enviarEvento({
      modulo: 'Enfermedades',
      titulo,
      mensaje,
      siembra,
      idProductor,
      eventKey,
      sanitaria: {
        dedupeKey,
        resultado: Number(enfermedad.resultado),
      },
      data: {
        tipo: 'enfermedad',
        idSiembra,
        enfermedad: enfermedad.enfermedad,
        resultado: enfermedad.resultado,
        versionModelo: enfermedad.modelo?.version,
        fechaPrediccion: fecha,
        dedupeKey,
        eventKey,
      },
    });
  }

  /**
   * Los recalculos pueden incluir una serie completa. Una notificacion solo
   * puede representar la ultima salida cronologica de cada enfermedad.
   */
  private ultimasPrediccionesPorEnfermedad(predicciones: IPrediccion[]): Array<{
    prediccion: IPrediccion;
    enfermedad: IPrediccionEnfermedad;
  }> {
    const ultimas = new Map<
      string,
      {
        prediccion: IPrediccion;
        enfermedad: IPrediccionEnfermedad;
        fechaMs: number;
        orden: number;
      }
    >();
    let orden = 0;

    for (const prediccion of predicciones || []) {
      const fechaMs = this.fechaMs(prediccion.fecha);
      for (const enfermedad of prediccion.enfermedades || []) {
        const clave =
          enfermedad.idEnfermedad || this.slug(enfermedad.enfermedad);
        const actual = ultimas.get(clave);
        const candidata = { prediccion, enfermedad, fechaMs, orden: orden++ };
        if (
          !actual ||
          candidata.fechaMs > actual.fechaMs ||
          (candidata.fechaMs === actual.fechaMs &&
            candidata.orden > actual.orden)
        ) {
          ultimas.set(clave, candidata);
        }
      }
    }

    return [...ultimas.values()].map(({ prediccion, enfermedad }) => ({
      prediccion,
      enfermedad,
    }));
  }

  private fechaMs(fecha?: string): number {
    if (!fecha) return Number.NEGATIVE_INFINITY;
    const value = new Date(fecha).getTime();
    return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
  }

  private versionMotor(enfermedad: IPrediccionEnfermedad): string {
    const version = Number(enfermedad.modelo?.version);
    return Number.isFinite(version) ? `v${version}` : 'sin-version';
  }

  private dateKeyPrediccion(fecha: string): string {
    // Las series agronomicas representan un dia civil en UTC (00:00Z). Usar
    // timezone local aqui las desplazaria artificialmente al dia anterior.
    const fechaCivil = fecha?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    return fechaCivil || this.dateKey(fecha);
  }

  private async enviarNotificacionMaleza(
    resultado: IResultadoPrediccionMalezas,
    especie: IPrediccionMalezaEspecie,
    siembra: ISiembra,
  ) {
    const idSiembra = resultado.idSiembra || siembra._id;
    const nombre = especie.nombre || 'maleza';
    const avance = Math.round(Number(especie.avancePct || 0));
    const eventKey = `maleza:${idSiembra}:${this.slug(
      especie.codigoCarga || nombre,
    )}:${this.dateKey(resultado.fecha)}`;
    const titulo = 'Alerta de malezas';
    const mensaje = `Siembra de ${resultado.cultivo || siembra.semilla?.cultivo || 'cultivo'} en ${
      siembra.lote?.nombre || 'lote'
    } con ${nombre} en ventana de control (${avance}%).`;

    await this.enviarEvento({
      modulo: 'Malezas',
      titulo,
      mensaje,
      siembra,
      idProductor: siembra.idProductor,
      eventKey,
      data: {
        tipo: 'maleza',
        idSiembra,
        idMaleza: especie.idMaleza,
        maleza: nombre,
        avancePct: avance,
        emergenciaPct: especie.emergenciaProyectada7dPct,
        severidad: especie.severidad,
        eventKey,
      },
    });
  }

  private async enviarEvento(evento: EventoNotificacion) {
    const idProductor = evento.idProductor;
    if (!idProductor) {
      this.logger.warn(
        `No se puede notificar evento sin productor ${evento.eventKey}`,
      );
      return;
    }

    const usuarios = await this.usuariosService.getPorIdProductor(idProductor);
    const usuariosHabilitados = usuarios.filter((usuario) =>
      this.usuarioHabilitado(usuario, idProductor, evento.modulo),
    );

    if (!usuariosHabilitados.length) {
      this.logger.verbose(
        `No hay usuarios habilitados para ${evento.modulo}. ${evento.mensaje}`,
      );
      return;
    }

    const usuariosPendientes: IUsuario[] = [];
    for (const usuario of usuariosHabilitados) {
      if (!usuario._id) {
        continue;
      }
      const existe = await this.existeNotificacion(
        usuario._id,
        evento.eventKey,
      );
      if (existe) {
        continue;
      }
      if (
        evento.sanitaria &&
        !(await this.debeEnviarNotificacionSanitaria(
          usuario._id,
          evento.sanitaria.dedupeKey,
          evento.sanitaria.resultado,
        ))
      ) {
        continue;
      }
      usuariosPendientes.push(usuario);
    }

    if (!usuariosPendientes.length) {
      return;
    }

    await this.enviarPushSiCorresponde(usuariosPendientes, evento);

    for (const usuario of usuariosPendientes) {
      const createNotif: ICreateNotificacion = {
        mensaje: evento.mensaje,
        titulo: evento.titulo,
        tenant: {
          idProductor,
          idDistribuidor: evento.siembra.idDistribuidor,
          idEstablecimiento: evento.siembra.idEstablecimiento,
          idQuimica: evento.siembra.idQuimica,
          idUsuario: usuario._id,
        },
        data: this.toNotificationData(evento.data),
      };
      await this.create(createNotif);
    }
  }

  private async enviarPushSiCorresponde(
    usuarios: IUsuario[],
    evento: EventoNotificacion,
  ) {
    const ids = usuarios.map((usuario) => usuario._id).filter(Boolean);
    if (!ids.length) {
      return;
    }

    let tokensUsuarios = [];
    try {
      tokensUsuarios = await this.tokenPushsService.getPorIdsUsuarios(ids);
    } catch (error) {
      this.logger.error(`No se pudieron consultar tokens push: ${error}`);
      return;
    }

    const idsUsuarios = new Set(ids);
    const tokens = [
      ...new Set(
        tokensUsuarios
          .filter((token) => idsUsuarios.has(token.idUsuario))
          .map((token) => token.tokenPush)
          .filter(Boolean),
      ),
    ];

    if (!tokens.length) {
      this.logger.verbose(
        `No hay tokens push para enviar notificacion. ${evento.mensaje}`,
      );
      return;
    }

    this.logger.verbose(
      `Enviando push a ${tokens.length} dispositivos. ${evento.mensaje}`,
    );
    try {
      await this.pushNotificationsService.sendNotifications(
        tokens,
        evento.titulo,
        evento.mensaje,
      );
    } catch (error) {
      this.logger.error(`No se pudo enviar push: ${error}`);
    }
  }

  private async existeNotificacion(
    idUsuario: string,
    eventKey: string,
  ): Promise<boolean> {
    const query: IQueryParam = {
      filter: JSON.stringify({
        'tenant.idUsuario': idUsuario,
        'data.eventKey': eventKey,
      }),
      limit: 1,
    };
    try {
      const res = await this.repository.getFiltered(query);
      return !!res.datos?.length;
    } catch (error) {
      this.logger.error(
        `No se pudo verificar notificacion duplicada: ${error}`,
      );
      return false;
    }
  }

  /**
   * Evita una notificacion diaria estable por usuario y enfermedad. El
   * eventKey se valida antes para conservar la deduplicacion exacta; esta
   * segunda barrera compara la evolucion contra la ultima notificacion del
   * mismo episodio sanitario.
   */
  private async debeEnviarNotificacionSanitaria(
    idUsuario: string,
    dedupeKey: string,
    resultadoActual: number,
  ): Promise<boolean> {
    const consulta = await this.ultimaNotificacionSanitaria(
      idUsuario,
      dedupeKey,
    );
    if (!consulta.ok) {
      // Sin historial confiable no se puede garantizar la politica anti-spam.
      return false;
    }

    const ultima = consulta.notificacion;
    if (!ultima) {
      return true;
    }

    const fechaUltima = new Date(ultima.fechaCreacion).getTime();
    if (!Number.isFinite(fechaUltima)) {
      this.logger.warn(
        `Notificacion sanitaria sin fecha valida para ${idUsuario} ${dedupeKey}`,
      );
      return false;
    }

    const transcurrido = Date.now() - fechaUltima;
    if (transcurrido < DIA_MS) {
      return false;
    }
    if (transcurrido >= RECORDATORIO_SANITARIO_MS) {
      return true;
    }

    const resultadoAnterior = Number(ultima.data?.resultado);
    if (!Number.isFinite(resultadoAnterior)) {
      this.logger.warn(
        `Notificacion sanitaria sin resultado valido para ${idUsuario} ${dedupeKey}`,
      );
      return false;
    }

    return (
      this.bandaSanitaria(resultadoActual) >
        this.bandaSanitaria(resultadoAnterior) ||
      resultadoActual - resultadoAnterior >= 15
    );
  }

  private async ultimaNotificacionSanitaria(
    idUsuario: string,
    dedupeKey: string,
  ): Promise<{ ok: boolean; notificacion?: INotificacion }> {
    const query: IQueryParam = {
      filter: JSON.stringify({
        'tenant.idUsuario': idUsuario,
        'data.dedupeKey': dedupeKey,
      }),
      sort: JSON.stringify({ fechaCreacion: -1 }),
      limit: 1,
    };
    try {
      const res = await this.repository.getFiltered(query);
      return { ok: true, notificacion: res.datos?.[0] };
    } catch (error) {
      this.logger.error(
        `No se pudo consultar la ultima notificacion sanitaria: ${error}`,
      );
      return { ok: false };
    }
  }

  private bandaSanitaria(resultado: number): number {
    if (resultado < 15) return 0;
    if (resultado < 45) return 1;
    if (resultado < 75) return 2;
    return 3;
  }

  private usuarioHabilitado(
    usuario: IUsuario,
    idProductor: string,
    modulo: ModuloPermiso,
  ): boolean {
    return !!usuario.permisos?.some(
      (permiso) =>
        permiso.idProductor === idProductor &&
        permiso.modulos?.[modulo] !== false,
    );
  }

  private toNotificationData(
    data: Record<string, string | number | undefined>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        result[key] = String(value);
      }
    }
    return result;
  }

  private dateKey(fecha = new Date().toISOString()): string {
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private slug(value?: string): string {
    return (
      value
        ?.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'evento'
    );
  }
}
