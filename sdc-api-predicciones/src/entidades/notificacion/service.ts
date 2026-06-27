import { Injectable, Logger } from '@nestjs/common';
import {
  ICreateNotificacion,
  INotificacion,
  IPrediccion,
  IPrediccionEnfermedad,
  ISiembra,
} from 'modelos/src';
import { NotificacionsRepository } from './repository';
import { UsuariosService } from '../usuarios/service';
import { TokenPushsService } from '../tokenPush/service';
import { PushNotificationsService } from '../../auxiliares/push-notifications/service';

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
    if (predicciones?.length) {
      for (const prediccion of predicciones) {
        for (const e of prediccion.enfermedades) {
          switch (e.enfermedad) {
            case 'Fusarium de la Espiga': {
              const valorAlerta = 15;
              if (e.resultado >= valorAlerta) {
                await this.enviarNotificacion(prediccion, e, siembra);
              }
              break;
            }
            case 'Mancha Amarilla': {
              const valorAlerta = 15;
              if (e.resultado >= valorAlerta) {
                await this.enviarNotificacion(prediccion, e, siembra);
              }
              break;
            }
            case 'Mancha de la Hoja': {
              const valorAlerta = 15;
              if (e.resultado >= valorAlerta) {
                await this.enviarNotificacion(prediccion, e, siembra);
              }
              break;
            }
            case 'Roya de la Hoja': {
              const valorAlerta = 15;
              if (e.resultado >= valorAlerta) {
                await this.enviarNotificacion(prediccion, e, siembra);
              }
              break;
            }
            case 'Roya Anaranjada': {
              const valorAlerta = 15;
              if (e.resultado >= valorAlerta) {
                await this.enviarNotificacion(prediccion, e, siembra);
              }
              break;
            }
            case 'Fin de Ciclo': {
              const valorAlerta = 15;
              if (e.resultado >= valorAlerta) {
                await this.enviarNotificacion(prediccion, e, siembra);
              }
              break;
            }
            case 'Roya del Maiz': {
              const valorAlerta = 15;
              if (e.resultado >= valorAlerta) {
                await this.enviarNotificacion(prediccion, e, siembra);
              }
              break;
            }
            default:
              break;
          }
        }
      }
    }
  }

  private async enviarNotificacion(
    prediccion: IPrediccion,
    enfermedad: IPrediccionEnfermedad,
    siembra: ISiembra,
  ) {
    const idProductor = prediccion.idProductor;
    const usuarios = await this.usuariosService.getPorIdProductor(idProductor);
    const ids = usuarios.map((usuario) => usuario._id);
    const tokensUsuarios = await this.tokenPushsService.getPorIdsUsuarios(ids);
    const tokens = tokensUsuarios.map((token) => token.tokenPush);
    const idsUsuariosConToken = tokensUsuarios.map((token) => token.idUsuario);
    const idsUsuariosConTokenUnicos = [...new Set(idsUsuariosConToken)];
    const titulo = 'Alerta de enfermedad';
    const mensaje = `Siembra de ${siembra.semilla?.cultivo} en ${siembra.lote?.nombre} con riesgo de ${enfermedad.enfermedad} al ${enfermedad.resultado}%`;

    if (!idsUsuariosConTokenUnicos?.length) {
      this.logger.verbose(
        `No hay usuarios con token para enviar notificacion. ${mensaje}`,
      );
      return;
    }

    this.logger.verbose(
      `Enviando notificacion a ${idsUsuariosConTokenUnicos.length} usuarios. ${mensaje}`,
    );

    await this.pushNotificationsService.sendNotifications(tokens, titulo, mensaje);

    for (const idUsuario of idsUsuariosConTokenUnicos) {
      const createNotif: ICreateNotificacion = {
        mensaje,
        titulo,
        tenant: {
          idProductor,
          idUsuario,
        },
      };
      await this.create(createNotif);
    }
  }
}
