import { Injectable, Logger } from '@nestjs/common';
import { AxiosService } from '../axios/axios.service';
import { API_DATOS } from 'src/env';

@Injectable()
export class ApiCheckService {
  constructor(private axios: AxiosService) {}
  private logger = new Logger(ApiCheckService.name);
  async checkApis(): Promise<boolean> {
    let ok = true;
    // Checkeo de las API en los ENVS de cada microservicio

    if (API_DATOS) {
      try {
        await this.axios.GET(`${API_DATOS.replace(/\/+$/, '')}/health`);
        this.logger.log(`API_DATOS: ${API_DATOS} [OK!]`);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        ok = false;
        this.logger.error(`API_DATOS: ${API_DATOS} [ERROR!]`);
      }
    }

    return ok;
  }
}
