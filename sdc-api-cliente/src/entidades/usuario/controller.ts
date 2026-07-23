import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsuariosService } from './service';
import {
  IUsuario,
  IListado,
  IQueryParam,
  ICreateUsuario,
  IUpdateUsuario,
  IPermiso,
  IDetalleAuditoriaAsesor,
  IResumenRedAsesores,
  IResumenRedComercial,
} from 'modelos/src';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('Usuarios')
@Controller('usuarios')
@UseGuards(PermisoGuard)
export class UsuariosController {
  constructor(private service: UsuariosService) {}

  @Get()
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Asesor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IUsuario>> {
    return await this.service.get(query, permiso);
  }

  @Get('/propio')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getUsuarioPropio(
    @GetUser() user: IUsuario,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IUsuario> {
    return await this.service.getPropio(user._id);
  }

  @Get('/asesores/resumen')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async getResumenRedAsesores(): Promise<IResumenRedAsesores> {
    return await this.service.getResumenRedAsesores();
  }

  @Get('/asesores/:id/auditoria')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async getDetalleAuditoriaAsesor(
    @Param('id') id: string,
  ): Promise<IDetalleAuditoriaAsesor> {
    return await this.service.getDetalleAuditoriaAsesor(id);
  }

  @Get('/red/comercial')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getResumenRedComercial(
    @GetPermiso() permiso: IPermiso,
  ): Promise<IResumenRedComercial> {
    return await this.service.getResumenRedComercial(permiso);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Asesor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IUsuario> {
    return await this.service.getById(id, permiso);
  }

  @Get('/usuario/:usuario')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Asesor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getByUsername(
    @Param('usuario') usuario: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IUsuario> {
    return await this.service.getByUsername(usuario, permiso);
  }

  @Post()
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Asesor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async create(
    @Body() body: ICreateUsuario,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<IUsuario> {
    return await this.service.create(body, permiso, user);
  }

  @Post('autogestion/crear')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async crearFront(@Body() body: ICreateUsuario): Promise<IUsuario> {
    return await this.service.crearFront(body);
  }

  @Put('/password')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async cambiarPasswordPropio(
    @Body('oldPassword') oldPassword: string,
    @Body('newPassword') newPassword: string,
    @GetUser() user: IUsuario,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IUsuario> {
    return await this.service.cambiarPasswordPropio(
      oldPassword,
      newPassword,
      permiso,
      user,
    );
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Asesor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateUsuario,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<IUsuario> {
    return await this.service.update(id, body, permiso, user);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Asesor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<IUsuario> {
    return await this.service.delete(id, permiso, user);
  }

  @Put('/desactivar/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Asesor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async desactivar(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IUsuario> {
    return await this.service.desactivar(id, permiso);
  }

  @Put('/activar/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Asesor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async activar(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IUsuario> {
    return await this.service.activar(id, permiso);
  }

  @Put('/password/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Asesor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async cambiarPassword(
    @Param('id') id: string,
    @Body('password') password: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IUsuario> {
    return await this.service.cambiarPassword(id, password, permiso);
  }
}
