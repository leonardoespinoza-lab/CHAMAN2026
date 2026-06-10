import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { TokenPushsService } from './service';
import { ICreateTokenPush, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('TokenPushs')
@Controller('tokenpushs')
export class TokenPushController {
  constructor(private readonly service: TokenPushsService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateTokenPush) {
    return await this.service.create(data);
  }

  @Post('upsert')
  async upsert(@Body() data: ICreateTokenPush) {
    return await this.service.upsert(data);
  }

  @Post('bulk')
  async bulk(@Body() data: ICreateTokenPush[]) {
    return await this.service.bulk(data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
