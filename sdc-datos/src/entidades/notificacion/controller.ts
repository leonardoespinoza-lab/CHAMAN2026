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
import { NotificacionsService } from './service';
import {
  ICreateNotificacion,
  IQueryParam,
  IUpdateNotificacion,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Notificacions')
@Controller('notificacions')
export class NotificacionController {
  constructor(private readonly service: NotificacionsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateNotificacion) {
    return await this.service.create(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateNotificacion[]) {
    return await this.service.bulk(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateNotificacion) {
    return await this.service.update(id, data);
  }

  @Put()
  async updateMany(
    @Query() query: IQueryParam,
    @Body() data: IUpdateNotificacion,
  ) {
    return await this.service.updateMany(query, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
