import { Injectable, Logger } from '@nestjs/common';
import { IClient, ICreateClient } from 'modelos/src';
import { ClientsService } from '../../entidades/client/client.service';
import { CLIENT_ID_INICIAL, CLIENT_SECRET_INICIAL } from '../../env';

@Injectable()
export class InicialService {
  constructor(private clients: ClientsService) {}

  private async crearClientInicial(): Promise<IClient> {
    Logger.verbose(`Buscando client inicial ${CLIENT_ID_INICIAL}`);
    let client = await this.clients.getClient(
      CLIENT_ID_INICIAL,
      CLIENT_SECRET_INICIAL,
    );
    if (!client) {
      Logger.verbose(`Creando client inicial ${CLIENT_ID_INICIAL}`);
      const datos: ICreateClient = {
        id: CLIENT_ID_INICIAL,
        clientSecret: CLIENT_SECRET_INICIAL,
        grants: ['password', 'refresh_token'],
        redirectUris: [],
        accessTokenLifetime: 3600 * 10,
        refreshTokenLifetime: 3600 * 100,
      };
      client = await this.clients.createClient(datos);
      Logger.verbose(`Client inicial ${CLIENT_ID_INICIAL} creado`);
    }
    return client;
  }

  async crearDatosIniciales() {
    await this.crearClientInicial();
  }
}
