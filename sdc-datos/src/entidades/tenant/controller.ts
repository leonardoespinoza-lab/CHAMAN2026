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
import {
  ICreateTenant,
  IQueryParam,
  ISolicitudArchivado,
  IUpdateTenant,
} from 'modelos/src';
import { TenantsService } from './service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get()
  get(@Query() query: IQueryParam) {
    return this.service.get(query);
  }

  @Get('slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.service.getBySlug(slug);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  create(@Body() data: ICreateTenant) {
    return this.service.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: IUpdateTenant) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  archive(
    @Param('id') id: string,
    @Query() audit: ISolicitudArchivado,
  ) {
    return this.service.archive(id, audit);
  }
}
