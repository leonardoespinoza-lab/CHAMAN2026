import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ICreateSueloInta,
  IQueryParam,
  IUpdateSueloInta,
} from 'modelos/src';
import { SuelosIntaService } from './service';

@ApiTags('Suelos INTA')
@Controller('suelos-inta')
export class SuelosIntaController {
  constructor(private readonly service: SuelosIntaService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get('punto')
  async getByPoint(@Query('lat') lat: string, @Query('lng') lng: string) {
    return await this.service.getByPoint(lat, lng);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateSueloInta) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateSueloInta) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
