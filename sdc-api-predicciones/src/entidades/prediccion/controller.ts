import { Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { PrediccionsService } from './service';
import { ApiTags } from '@nestjs/swagger';
import { AgroclimaService } from '../agroclima/service';

@ApiTags('Prediccion')
@Controller('prediccions')
export class PrediccionsController {
  private logger = new Logger(PrediccionsController.name);

  constructor(
    private service: PrediccionsService,
    private agroclimaService: AgroclimaService,
  ) {}

  @Get(':idSiembra/agroclima')
  public async agroclima(@Param('idSiembra') idSiembra: string) {
    this.logger.verbose(`agroclima: ${idSiembra}`);
    const res = await this.agroclimaService.evaluarYRegistrar(idSiembra);
    this.logger.verbose(`agroclima: ${idSiembra} finalizada`);
    return res;
  }

  @Get(':idSiembra')
  public async prediccion(@Param('idSiembra') idSiembra: string) {
    this.logger.verbose(`prediccion: ${idSiembra}`);
    const res = await this.service.prediccion(idSiembra);
    this.logger.verbose(`prediccion: ${idSiembra} finalizada`);
    return res;
  }

  @Post(':idSiembra/reconstruir')
  public async reconstruir(@Param('idSiembra') idSiembra: string) {
    this.logger.verbose(`reconstruir prediccion: ${idSiembra}`);
    const res = await this.service.reconstruir(idSiembra);
    this.logger.verbose(`reconstruir prediccion: ${idSiembra} finalizada`);
    return res;
  }

  @Get()
  public async hacerPredicciones() {
    this.logger.verbose(`hacerPredicciones`);
    return await this.service.hacerPredicciones();
  }
}
