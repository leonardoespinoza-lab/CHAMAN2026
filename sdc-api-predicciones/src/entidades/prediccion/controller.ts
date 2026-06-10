import { Controller, Get, Logger, Param } from '@nestjs/common';
import { PrediccionsService } from './service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Prediccion')
@Controller('prediccions')
export class PrediccionsController {
  private logger = new Logger(PrediccionsController.name);

  constructor(private service: PrediccionsService) {}

  @Get(':idSiembra')
  public async prediccion(@Param('idSiembra') idSiembra: string) {
    this.logger.verbose(`prediccion: ${idSiembra}`);
    const res = await this.service.prediccion(idSiembra);
    this.logger.verbose(`prediccion: ${idSiembra} finalizada`);
    return res;
  }

  @Get()
  public async hacerPredicciones() {
    this.logger.verbose(`hacerPredicciones`);
    return await this.service.hacerPredicciones();
  }
}
