import { Injectable } from '@nestjs/common';
import { ITokenPush, ICreateTokenPush } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class TokenPushsRepository {
  constructor(private axios: AxiosService) {}

  async upsert(datos: ICreateTokenPush): Promise<ITokenPush> {
    const url = `${API_DATOS}/tokenpushs/upsert`;
    return await this.axios.POST<ITokenPush>(url, datos);
  }
}
