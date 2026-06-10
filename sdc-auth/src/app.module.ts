import { Module } from '@nestjs/common';
import { OauthModule } from './entidades/oauth/oauth.module';
import { HealthModule } from './auxiliares/health/health.module';
import { InicialService } from './auxiliares/inicial/inicial.service';
import { InicialModule } from './auxiliares/inicial/inicial.module';
import { ApiCheckModule } from './auxiliares/api-check/api-check.module';
import { ApiCheckService } from './auxiliares/api-check/api-check.service';

@Module({
  imports: [HealthModule, OauthModule, InicialModule, ApiCheckModule],
  controllers: [],
})
export class AppModule {
  constructor(
    private inicialService: InicialService,
    private checkApi: ApiCheckService,
  ) {
    // this.inicialService.crearDatosIniciales();
    this.onInit();
  }

  private async onInit() {
    const ok = await this.checkApi.checkApis();
    if (ok) {
      await this.inicialService.crearDatosIniciales();
    }
  }
}
