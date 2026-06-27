import { Injectable, Logger } from '@nestjs/common';
import {
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
}

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
    const enfermedadesConAlerta = new Set([
      'Fusarium de la Espiga',
      'Mancha Amarilla',
      'Mancha de la Hoja',
      'Roya de la Hoja',
      'Roya Anaranjada',
      'Fin de Ciclo',
      'Roya del Maiz',
    ]);

    if (!predicciones?.length) {
      return;
    }

    for (const prediccion of predicciones) {
      for (const e of prediccion.enfermedades || []) {
        if (enfermedadesConAlerta.has(e.enfermedad) && e.resultado >= 15) {
          await this.enviarNotificacion(prediccion, e, siembra);
        }
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

  private async enviarNotificacion(
    prediccion: IPrediccion,
    enfermedad: IPrediccionEnfermedad,
    siembra: ISiembra,
  ) {
    const idProductor = prediccion.idProductor || siembra.idProductor;
    const idSiembra = prediccion.idSiembra || siembra._id;
    const eventKey = `enfermedad:${idSiembra}:${this.slug(
      enfermedad.enfermedad,
    )}:${this.dateKey()}`;
    const titulo = 'Alerta de enfermedad';
    const mensaje = `Siembra de ${siembra.semilla?.cultivo || 'cultivo'} en ${
      siembra.lote?.nombre || 'lote'
    } con riesgo de ${enfermedad.enfermedad} al ${enfermedad.resultado}%`;

    await this.enviarEvento({
      modulo: 'Enfermedades',
      titulo,
      mensaje,
      siembra,
      idProductor,
      eventKey,
      data: {
        tipo: 'enfermedad',
        idSiembra,
        enfermedad: enfermedad.enfermedad,
        resultado: enfermedad.resultado,
        eventKey,
      },
    });
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
