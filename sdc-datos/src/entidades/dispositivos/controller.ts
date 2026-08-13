import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { DispositivosService } from './service';
import {
  ICreateDispositivo,
  ILorawanDeviceCatalogItem,
  IQueryParam,
  IUpdateDispositivo,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { LorawanCatalogInternalGuard } from './lorawan-catalog-internal.guard';

@ApiTags('Dispositivos')
@Controller('dispositivos')
export class DispositivosController {
  constructor(private readonly service: DispositivosService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Post('lorawan-catalog/sync')
  @UseGuards(LorawanCatalogInternalGuard)
  async syncLorawanCatalog(
    @Body() data: { items?: ILorawanDeviceCatalogItem[] },
  ) {
    return await this.service.syncFromLorawanCatalog(data?.items || []);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateDispositivo) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateDispositivo) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
