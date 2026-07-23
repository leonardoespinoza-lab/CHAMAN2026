import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import {
  IPermiso,
  ISocketMessage,
  ISocketMessageScope,
  IUsuario,
} from 'modelos/src';
import { MqttService } from './mqtt.service';
import { MQTT_TOPIC_APIS } from '../../env';

@Injectable()
export class MqttInterceptor implements NestInterceptor {
  constructor(private mqttService: MqttService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap((data) => {
        const res = context.switchToHttp().getResponse();
        const user: IUsuario = res.locals?.token?.user;
        if (user) {
          const className = context.getClass().name;
          // ej. className = "ClientesController"
          const ruta = className.split('Controller')[0].toLowerCase();
          const method = context.getArgs()[0].method.toLowerCase();
          const methods = ['post', 'put', 'delete'];
          if (methods.includes(method)) {
            const permiso: IPermiso = res.locals?.permiso;
            const mqttMessage: ISocketMessage = {
              paths: [ruta],
              method,
              idUser: user._id,
              alcance: this.resolverAlcance(ruta, data, permiso),
              body: data,
            };
            this.mqttService.sendMessage(
              MQTT_TOPIC_APIS,
              JSON.stringify(mqttMessage),
            );
          }
        }
      }),
    );
  }

  private resolverAlcance(
    ruta: string,
    data: any,
    permiso?: IPermiso,
  ): ISocketMessageScope | undefined {
    const entidad = Array.isArray(data) ? data[0] : data;
    const alcance: ISocketMessageScope = {};

    if (entidad && typeof entidad === 'object') {
      alcance.idTenant = this.valorTexto(entidad.idTenant);
      alcance.idAsesorPropietario = this.valorTexto(
        entidad.idAsesorPropietario,
      );
      alcance.idQuimica = this.valorTexto(entidad.idQuimica);
      alcance.idDistribuidor = this.valorTexto(entidad.idDistribuidor);
      alcance.idProductor = this.valorTexto(entidad.idProductor);
      alcance.idEstablecimiento = this.valorTexto(entidad.idEstablecimiento);
      alcance.idLote = this.valorTexto(entidad.idLote);

      if (ruta === 'quimicas') {
        alcance.idQuimica ||= this.valorTexto(entidad._id);
      }
      if (ruta === 'distribuidors') {
        alcance.idDistribuidor ||= this.valorTexto(entidad._id);
      }
      if (ruta === 'productors') {
        alcance.idProductor ||= this.valorTexto(entidad._id);
      }
      if (ruta === 'establecimientos') {
        alcance.idEstablecimiento ||= this.valorTexto(entidad._id);
      }
      if (ruta === 'lotes') {
        alcance.idLote ||= this.valorTexto(entidad._id);
      }
    }

    alcance.idTenant ||= permiso?.idTenant;
    alcance.idAsesorPropietario ||= permiso?.idAsesor;
    alcance.idQuimica ||= permiso?.idQuimica;
    alcance.idDistribuidor ||= permiso?.idDistribuidor;
    alcance.idProductor ||= permiso?.idProductor;
    alcance.idEstablecimiento ||= permiso?.idEstablecimiento;

    return Object.values(alcance).some(Boolean) ? alcance : undefined;
  }

  private valorTexto(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return undefined;
  }
}
