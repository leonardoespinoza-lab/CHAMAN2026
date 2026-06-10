import { Injectable, Logger } from '@nestjs/common';
import { IIntegracion } from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class HttpsService {
  private logger = new Logger(HttpsService.name);

  constructor(private axiosService: AxiosService) {}

  public async send(integracion: IIntegracion, body: any, params = {}) {
    const credenciales = integracion.credenciales2;

    const headers = {};

    const url = integracion.endpoint;
    const method = integracion.method;

    // Agrega las credenciales
    if (credenciales?.length) {
      if (integracion.ubicacionCredenciales === 'Headers') {
        for (const credencial of credenciales) {
          headers[credencial.key] = credencial.value;
        }
      }
      if (integracion.ubicacionCredenciales === 'Body') {
        for (const credencial of credenciales) {
          body[credencial.key] = credencial.value;
        }
      }
      if (integracion.ubicacionCredenciales === 'Query Params') {
        for (const credencial of credenciales) {
          params[credencial.key] = credencial.value;
        }
      }
    }

    if (method === 'POST') {
      try {
        this.logger.log(
          `[${integracion.tipoIntegracion}] [${url}] [body][${JSON.stringify(
            body,
          )}] [headers][${JSON.stringify(headers)}] [params][${JSON.stringify(
            params,
          )}]`,
        );
        await this.axiosService.POST(url, body, { params, headers });
      } catch (err) {
        this.logger.error(
          `Error al enviar el registro a ${url} body: ${JSON.stringify(
            body,
          )} headers: ${JSON.stringify(headers)} params: ${JSON.stringify(
            params,
          )}`,
        );
        console.error(err);
      }
    }
  }

  // public async sendConfigCanal(
  //   config: IConfiguracionDispositivo,
  //   integracion: IIntegracion,
  // ) {
  //   const valores = config.config as IDispositivoCanal;

  //   const body = {
  //     fecha: config.fecha,
  //     deveui: config.deveui,
  //     deviceName: config.deviceName,
  //     // valores
  //     adr: valores.adr,
  //     dr: valores.dr,
  //     intervaloDeLectura: valores.intervaloDeLectura,
  //     muestrasPorLectura: valores.muestrasPorLectura,
  //     lecturasPorReporte: valores.lecturasPorReporte,
  //     promediarLecturas: valores.promediarLecturas,
  //     mensajesConfirmados: valores.mensajesConfirmados,
  //     vMajor: valores.vMajor,
  //     vMinor: valores.vMinor,
  //     vPatch: valores.vPatch,
  //   };

  //   const params = { tipo: 'configuracion' };

  //   await this.send(integracion, body, params);
  // }
}
