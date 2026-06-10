import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ICreateClient } from 'modelos/src';
import { Usuario } from '../usuario/modelos/schema';
import { Client } from './client.model';
import { OauthService } from './oauth.service';
import { CreateToken } from './token.inputs';
import { Token } from './token.model';

@ApiTags('Oauth')
@Controller('oauth')
export class OauthController {
  constructor(private oauthService: OauthService) {}

  @Get('/client/:clientId/:clientSecret')
  @ApiOperation({ summary: 'Ruta para validar un client' })
  @ApiResponse({ status: 200, type: Client })
  async getClient(
    @Param('clientId') clientId: string,
    @Param('clientSecret') clientSecret: string,
  ) {
    return await this.oauthService.getClient(clientId, clientSecret);
  }

  @Post('/client')
  @ApiOperation({ summary: 'Ruta para crear un client' })
  @ApiResponse({ status: 200, type: Client })
  async createClient(@Body() body: ICreateClient) {
    return await this.oauthService.createClient(body);
  }

  // Usuario

  @Get('/usuario/:username')
  @ApiOperation({
    summary: 'Devuelve un usuario completo por nombre de usuario',
  })
  @ApiResponse({ status: 200, type: Usuario })
  async getUsuarioByUsername(@Param('username') username: string) {
    return await this.oauthService.getUsuario(username);
  }

  // Token

  @Get('/token/:accessToken')
  @ApiOperation({
    summary:
      'Ruta para autenticar, recibe el accessToken y devuelve el objeto Token',
  })
  @ApiResponse({ status: 200, type: Token })
  async getAccessToken(@Param('accessToken') accessToken: string) {
    return await this.oauthService.getAccessToken(accessToken);
  }

  @Get('refreshToken/:refreshToken')
  @ApiOperation({
    summary:
      'Ruta para renovar el token, recibe el refreshToken y devuelve el objeto Token nuevo',
  })
  @ApiResponse({ status: 200, type: Token })
  async getRefreshToken(@Param('refreshToken') refreshToken: string) {
    return await this.oauthService.getRefreshToken(refreshToken);
  }

  @Post('token')
  @ApiOperation({ summary: 'Guarda un token generado' })
  @ApiResponse({ status: 200, type: Token })
  @ApiBody({ type: CreateToken })
  async saveToken(@Body() body: CreateToken) {
    return await this.oauthService.saveToken(body);
  }

  @Put('token')
  @ApiOperation({ summary: 'Ruta para revocar un token' })
  @ApiResponse({ status: 200, type: Boolean })
  @ApiBody({ type: CreateToken })
  async revokeToken(@Body() body: CreateToken) {
    return await this.oauthService.revokeToken(body);
  }
}
