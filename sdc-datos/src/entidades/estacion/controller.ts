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
import { EstacionsService } from './service';
import { ICreateEstacion, IQueryParam, IUpdateEstacion } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Estacions')
@Controller('estacions')
export class EstacionsController {
  constructor(private readonly service: EstacionsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateEstacion) {
    return await this.service.create(data);
  }

  @Post('many')
  async createMany(@Body() data: ICreateEstacion[]) {
    return await this.service.createMany(data);
  }

  @Post('upsert')
  async upsert(@Body() data: ICreateEstacion) {
    return await this.service.upsert(data);
  }

  @Post('upsert/many')
  async upsertMany(@Body() data: ICreateEstacion[]) {
    return await this.service.upsertMany(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateEstacion) {
    return await this.service.update(id, data);
  }

  @Put()
  async updateMany(@Query() query: IQueryParam, @Body() data: IUpdateEstacion) {
    return await this.service.updateMany(query, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }

  @Delete()
  async deleteMany(@Query() query: IQueryParam) {
    return await this.service.deleteMany(query);
  }
}
