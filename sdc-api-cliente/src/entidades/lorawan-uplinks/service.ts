import { Injectable } from '@nestjs/common';
import { IUsuario } from 'modelos/src';
import { DispositivosService } from '../dispositivos/service';
import {
  esUsuarioAdmin,
  proyectarRawHistoryParaDispositivo,
} from '../dispositivos/historical-projection';
import { LorawanUplinksRepository } from './repository';

@Injectable()
export class LorawanUplinksService {
  constructor(
    private readonly repository: LorawanUplinksRepository,
    private readonly dispositivos: DispositivosService,
  ) {}

  async latest(query: {
    devEUI?: string;
    applicationID?: string;
    gatewayID?: string;
    limit?: string | number;
  }) {
    return await this.repository.latest({
      devEUI: query.devEUI,
      applicationID: query.applicationID,
      gatewayID: query.gatewayID,
      limit: Math.min(Number(query.limit) || 100, 300),
    });
  }

  async latestByDevice(limit?: string | number) {
    return await this.repository.latestByDevice(
      Math.min(Number(limit) || 1000, 5000),
    );
  }

  async rawHistory(
    devEUI: string,
    days: string | number | undefined,
    limit: string | number | undefined,
    user: IUsuario,
  ) {
    const contexto = await this.dispositivos.contextoAutorizadoPorIdentificador(
      devEUI,
      user,
      'Sensores',
    );
    const dispositivo = contexto.visible;
    const frames = await this.repository.rawHistory({
      devEUI: dispositivo.deveui || devEUI,
      days: Math.max(1, Math.min(Number(days) || 7, 365)),
      limit: Math.max(1, Math.min(Number(limit) || 5000, 20000)),
    });
    return esUsuarioAdmin(user)
      ? frames
      : proyectarRawHistoryParaDispositivo(
          frames,
          dispositivo,
          contexto.fisico,
        );
  }

  async reprocess(query: {
    devEUI?: string;
    limit?: string | number;
    replace?: string | boolean;
  }) {
    return await this.repository.reprocess({
      devEUI: query.devEUI,
      limit: Math.min(Number(query.limit) || 10000, 20000),
      replace: query.replace,
    });
  }
}
