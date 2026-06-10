import { Controller, Get, Logger, Param, Query } from '@nestjs/common';
import { SiembrasService } from './service';
import { ISiembra, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Siembras')
@Controller('siembras')
export class SiembrasController {
  private logger = new Logger(SiembrasController.name);

  constructor(private service: SiembrasService) {}

  @Get()
  public async get(@Query() query: IQueryParam): Promise<IListado<ISiembra>> {
    this.logger.verbose(`get: ${JSON.stringify(query)}`);
    return await this.service.get(query);
  }

  @Get('/:id')
  public async getById(@Param('id') id: string): Promise<ISiembra> {
    this.logger.verbose(`getById: ${id}`);
    return await this.service.getById(id);
  }
}
