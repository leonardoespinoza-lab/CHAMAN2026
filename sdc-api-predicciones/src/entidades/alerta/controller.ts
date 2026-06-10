import { Controller, Get, Logger, Param, Query } from '@nestjs/common';
import { AlertasService } from './service';
import { IAlerta, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Alertas')
@Controller('alertas')
export class AlertasController {
  private logger = new Logger(AlertasController.name);

  constructor(private service: AlertasService) {}

  @Get()
  public async get(@Query() query: IQueryParam): Promise<IListado<IAlerta>> {
    this.logger.verbose(`get: ${JSON.stringify(query)}`);
    return await this.service.get(query);
  }

  @Get('/:id')
  public async getById(@Param('id') id: string): Promise<IAlerta> {
    this.logger.verbose(`getById: ${id}`);
    return await this.service.getById(id);
  }
}
