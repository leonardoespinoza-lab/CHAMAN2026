import { Injectable } from '@nestjs/common';
import { ICreatePrediccionRiego, IPrediccionRiego } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class PrediccionRiegoRepository {
  constructor(private axios: AxiosService) {}

  async create(data: ICreatePrediccionRiego): Promise<IPrediccionRiego> {
    const url = `${API_DATOS}/prediccion-riego`;
    return await this.axios.POST<IPrediccionRiego>(url, data);
  }
}
