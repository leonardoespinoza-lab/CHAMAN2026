import { Controller, Get, Logger, Param, Post, Headers, UnauthorizedException } from '@nestjs/common';
import { AGROMETEO_INTERNAL_TOKEN } from '../../env';
import { internalTokenMatches } from '../../auxiliares/security/app-hardening';
import { RiegoService } from './service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Riego')
@Controller('riego')
export class RiegoController {
  private logger = new Logger(RiegoController.name);

  constructor(private service: RiegoService) {}

  // Recalculo interno por cambio agronomico: no dispara integraciones HTTPS.
  @Post('recalcular/:idSiembra')
  public async recalcular(@Param('idSiembra') idSiembra: string, @Headers('x-chaman-internal-token') token?: string) {
    if (!internalTokenMatches(token, AGROMETEO_INTERNAL_TOKEN)) throw new UnauthorizedException();
    return await this.service.prediccion(idSiembra, false, { propagarErrores: true });
  }

  @Get('prediccion/:idSiembra')
  public async prediccion(@Param('idSiembra') idSiembra: string) {
    this.logger.verbose(`prediccion de riego: ${idSiembra}`);
    const res = await this.service.prediccion(idSiembra);
    this.logger.verbose(`prediccion de riego: ${idSiembra} finalizada`);
    return res;
  }

  @Get('capacidad-campo/:idSonda/:fecha')
  public async calcularCapacidadCampo(
    @Param('idSonda') idSonda: string,
    @Param('fecha') fecha: string,
  ) {
    this.logger.verbose(`calcularCapacidadCampo`);
    return await this.service.actualizarCapacidadCampo(idSonda, fecha);
  }

  @Get('prediccion')
  public async hacerPredicciones() {
    this.logger.verbose(`hacerPredicciones de riego`);
    return await this.service.hacerPredicciones();
  }
}
