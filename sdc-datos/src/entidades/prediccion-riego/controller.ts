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
import { PrediccionRiegosService } from './service';
import {
  ICreatePrediccionRiego,
  IQueryParam,
  IUpdatePrediccionRiego,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Prediccion Riego')
@Controller('prediccion-riego')
export class PrediccionRiegosController {
  constructor(private readonly service: PrediccionRiegosService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreatePrediccionRiego) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdatePrediccionRiego) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }

  @Delete('/idSiembra/:idSiembra')
  async deleteByIdSiembra(@Param('idSiembra') idSiembra: string) {
    return await this.service.deleteByIdSiembra(idSiembra);
  }
}
