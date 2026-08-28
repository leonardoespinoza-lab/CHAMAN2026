import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
} from '@nestjs/common';
import { SemillasService } from './service';
import {
  ICreateSemilla,
  IImportacionCatalogoCultivosRequest,
  IQueryParam,
  IUpdateSemilla,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { CatalogImportService } from './catalog-import.service';

@ApiTags('Semillas')
@Controller('semillas')
export class SemillasController {
  constructor(
    private readonly service: SemillasService,
    private readonly catalogImport: CatalogImportService,
  ) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateSemilla) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateSemilla[]) {
    return await this.service.bulk(data);
  }

  @Post('importar')
  async importCatalog(@Body() data: IImportacionCatalogoCultivosRequest) {
    return await this.catalogImport.importar(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateSemilla) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
