import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ISocketMessage, IUsuario } from 'modelos/src';
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
            const mqttMessage: ISocketMessage = {
              paths: [ruta],
              method,
              idUser: user._id,
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
}
