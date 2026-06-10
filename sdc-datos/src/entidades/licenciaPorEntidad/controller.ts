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
import { LicenciaPorEntidadsService } from './service';
import {
  ICreateLicenciaPorEntidad,
  IQueryParam,
  IUpdateLicenciaPorEntidad,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('LicenciaPorEntidads')
@Controller('licenciaporentidads')
export class LicenciaPorEntidadsController {
  constructor(private readonly service: LicenciaPorEntidadsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateLicenciaPorEntidad) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: IUpdateLicenciaPorEntidad,
  ) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
