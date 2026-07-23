import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  IUsuario,
  IListado,
  IQueryParam,
  ICreateUsuario,
  IUpdateUsuario,
  ICreateProductor,
  IPermiso,
  IFilter,
  IDetalleAuditoriaAsesor,
  IResumenAdministrativoAsesor,
  IResumenRedAsesores,
  IResumenRedComercial,
  IGeoJSONPoint,
  ISolicitudArchivado,
  ITenant,
  ModuloPermiso,
} from 'modelos/src';
import bcrypt from 'bcryptjs';
import { UsuariosRepository } from './repository';
import { HelperService } from '../../auxiliares/helper';
import { ProductorsService } from '../productor/service';
import { AuthenticationService } from '../../auxiliares/authentication/authentication.service';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';
import { DistribuidorsRepository } from '../distribuidor/repository';
import { ProductorsRepository } from '../productor/repository';
import { establecimientosDelPermiso } from '../../auxiliares/authorization/alcance-permiso';
import { TenantsRepository } from '../tenant/repository';

@Injectable()
export class UsuariosService {
  private readonly passwordPolicyMessage =
    'La contrasena debe tener al menos 8 caracteres, incluir mayuscula, minuscula y numero, sin espacios.';

  constructor(
    private repository: UsuariosRepository,
    private productorService: ProductorsService,
    private authenticationService: AuthenticationService,
    private establecimientosRepository: EstablecimientosRepository,
    private lotesRepository: LotesRepository,
    private distribuidoresRepository: DistribuidorsRepository,
    private productoresRepository: ProductorsRepository,
    @Optional() private readonly tenantsRepository?: TenantsRepository,
  ) {}

  async getPropio(id: string): Promise<IUsuario> {
    return await this.repository.getById(id);
  }

  async getById(id: string, permiso: IPermiso): Promise<IUsuario> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new ForbiddenException('No tiene permiso para ver este usuario');
    }
    return res;
  }

  async getByUsername(nombre: string, permiso: IPermiso): Promise<IUsuario> {
    const res = await this.repository.getByUsername(nombre);
    if (!this.puedeVer(res, permiso)) {
      throw new ForbiddenException('No tiene permiso para ver este usuario');
    }
    return res;
  }

  async get(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IUsuario>> {
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async getResumenRedAsesores(): Promise<IResumenRedAsesores> {
    const [
      usuariosListado,
      productoresListado,
      establecimientosListado,
      lotesListado,
    ] = await Promise.all([
      this.repository.get({
        page: 0,
        limit: 0,
        includeArchived: true,
        sort: 'username',
        select: '-hash -datosProfesionales.foto',
      }),
      this.productoresRepository.get({
        page: 0,
        limit: 0,
        includeArchived: true,
        select: '_id nombre idAsesorPropietario archivado',
      }),
      this.establecimientosRepository.get({
        page: 0,
        limit: 0,
        includeArchived: true,
        select: '_id nombre idProductor idAsesorPropietario archivado',
      }),
      this.lotesRepository.get({
        page: 0,
        limit: 0,
        includeArchived: true,
        select:
          '_id nombre idEstablecimiento idAsesorPropietario ubicacion.superficie archivado',
      }),
    ]);

    const usuarios = usuariosListado?.datos || [];
    const productores = productoresListado?.datos || [];
    const establecimientos = establecimientosListado?.datos || [];
    const lotes = lotesListado?.datos || [];
    const usuariosAsesores = usuarios.filter((usuario) =>
      usuario.permisos?.some((permiso) => permiso.nivel === 'Asesor'),
    );
    const establecimientosGlobales = new Set<string>();
    const productoresGlobales = new Set<string>();
    const lotesGlobales = new Set<string>();
    const usuariosGestionadosGlobales = new Set<string>();

    const asesores: IResumenAdministrativoAsesor[] = usuariosAsesores.map(
      (asesor) => {
        const idAsesor = String(asesor._id);
        const incluirArchivados = asesor.archivado === true;
        const permisosAsesor =
          asesor.permisos?.filter((permiso) => permiso.nivel === 'Asesor') ||
          [];
        const idsAsignados = new Set(
          permisosAsesor
            .flatMap((permiso) => permiso.idEstablecimientos || [])
            .map(String),
        );
        const idsProductores = new Set(
          productores
            .filter(
              (productor) =>
                String(productor.idAsesorPropietario || '') === idAsesor &&
                (incluirArchivados || !productor.archivado),
            )
            .map((productor) => String(productor._id)),
        );
        if (!incluirArchivados) {
          idsProductores.forEach((id) => productoresGlobales.add(id));
        }
        const idsEstablecimientos = new Set(
          establecimientos
            .filter(
              (establecimiento) =>
                (incluirArchivados || !establecimiento.archivado) &&
                (String(establecimiento.idAsesorPropietario || '') ===
                  idAsesor ||
                  idsProductores.has(
                    String(establecimiento.idProductor || ''),
                  ) ||
                  idsAsignados.has(String(establecimiento._id))),
            )
            .map((establecimiento) => String(establecimiento._id)),
        );
        if (!incluirArchivados) {
          idsEstablecimientos.forEach((id) => establecimientosGlobales.add(id));
        }

        const lotesGestionados = lotes.filter(
          (lote) =>
            (incluirArchivados || !lote.archivado) &&
            (String(lote.idAsesorPropietario || '') === idAsesor ||
              idsEstablecimientos.has(String(lote.idEstablecimiento || ''))),
        );
        if (!incluirArchivados) {
          lotesGestionados.forEach((lote) =>
            lotesGlobales.add(String(lote._id)),
          );
        }

        const usuariosGestionados = usuarios.filter(
          (usuario) =>
            String(usuario._id) !== idAsesor &&
            (incluirArchivados || !usuario.archivado) &&
            usuario.permisos?.some(
              (permiso) =>
                (permiso.nivel === 'Productor' &&
                  !!permiso.idProductor &&
                  idsProductores.has(String(permiso.idProductor))) ||
                (permiso.nivel === 'Establecimiento' &&
                  !!permiso.idEstablecimiento &&
                  idsEstablecimientos.has(String(permiso.idEstablecimiento))),
            ),
        );
        if (!incluirArchivados) {
          usuariosGestionados.forEach((usuario) =>
            usuariosGestionadosGlobales.add(String(usuario._id)),
          );
        }

        const hectareas = lotesGestionados.reduce(
          (total, lote) =>
            total + this.superficieAdministrativa(lote.ubicacion?.superficie),
          0,
        );
        const nombre =
          asesor.datosPersonales?.nombre?.trim() ||
          asesor.username ||
          'Asesor sin nombre';
        const perfilCompleto = Boolean(
          asesor.datosProfesionales?.profesion &&
          asesor.datosProfesionales?.matricula &&
          asesor.ubicacionProfesional?.geojson?.coordinates?.length === 2,
        );

        return {
          id: idAsesor,
          username: asesor.username,
          nombre,
          email: asesor.datosPersonales?.email || asesor.email,
          telefono: asesor.datosPersonales?.telefono,
          activo: asesor.activo !== false,
          archivado: asesor.archivado === true,
          fechaArchivado: asesor.fechaArchivado,
          archivadoPor: asesor.archivadoPor,
          fechaCreacion: asesor.fechaCreacion,
          profesion: asesor.datosProfesionales?.profesion,
          especialidad: asesor.datosProfesionales?.especialidad,
          matricula: asesor.datosProfesionales?.matricula,
          consejoProfesional: asesor.datosProfesionales?.consejoProfesional,
          direccion: asesor.ubicacionProfesional?.direccion,
          geojson: asesor.ubicacionProfesional?.geojson,
          radioInfluenciaKm: asesor.ubicacionProfesional?.radioInfluenciaKm,
          perfilCompleto,
          metricas: {
            productores: idsProductores.size,
            establecimientos: idsEstablecimientos.size,
            lotes: lotesGestionados.length,
            hectareas: this.redondearHectareas(hectareas),
            usuariosGestionados: usuariosGestionados.length,
          },
        };
      },
    );

    asesores.sort(
      (a, b) =>
        b.metricas.hectareas - a.metricas.hectareas ||
        a.nombre.localeCompare(b.nombre, 'es'),
    );
    const asesoresOperativos = asesores.filter((asesor) => !asesor.archivado);
    const hectareasGlobales = lotes
      .filter((lote) => !lote.archivado && lotesGlobales.has(String(lote._id)))
      .reduce(
        (total, lote) =>
          total + this.superficieAdministrativa(lote.ubicacion?.superficie),
        0,
      );

    return {
      actualizadoEn: new Date().toISOString(),
      totales: {
        asesores: asesoresOperativos.length,
        activos: asesoresOperativos.filter((asesor) => asesor.activo).length,
        archivados: asesores.filter((asesor) => asesor.archivado).length,
        perfilesCompletos: asesoresOperativos.filter(
          (asesor) => asesor.perfilCompleto,
        ).length,
        geolocalizados: asesoresOperativos.filter(
          (asesor) => asesor.geojson?.coordinates?.length === 2,
        ).length,
        productores: productoresGlobales.size,
        establecimientos: establecimientosGlobales.size,
        lotes: lotesGlobales.size,
        hectareas: this.redondearHectareas(hectareasGlobales),
        usuariosGestionados: usuariosGestionadosGlobales.size,
      },
      asesores,
    };
  }

  async getResumenRedComercial(
    permiso: IPermiso,
  ): Promise<IResumenRedComercial> {
    const filtroPorNivel = (
      entidad: 'distribuidor' | 'productor' | 'establecimiento' | 'lote',
    ) => {
      if (permiso.nivel === 'Quimica') return { idQuimica: permiso.idQuimica };
      if (permiso.nivel === 'Distribuidor') {
        return entidad === 'distribuidor'
          ? { _id: permiso.idDistribuidor }
          : { idDistribuidor: permiso.idDistribuidor };
      }
      if (permiso.nivel === 'Productor') {
        if (entidad === 'distribuidor') return { _id: permiso.idDistribuidor };
        return entidad === 'productor'
          ? { _id: permiso.idProductor }
          : { idProductor: permiso.idProductor };
      }
      if (permiso.nivel === 'Asesor') {
        if (entidad === 'distribuidor') {
          return permiso.idDistribuidor
            ? { _id: permiso.idDistribuidor }
            : { _id: { $in: [] } };
        }
        if (entidad === 'productor') {
          return { _id: { $in: permiso.idProductores || [] } };
        }
        if (entidad === 'establecimiento') {
          return {
            _id: { $in: establecimientosDelPermiso(permiso) },
          };
        }
        return {
          idEstablecimiento: {
            $in: establecimientosDelPermiso(permiso),
          },
        };
      }
      return {};
    };
    const query = (
      filter: Record<string, unknown>,
      select: string,
    ): IQueryParam => ({
      page: 0,
      limit: 0,
      sort: 'nombre',
      select,
      filter: Object.keys(filter).length ? JSON.stringify(filter) : undefined,
    });

    const [
      distribuidoresListado,
      productoresListado,
      establecimientosListado,
      lotesListado,
      usuariosListado,
    ] = await Promise.all([
      this.distribuidoresRepository.get(
        query(
          filtroPorNivel('distribuidor'),
          '_id nombre idQuimica direccion geojson radioInfluenciaKm',
        ),
      ),
      this.productoresRepository.get(
        query(
          filtroPorNivel('productor'),
          '_id nombre idQuimica idDistribuidor direccion geojson radioInfluenciaKm',
        ),
      ),
      this.establecimientosRepository.get(
        query(
          filtroPorNivel('establecimiento'),
          '_id nombre idQuimica idDistribuidor idProductor ubicacion',
        ),
      ),
      this.lotesRepository.get(
        query(
          filtroPorNivel('lote'),
          '_id nombre idDistribuidor idProductor idEstablecimiento ubicacion.superficie',
        ),
      ),
      this.repository.get({
        page: 0,
        limit: 0,
        includeArchived: true,
        select: '_id permisos activo',
      }),
    ]);

    const distribuidores = distribuidoresListado?.datos || [];
    const productores = productoresListado?.datos || [];
    const establecimientos = establecimientosListado?.datos || [];
    const lotes = lotesListado?.datos || [];
    const usuarios = usuariosListado?.datos || [];
    const nombreDistribuidor = new Map(
      distribuidores.map((item) => [
        String(item._id),
        item.nombre || 'Distribuidor sin nombre',
      ]),
    );
    const nombreProductor = new Map(
      productores.map((item) => [
        String(item._id),
        item.nombre || 'Productor sin nombre',
      ]),
    );
    const usuariosPorAlcance = (
      idsDistribuidores: Set<string>,
      idsProductores: Set<string>,
      idsEstablecimientos: Set<string>,
    ): Set<string> => {
      const ids = new Set<string>();
      usuarios.forEach((usuario) => {
        const coincide = (usuario.permisos || []).some(
          (p) =>
            (!!p.idDistribuidor &&
              idsDistribuidores.has(String(p.idDistribuidor))) ||
            (!!p.idProductor && idsProductores.has(String(p.idProductor))) ||
            (!!p.idEstablecimiento &&
              idsEstablecimientos.has(String(p.idEstablecimiento))),
        );
        if (coincide && usuario._id) ids.add(String(usuario._id));
      });
      return ids;
    };
    const ubicacionEstablecimiento = (
      establecimiento: (typeof establecimientos)[number],
    ): IGeoJSONPoint | undefined => {
      const centros = (establecimiento.ubicacion || [])
        .map((ubicacion) => {
          if (
            ubicacion.centro &&
            Number.isFinite(ubicacion.centro.lng) &&
            Number.isFinite(ubicacion.centro.lat)
          ) {
            return [ubicacion.centro.lng, ubicacion.centro.lat] as [
              number,
              number,
            ];
          }
          const coordenadas = ubicacion.geojson?.coordinates?.[0] || [];
          if (!coordenadas.length) return undefined;
          const total = coordenadas.reduce(
            (acc, [lng, lat]) =>
              [acc[0] + Number(lng), acc[1] + Number(lat)] as [number, number],
            [0, 0] as [number, number],
          );
          return [
            total[0] / coordenadas.length,
            total[1] / coordenadas.length,
          ] as [number, number];
        })
        .filter((punto): punto is [number, number] => !!punto);
      if (!centros.length) return undefined;
      return {
        type: 'Point',
        coordinates: [
          centros.reduce((sum, punto) => sum + punto[0], 0) / centros.length,
          centros.reduce((sum, punto) => sum + punto[1], 0) / centros.length,
        ],
      };
    };
    const promedioPuntos = (
      puntos: Array<IGeoJSONPoint | undefined>,
    ): IGeoJSONPoint | undefined => {
      const validos = puntos
        .map((punto) => punto?.coordinates)
        .filter(
          (punto): punto is [number, number] =>
            !!punto && Number.isFinite(punto[0]) && Number.isFinite(punto[1]),
        );
      if (!validos.length) return undefined;
      return {
        type: 'Point',
        coordinates: [
          validos.reduce((sum, punto) => sum + punto[0], 0) / validos.length,
          validos.reduce((sum, punto) => sum + punto[1], 0) / validos.length,
        ],
      };
    };
    const puntoEstablecimiento = new Map(
      establecimientos.map((item) => [
        String(item._id),
        ubicacionEstablecimiento(item),
      ]),
    );

    const establecimientosResumen = establecimientos.map((establecimiento) => {
      const id = String(establecimiento._id);
      const lotesEntidad = lotes.filter(
        (lote) => String(lote.idEstablecimiento || '') === id,
      );
      const idsEstablecimientos = new Set([id]);
      return {
        id,
        nombre: establecimiento.nombre || 'Establecimiento sin nombre',
        idDistribuidor: establecimiento.idDistribuidor
          ? String(establecimiento.idDistribuidor)
          : undefined,
        idProductor: establecimiento.idProductor
          ? String(establecimiento.idProductor)
          : undefined,
        productor: nombreProductor.get(
          String(establecimiento.idProductor || ''),
        ),
        geojson: puntoEstablecimiento.get(id),
        lotes: lotesEntidad.length,
        hectareas: this.redondearHectareas(
          lotesEntidad.reduce(
            (total, lote) =>
              total + this.superficieAdministrativa(lote.ubicacion?.superficie),
            0,
          ),
        ),
        usuarios: usuariosPorAlcance(new Set(), new Set(), idsEstablecimientos)
          .size,
      };
    });

    const productoresResumen = productores.map((productor) => {
      const id = String(productor._id);
      const establecimientosEntidad = establecimientosResumen.filter(
        (item) => item.idProductor === id,
      );
      const idsEstablecimientos = new Set(
        establecimientosEntidad.map((item) => item.id),
      );
      const lotesEntidad = lotes.filter(
        (lote) =>
          String(lote.idProductor || '') === id ||
          idsEstablecimientos.has(String(lote.idEstablecimiento || '')),
      );
      const ubicacionCargada =
        productor.geojson?.coordinates?.length === 2
          ? productor.geojson
          : undefined;
      const geojson =
        ubicacionCargada ||
        promedioPuntos(establecimientosEntidad.map((item) => item.geojson));
      return {
        id,
        nombre: productor.nombre || 'Productor sin nombre',
        idQuimica: productor.idQuimica
          ? String(productor.idQuimica)
          : undefined,
        idDistribuidor: productor.idDistribuidor
          ? String(productor.idDistribuidor)
          : undefined,
        distribuidor: nombreDistribuidor.get(
          String(productor.idDistribuidor || ''),
        ),
        direccion: productor.direccion,
        geojson,
        radioInfluenciaKm: productor.radioInfluenciaKm,
        fuenteUbicacion: ubicacionCargada
          ? ('Cargada' as const)
          : geojson
            ? ('Derivada' as const)
            : ('Pendiente' as const),
        metricas: {
          establecimientos: establecimientosEntidad.length,
          lotes: new Set(lotesEntidad.map((item) => String(item._id))).size,
          hectareas: this.redondearHectareas(
            establecimientosEntidad.reduce(
              (total, item) => total + item.hectareas,
              0,
            ),
          ),
          usuarios: usuariosPorAlcance(
            new Set(),
            new Set([id]),
            idsEstablecimientos,
          ).size,
        },
      };
    });

    const distribuidoresResumen = distribuidores.map((distribuidor) => {
      const id = String(distribuidor._id);
      const productoresEntidad = productoresResumen.filter(
        (item) => item.idDistribuidor === id,
      );
      const idsProductores = new Set(productoresEntidad.map((item) => item.id));
      const establecimientosEntidad = establecimientosResumen.filter(
        (item) =>
          item.idDistribuidor === id ||
          (!!item.idProductor && idsProductores.has(item.idProductor)),
      );
      const idsEstablecimientos = new Set(
        establecimientosEntidad.map((item) => item.id),
      );
      const ubicacionCargada =
        distribuidor.geojson?.coordinates?.length === 2
          ? distribuidor.geojson
          : undefined;
      const geojson =
        ubicacionCargada ||
        promedioPuntos(productoresEntidad.map((item) => item.geojson));
      return {
        id,
        nombre: distribuidor.nombre || 'Distribuidor sin nombre',
        idQuimica: distribuidor.idQuimica
          ? String(distribuidor.idQuimica)
          : undefined,
        direccion: distribuidor.direccion,
        geojson,
        radioInfluenciaKm: distribuidor.radioInfluenciaKm,
        fuenteUbicacion: ubicacionCargada
          ? ('Cargada' as const)
          : geojson
            ? ('Derivada' as const)
            : ('Pendiente' as const),
        metricas: {
          productores: productoresEntidad.length,
          establecimientos: establecimientosEntidad.length,
          lotes: establecimientosEntidad.reduce(
            (total, item) => total + item.lotes,
            0,
          ),
          hectareas: this.redondearHectareas(
            establecimientosEntidad.reduce(
              (total, item) => total + item.hectareas,
              0,
            ),
          ),
          usuarios: usuariosPorAlcance(
            new Set([id]),
            idsProductores,
            idsEstablecimientos,
          ).size,
        },
      };
    });

    const idsDistribuidores = new Set(
      distribuidoresResumen.map((item) => item.id),
    );
    const idsProductores = new Set(productoresResumen.map((item) => item.id));
    const idsEstablecimientos = new Set(
      establecimientosResumen.map((item) => item.id),
    );
    return {
      actualizadoEn: new Date().toISOString(),
      totales: {
        distribuidores: distribuidoresResumen.length,
        productores: productoresResumen.length,
        establecimientos: establecimientosResumen.length,
        lotes: lotes.length,
        hectareas: this.redondearHectareas(
          establecimientosResumen.reduce(
            (total, item) => total + item.hectareas,
            0,
          ),
        ),
        usuarios: usuariosPorAlcance(
          idsDistribuidores,
          idsProductores,
          idsEstablecimientos,
        ).size,
      },
      distribuidores: distribuidoresResumen.sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es'),
      ),
      productores: productoresResumen.sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es'),
      ),
      establecimientos: establecimientosResumen.sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es'),
      ),
    };
  }

  async getDetalleAuditoriaAsesor(
    idAsesor: string,
  ): Promise<IDetalleAuditoriaAsesor> {
    const [
      asesor,
      usuariosListado,
      establecimientosListado,
      lotesListado,
      productoresListado,
    ] = await Promise.all([
      this.repository.getById(idAsesor),
      this.repository.get({
        page: 0,
        limit: 0,
        sort: 'username',
        select: '-hash -datosProfesionales.foto',
      }),
      this.establecimientosRepository.get({
        page: 0,
        limit: 0,
        includeArchived: true,
        select: '_id nombre idProductor idAsesorPropietario archivado',
      }),
      this.lotesRepository.get({
        page: 0,
        limit: 0,
        includeArchived: true,
        select:
          '_id nombre idEstablecimiento idAsesorPropietario ubicacion.superficie archivado',
      }),
      this.productoresRepository.get({
        page: 0,
        limit: 0,
        includeArchived: true,
        select: '_id nombre idAsesorPropietario archivado',
      }),
    ]);

    const permisosAsesor =
      asesor?.permisos?.filter((permiso) => permiso.nivel === 'Asesor') || [];
    if (!asesor?._id || permisosAsesor.length === 0) {
      throw new NotFoundException('El usuario solicitado no es un asesor');
    }

    const usuarios = usuariosListado?.datos || [];
    const establecimientos = establecimientosListado?.datos || [];
    const lotes = lotesListado?.datos || [];
    const productores = productoresListado?.datos || [];
    const productoresGestionados = productores.filter(
      (productor) => String(productor.idAsesorPropietario || '') === idAsesor,
    );
    const idsProductores = new Set(
      productoresGestionados.map((productor) => String(productor._id)),
    );
    const idsAsignados = new Set(
      permisosAsesor
        .flatMap((permiso) => permiso.idEstablecimientos || [])
        .map(String),
    );
    const establecimientosGestionados = establecimientos.filter(
      (establecimiento) =>
        String(establecimiento.idAsesorPropietario || '') === idAsesor ||
        idsProductores.has(String(establecimiento.idProductor || '')) ||
        idsAsignados.has(String(establecimiento._id)),
    );
    const idsEstablecimientos = new Set(
      establecimientosGestionados.map((establecimiento) =>
        String(establecimiento._id),
      ),
    );
    const nombreEstablecimiento = new Map(
      establecimientosGestionados.map((establecimiento) => [
        String(establecimiento._id),
        establecimiento.nombre || 'Establecimiento sin nombre',
      ]),
    );
    const nombreProductor = new Map(
      productores.map((productor) => [
        String(productor._id),
        productor.nombre || 'Productor sin nombre',
      ]),
    );
    const lotesGestionados = lotes.filter(
      (lote) =>
        String(lote.idAsesorPropietario || '') === idAsesor ||
        idsEstablecimientos.has(String(lote.idEstablecimiento || '')),
    );
    const usuariosGestionados = usuarios.flatMap((usuario) =>
      (usuario.permisos || [])
        .filter(
          (permiso) =>
            (permiso.nivel === 'Productor' &&
              !!permiso.idProductor &&
              idsProductores.has(String(permiso.idProductor))) ||
            (permiso.nivel === 'Establecimiento' &&
              !!permiso.idEstablecimiento &&
              idsEstablecimientos.has(String(permiso.idEstablecimiento))),
        )
        .map((permiso) => ({
          id: String(usuario._id),
          username: usuario.username,
          nombre:
            usuario.datosPersonales?.nombre?.trim() ||
            usuario.username ||
            'Usuario sin nombre',
          email: usuario.datosPersonales?.email || usuario.email,
          activo: usuario.activo !== false,
          rol: permiso.rol,
          nivel: permiso.nivel as 'Productor' | 'Establecimiento',
          idProductor: permiso.idProductor
            ? String(permiso.idProductor)
            : undefined,
          productor: permiso.idProductor
            ? nombreProductor.get(String(permiso.idProductor)) ||
              'Productor sin nombre'
            : undefined,
          idEstablecimiento: permiso.idEstablecimiento
            ? String(permiso.idEstablecimiento)
            : undefined,
          establecimiento: permiso.idEstablecimiento
            ? nombreEstablecimiento.get(String(permiso.idEstablecimiento)) ||
              'Establecimiento sin nombre'
            : undefined,
        })),
    );
    const hectareas = lotesGestionados.reduce(
      (total, lote) =>
        total + this.superficieAdministrativa(lote.ubicacion?.superficie),
      0,
    );
    const perfilCompleto = Boolean(
      asesor.datosProfesionales?.profesion &&
      asesor.datosProfesionales?.matricula &&
      asesor.ubicacionProfesional?.geojson?.coordinates?.length === 2,
    );
    const resumenAsesor: IDetalleAuditoriaAsesor['asesor'] = {
      id: idAsesor,
      username: asesor.username,
      nombre:
        asesor.datosPersonales?.nombre?.trim() ||
        asesor.username ||
        'Asesor sin nombre',
      email: asesor.datosPersonales?.email || asesor.email,
      telefono: asesor.datosPersonales?.telefono,
      activo: asesor.activo !== false,
      archivado: asesor.archivado === true,
      fechaArchivado: asesor.fechaArchivado,
      archivadoPor: asesor.archivadoPor,
      fechaCreacion: asesor.fechaCreacion,
      profesion: asesor.datosProfesionales?.profesion,
      especialidad: asesor.datosProfesionales?.especialidad,
      matricula: asesor.datosProfesionales?.matricula,
      consejoProfesional: asesor.datosProfesionales?.consejoProfesional,
      foto: asesor.datosProfesionales?.foto,
      direccion: asesor.ubicacionProfesional?.direccion,
      geojson: asesor.ubicacionProfesional?.geojson,
      radioInfluenciaKm: asesor.ubicacionProfesional?.radioInfluenciaKm,
      perfilCompleto,
      metricas: {
        productores: productoresGestionados.length,
        establecimientos: establecimientosGestionados.length,
        lotes: lotesGestionados.length,
        hectareas: this.redondearHectareas(hectareas),
        usuariosGestionados: new Set(
          usuariosGestionados.map((usuario) => usuario.id),
        ).size,
      },
    };

    return {
      actualizadoEn: new Date().toISOString(),
      asesor: resumenAsesor,
      productores: productoresGestionados
        .map((productor) => {
          const idProductor = String(productor._id);
          const establecimientosDelProductor =
            establecimientosGestionados.filter(
              (establecimiento) =>
                String(establecimiento.idProductor || '') === idProductor,
            );
          const idsEstablecimientosDelProductor = new Set(
            establecimientosDelProductor.map((item) => String(item._id)),
          );
          const lotesDelProductor = lotesGestionados.filter((lote) =>
            idsEstablecimientosDelProductor.has(
              String(lote.idEstablecimiento || ''),
            ),
          );
          return {
            id: idProductor,
            nombre: productor.nombre || 'Productor sin nombre',
            establecimientos: establecimientosDelProductor.length,
            lotes: lotesDelProductor.length,
            hectareas: this.redondearHectareas(
              lotesDelProductor.reduce(
                (total, lote) =>
                  total +
                  this.superficieAdministrativa(lote.ubicacion?.superficie),
                0,
              ),
            ),
            usuariosGestionados: new Set(
              usuariosGestionados
                .filter((usuario) => usuario.idProductor === idProductor)
                .map((usuario) => usuario.id),
            ).size,
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      establecimientos: establecimientosGestionados
        .map((establecimiento) => {
          const idEstablecimiento = String(establecimiento._id);
          const lotesDelEstablecimiento = lotesGestionados.filter(
            (lote) =>
              String(lote.idEstablecimiento || '') === idEstablecimiento,
          );
          return {
            id: idEstablecimiento,
            nombre: establecimiento.nombre || 'Establecimiento sin nombre',
            productor: nombreProductor.get(
              String(establecimiento.idProductor || ''),
            ),
            origen:
              String(establecimiento.idAsesorPropietario || '') === idAsesor
                ? ('Propio' as const)
                : ('Asignado' as const),
            lotes: lotesDelEstablecimiento.length,
            hectareas: this.redondearHectareas(
              lotesDelEstablecimiento.reduce(
                (total, lote) =>
                  total +
                  this.superficieAdministrativa(lote.ubicacion?.superficie),
                0,
              ),
            ),
            usuariosGestionados: new Set(
              usuariosGestionados
                .filter(
                  (usuario) => usuario.idEstablecimiento === idEstablecimiento,
                )
                .map((usuario) => usuario.id),
            ).size,
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      lotes: lotesGestionados
        .map((lote) => ({
          id: String(lote._id),
          nombre: lote.nombre || 'Lote sin nombre',
          idEstablecimiento: String(lote.idEstablecimiento || ''),
          establecimiento:
            nombreEstablecimiento.get(String(lote.idEstablecimiento || '')) ||
            'Establecimiento sin nombre',
          hectareas: this.redondearHectareas(
            this.superficieAdministrativa(lote.ubicacion?.superficie),
          ),
        }))
        .sort(
          (a, b) =>
            a.establecimiento.localeCompare(b.establecimiento, 'es') ||
            a.nombre.localeCompare(b.nombre, 'es'),
        ),
      usuarios: usuariosGestionados.sort(
        (a, b) =>
          a.establecimiento.localeCompare(b.establecimiento, 'es') ||
          a.nombre.localeCompare(b.nombre, 'es'),
      ),
    };
  }

  async create(
    data: ICreateUsuario,
    permiso: IPermiso,
    actor?: IUsuario,
  ): Promise<IUsuario> {
    if (!data.password) {
      throw new BadRequestException('La contraseña es obligatoria');
    }
    data.username = await this.validarUsernameDisponible(data.username);
    await this.validarPermisosAsignados(data.permisos, permiso);
    this.limitarPerfilProfesionalAlAsesor(data, data.permisos);
    this.validarFotoProfesional(data.datosProfesionales?.foto);
    this.validarPerfilAsesor(data);
    this.validarPassword(data.password);
    data.hash = await this.hashClave(data.password);
    delete data.password;
    data.creadoPorUsuario = actor?._id;
    return await this.repository.create(data);
  }

  async crearFront(data: ICreateUsuario): Promise<IUsuario> {
    data.username = await this.validarUsernameDisponible(data.username);
    this.validarPassword(data.password);
    data.hash = await this.hashClave(data.password);
    delete data.password;
    // Default a una quimica y distribuidora
    // "65f044fe3584e3c22061f786" Chamán Química
    // "67ebecf924d876504503a647" Chamán Distribuidora
    const createProductor: ICreateProductor = {
      idDistribuidor: '67ebecf924d876504503a647',
      idQuimica: '65f044fe3584e3c22061f786',
      nombre: data.username,
      gratis: true,
    };
    const productor =
      await this.productorService.createInternal(createProductor);
    const permisos: IPermiso[] = [
      {
        nivel: 'Productor',
        idProductor: productor._id,
        idQuimica: '65f044fe3584e3c22061f786',
        idDistribuidor: '67ebecf924d876504503a647',
        rol: 'Admin',
      },
    ];
    data.permisos = permisos;
    data.activo = true;
    this.limitarPerfilProfesionalAlAsesor(data, permisos);
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: IUpdateUsuario,
    permiso: IPermiso,
    actor?: IUsuario,
  ): Promise<IUsuario> {
    const actual = await this.getById(id, permiso);
    this.validarAdministracionUsuario(actual, permiso, actor);
    if (data.username !== undefined) {
      data.username = await this.validarUsernameDisponible(data.username, id);
    }
    if (data.permisos) {
      await this.validarPermisosAsignados(data.permisos, permiso);
    }
    this.limitarPerfilProfesionalAlAsesor(
      data,
      data.permisos || actual.permisos,
    );
    this.validarFotoProfesional(data.datosProfesionales?.foto);
    this.validarPerfilAsesor({ ...actual, ...data });
    if (data.password) {
      this.validarPassword(data.password);
      data.hash = await this.hashClave(data.password);
      delete data.password;
    }
    const result = await this.repository.update(id, data);
    if (
      data.password ||
      data.activo === false ||
      data.permisos !== undefined ||
      data.username !== undefined
    ) {
      await this.authenticationService.revokeUserSessions(id);
    }
    return result;
  }

  async delete(
    id: string,
    permiso: IPermiso,
    actor?: IUsuario,
  ): Promise<IUsuario> {
    const actual = await this.getById(id, permiso);
    if (actor?._id && String(actor._id) === String(actual._id)) {
      throw new BadRequestException(
        'No puede archivar su propio usuario mientras la sesion esta activa',
      );
    }
    const audit: ISolicitudArchivado = {
      archivadoPor:
        actor?.username || actor?._id || permiso.idAsesor || 'sistema',
      motivoArchivado: actual.permisos?.some((item) => item.nivel === 'Asesor')
        ? 'Asesor archivado desde la administracion de Chaman'
        : 'Usuario archivado desde la administracion de Chaman',
    };

    if (actual.permisos?.some((item) => item.nivel === 'Asesor')) {
      await this.archivarRecursosDirectosAsesor(id, actual.permisos, audit);
    }

    const result = await this.repository.delete(id, audit);
    await this.authenticationService.revokeUserSessions(id);
    return result;
  }

  private async archivarRecursosDirectosAsesor(
    idAsesor: string,
    _permisos: IPermiso[],
    audit: ISolicitudArchivado,
  ): Promise<void> {
    const filtroPropietario = JSON.stringify({ idAsesorPropietario: idAsesor });
    const productores = await this.productoresRepository.get({
      page: 0,
      limit: 0,
      filter: filtroPropietario,
      select: '_id',
    });
    const idsProductores = (productores.datos || []).map((item) =>
      String(item._id),
    );
    const establecimientos = await this.establecimientosRepository.get({
      page: 0,
      limit: 0,
      filter: JSON.stringify({
        $or: [
          { idAsesorPropietario: idAsesor },
          { idProductor: { $in: idsProductores } },
        ],
      }),
      select: '_id',
    });
    const idsEstablecimientos = (establecimientos.datos || []).map((item) =>
      String(item._id),
    );
    const lotes = await this.lotesRepository.get({
      page: 0,
      limit: 0,
      filter: JSON.stringify({
        $or: [
          { idAsesorPropietario: idAsesor },
          { idProductor: { $in: idsProductores } },
          { idEstablecimiento: { $in: idsEstablecimientos } },
        ],
      }),
      select: '_id',
    });
    const usuariosGestionados = await this.repository.get({
      page: 0,
      limit: 0,
      filter: JSON.stringify({
        $or: [
          {
            permisos: {
              $elemMatch: {
                nivel: 'Productor',
                idProductor: { $in: idsProductores },
              },
            },
          },
          {
            permisos: {
              $elemMatch: {
                nivel: 'Establecimiento',
                idEstablecimiento: { $in: idsEstablecimientos },
              },
            },
          },
        ],
      }),
      select: '_id permisos',
    });

    await Promise.all(
      (lotes.datos || []).map((item) =>
        this.lotesRepository.delete(String(item._id), audit),
      ),
    );
    await Promise.all(
      (establecimientos.datos || []).map((item) =>
        this.establecimientosRepository.delete(String(item._id), audit),
      ),
    );
    await Promise.all(
      (productores.datos || []).map((item) =>
        this.productoresRepository.delete(String(item._id), audit),
      ),
    );
    await Promise.all(
      (usuariosGestionados.datos || [])
        .filter((item) => String(item._id) !== String(idAsesor))
        .map(async (item) => {
          const idUsuario = String(item._id);
          const permisosRestantes = (item.permisos || []).filter(
            (permiso) =>
              !(
                (permiso.nivel === 'Productor' &&
                  !!permiso.idProductor &&
                  idsProductores.includes(String(permiso.idProductor))) ||
                (permiso.nivel === 'Establecimiento' &&
                  !!permiso.idEstablecimiento &&
                  idsEstablecimientos.includes(
                    String(permiso.idEstablecimiento),
                  ))
              ),
          );
          if (permisosRestantes.length) {
            await this.repository.update(idUsuario, {
              permisos: permisosRestantes,
            });
          } else {
            await this.repository.delete(idUsuario, audit);
          }
          await this.authenticationService.revokeUserSessions(idUsuario);
        }),
    );
  }

  async desactivar(id: string, permiso: IPermiso): Promise<IUsuario> {
    return await this.update(id, { activo: false }, permiso);
  }

  async activar(id: string, permiso: IPermiso): Promise<IUsuario> {
    return await this.update(id, { activo: true }, permiso);
  }

  async cambiarPassword(
    id: string,
    password: string,
    permiso: IPermiso,
  ): Promise<IUsuario> {
    // El hash se hacen en el metodo updateUsuario
    return await this.update(id, { password }, permiso);
  }

  async cambiarPasswordPropio(
    oldPassword: string,
    newPassword: string,
    permiso: IPermiso,
    user: IUsuario,
  ): Promise<IUsuario> {
    const res = await this.authenticationService.validatePassword(
      user.username,
      oldPassword,
    );
    if (!res.valid) {
      throw new BadRequestException('La contrasena actual es incorrecta');
    }
    // El hash se hacen en el metodo updateUsuario
    return await this.update(user._id, { password: newPassword }, permiso);
  }

  // Private

  private async validarUsernameDisponible(
    username?: string,
    excluirId?: string,
  ): Promise<string> {
    const normalizado = String(username || '')
      .trim()
      .toLowerCase();
    if (!normalizado) {
      throw new BadRequestException('El nombre de usuario es obligatorio');
    }
    const existentes = await this.repository.get({
      page: 0,
      limit: 1,
      select: '_id username',
      filter: JSON.stringify({ username: normalizado }),
    });
    const existente = existentes?.datos?.find(
      (usuario) => String(usuario._id) !== String(excluirId || ''),
    );
    if (existente) {
      throw new BadRequestException(
        `El usuario "${normalizado}" ya existe. Elegí otro nombre de acceso.`,
      );
    }
    return normalizado;
  }

  private limitarPerfilProfesionalAlAsesor(
    data: ICreateUsuario | IUpdateUsuario,
    permisos?: IPermiso[],
  ): void {
    if (permisos?.some((permiso) => permiso.nivel === 'Asesor')) return;
    delete data.datosProfesionales;
    delete data.ubicacionProfesional;
  }

  private superficieAdministrativa(valor: unknown): number {
    const superficie = Number(valor);
    return Number.isFinite(superficie) && superficie > 0 ? superficie : 0;
  }

  private redondearHectareas(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  private async hashClave(clave: string): Promise<string> {
    return await bcrypt.hash(clave, 10);
  }

  private validarPassword(password?: string): void {
    if (
      !password ||
      password.length < 8 ||
      /\s/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw new BadRequestException(this.passwordPolicyMessage);
    }
  }

  private puedeVer(data: IUsuario, permiso: IPermiso): boolean {
    if (!data?.permisos?.length) {
      return false;
    }
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Tenant') {
      return data.permisos.some(
        (p) =>
          !!p.idTenant &&
          String(p.idTenant) === String(permiso.idTenant || ''),
      );
    }
    if (permiso.nivel === 'Quimica') {
      return data.permisos.some((p) => p.idQuimica === permiso.idQuimica);
    }
    if (permiso.nivel === 'Distribuidor') {
      return data.permisos.some(
        (p) => p.idDistribuidor === permiso.idDistribuidor,
      );
    }
    if (permiso.nivel === 'Asesor') {
      if (
        permiso.idAsesor &&
        String(data._id) === String(permiso.idAsesor)
      ) {
        return true;
      }
      const establecimientos = establecimientosDelPermiso(permiso);
      return data.permisos.some(
        (p) =>
          (p.nivel === 'Productor' &&
            !!p.idProductor &&
            (permiso.idProductores || []).includes(String(p.idProductor))) ||
          (p.nivel === 'Establecimiento' &&
            !!p.idEstablecimiento &&
            establecimientos.includes(String(p.idEstablecimiento))),
      );
    }
    if (permiso.nivel === 'Productor') {
      return data.permisos.some((p) => p.idProductor === permiso.idProductor);
    }
    if (permiso.nivel === 'Establecimiento') {
      return data.permisos.some(
        (p) => p.idEstablecimiento === permiso.idEstablecimiento,
      );
    }
    return false;
  }

  private async validarPermisosAsignados(
    permisos: IPermiso[] | undefined,
    permisoActual: IPermiso,
  ): Promise<void> {
    if (!permisos?.length) {
      throw new BadRequestException('Debe asignar al menos un permiso');
    }
    const tenant = await this.tenantDelActor(permisoActual);
    for (const permiso of permisos) {
      if (tenant) {
        if (
          permiso.idTenant &&
          String(permiso.idTenant) !== String(tenant._id)
        ) {
          throw new ForbiddenException(
            'El permiso solicitado no pertenece al tenant de la sesion',
          );
        }
        // El tenant de destino se deriva de la sesion autenticada. No se
        // obliga al frontend a repetir un dato de seguridad que el servidor
        // ya conoce y puede establecer de forma canonica.
        permiso.idTenant = String(tenant._id);
      }
      if (
        permisoActual.nivel === 'Quimica' &&
        permiso.nivel === 'Asesor'
      ) {
        // Compañía y Asesor son ámbitos comerciales hermanos. La compañía
        // propietaria se deriva siempre de la sesión y nunca del navegador.
        permiso.idQuimica = permisoActual.idQuimica;
        delete permiso.idDistribuidor;
      }
      this.validarPermisoCompleto(permiso);
      await this.validarRelacionesPermiso(permiso, tenant);
      if (tenant) this.validarNivelOperativoTenant(permiso, tenant);
      const dentroDelAlcance =
        permisoActual.nivel === 'Asesor'
          ? await this.permisoGestionablePorAsesor(permiso, permisoActual)
          : this.permisoDentroDelAlcance(permiso, permisoActual);
      if (!dentroDelAlcance) {
        throw new BadRequestException(
          'No tiene permiso para asignar ese nivel de usuario',
        );
      }
      if (tenant) this.restringirModulosAlTenant(permiso, tenant);
    }
  }

  private async tenantDelActor(permiso: IPermiso): Promise<ITenant | undefined> {
    if (permiso.nivel !== 'Tenant') return undefined;
    if (!permiso.idTenant || !this.tenantsRepository) {
      throw new ForbiddenException('La sesion no tiene un tenant operativo');
    }
    const tenant = await this.tenantsRepository.getById(permiso.idTenant);
    if (!tenant?._id || tenant.estado !== 'activo' || tenant.archivado) {
      throw new ForbiddenException('El tenant no esta habilitado');
    }
    return tenant;
  }

  private restringirModulosAlTenant(permiso: IPermiso, tenant: ITenant): void {
    const solicitados = permiso.modulos || {};
    const noHabilitado = (Object.keys(solicitados) as ModuloPermiso[]).find(
      (modulo) => solicitados[modulo] === true && tenant.modulos?.[modulo] !== true,
    );
    if (noHabilitado) {
      throw new ForbiddenException(
        `El modulo ${noHabilitado} no esta habilitado para este tenant`,
      );
    }
    permiso.modulos = (Object.keys(tenant.modulos || {}) as ModuloPermiso[])
      .filter((modulo) => tenant.modulos?.[modulo] === true)
      .reduce(
        (resultado, modulo) => ({
          ...resultado,
          [modulo]: solicitados[modulo] === true,
        }),
        {},
      );
  }

  private validarPermisoCompleto(permiso: IPermiso): void {
    const nivelesValidos = [
      'Admin',
      'Tenant',
      'Quimica',
      'Distribuidor',
      'Asesor',
      'Productor',
      'Establecimiento',
    ];
    const rolesValidos = ['Admin', 'Lectura', 'Escritura'];
    if (!permiso?.nivel) {
      throw new BadRequestException('Debe indicar el nivel del permiso');
    }
    if (!nivelesValidos.includes(permiso.nivel)) {
      throw new BadRequestException('El nivel de permiso no es valido');
    }
    if (!permiso?.rol) {
      throw new BadRequestException('Debe indicar el rol del permiso');
    }
    if (!rolesValidos.includes(permiso.rol)) {
      throw new BadRequestException('El rol del permiso no es valido');
    }

    if (permiso.nivel === 'Admin' && permiso.rol !== 'Admin') {
      throw new BadRequestException(
        'El nivel Admin solo admite el rol Admin',
      );
    }

    if (permiso.nivel === 'Admin') {
      return;
    }
    if (permiso.nivel === 'Tenant' && !permiso.idTenant) {
      throw new BadRequestException('Debe indicar el tenant del permiso');
    }
    if (permiso.nivel === 'Quimica' && !permiso.idQuimica) {
      throw new BadRequestException('Debe indicar la quimica del permiso');
    }
    if (permiso.nivel === 'Distribuidor' && !permiso.idDistribuidor) {
      throw new BadRequestException('Debe indicar el distribuidor del permiso');
    }
    if (permiso.nivel === 'Productor' && !permiso.idProductor) {
      throw new BadRequestException('Debe indicar el productor del permiso');
    }
    if (permiso.nivel === 'Establecimiento' && !permiso.idEstablecimiento) {
      throw new BadRequestException(
        'Debe indicar el establecimiento del permiso',
      );
    }
  }

  private permisoDentroDelAlcance(
    permisoDestino: IPermiso,
    permisoActual: IPermiso,
  ): boolean {
    if (permisoActual.nivel === 'Admin') {
      return true;
    }
    if (permisoDestino.nivel === 'Admin') {
      return false;
    }
    if (permisoActual.nivel === 'Tenant') {
      return (
        permisoDestino.idTenant === permisoActual.idTenant &&
        ['Asesor', 'Productor'].includes(permisoDestino.nivel)
      );
    }
    if (permisoActual.nivel === 'Quimica') {
      return permisoDestino.idQuimica === permisoActual.idQuimica;
    }
    if (permisoActual.nivel === 'Distribuidor') {
      return (
        permisoDestino.idDistribuidor === permisoActual.idDistribuidor &&
        ['Distribuidor', 'Productor', 'Establecimiento'].includes(
          permisoDestino.nivel,
        )
      );
    }
    if (permisoActual.nivel === 'Asesor') {
      return (
        permisoDestino.nivel === 'Productor' &&
        !!permisoDestino.idProductor &&
        (permisoActual.idProductores || []).includes(
          String(permisoDestino.idProductor),
        )
      );
    }
    if (permisoActual.nivel === 'Productor') {
      return (
        permisoDestino.idProductor === permisoActual.idProductor &&
        ['Productor', 'Establecimiento'].includes(permisoDestino.nivel)
      );
    }
    if (permisoActual.nivel === 'Establecimiento') {
      return (
        permisoDestino.nivel === 'Establecimiento' &&
        permisoDestino.idEstablecimiento === permisoActual.idEstablecimiento
      );
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<any> = HelperService.filtroToObject(query.filter);
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Quimica') {
      $and.push({ 'permisos.idQuimica': permiso.idQuimica });
    }
    if (permiso.nivel === 'Tenant') {
      $and.push({ 'permisos.idTenant': permiso.idTenant });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ 'permisos.idDistribuidor': permiso.idDistribuidor });
    }
    if (permiso.nivel === 'Asesor') {
      $and.push({
        $or: [
          {
            permisos: {
              $elemMatch: {
                nivel: 'Productor',
                idProductor: { $in: permiso.idProductores || [] },
              },
            },
          },
          {
            permisos: {
              $elemMatch: {
                nivel: 'Establecimiento',
                idEstablecimiento: {
                  $in: establecimientosDelPermiso(permiso),
                },
              },
            },
          },
        ],
      });
    }
    if (permiso.nivel === 'Productor') {
      $and.push({ 'permisos.idProductor': permiso.idProductor });
    }
    if (permiso.nivel === 'Establecimiento') {
      $and.push({ 'permisos.idEstablecimiento': permiso.idEstablecimiento });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }

  private async validarRelacionesPermiso(
    permiso: IPermiso,
    tenantActor?: ITenant,
  ): Promise<void> {
    if (permiso.nivel === 'Distribuidor') {
      const distribuidor = await this.distribuidoresRepository.getById(
        permiso.idDistribuidor,
      );
      if (!distribuidor?._id) {
        throw new BadRequestException('El distribuidor asignado no existe');
      }
      permiso.idDistribuidor = String(distribuidor._id);
      permiso.idQuimica = distribuidor.idQuimica;
    }

    if (permiso.nivel === 'Productor') {
      const productor = await this.productoresRepository.getById(
        permiso.idProductor,
      );
      if (!productor?._id) {
        throw new BadRequestException('El productor asignado no existe');
      }
      permiso.idProductor = String(productor._id);
      permiso.idTenant = productor.idTenant || permiso.idTenant;
      permiso.idDistribuidor = productor.idDistribuidor;
      permiso.idQuimica = productor.idQuimica;
    }

    if (permiso.nivel === 'Establecimiento') {
      const establecimiento = await this.establecimientosRepository.getById(
        permiso.idEstablecimiento,
      );
      if (!establecimiento?._id) {
        throw new BadRequestException('El establecimiento asignado no existe');
      }
      permiso.idEstablecimiento = String(establecimiento._id);
      permiso.idTenant = establecimiento.idTenant || permiso.idTenant;
      permiso.idProductor = establecimiento.idProductor;
      permiso.idDistribuidor = establecimiento.idDistribuidor;
      permiso.idQuimica = establecimiento.idQuimica;
    }

    if (permiso.nivel === 'Asesor') {
      const idQuimicaSolicitada = permiso.idQuimica
        ? String(permiso.idQuimica)
        : undefined;
      let distribuidor = null;
      if (permiso.idDistribuidor) {
        distribuidor = await this.distribuidoresRepository.getById(
          permiso.idDistribuidor,
        );
        if (!distribuidor?._id) {
          throw new BadRequestException(
            'El distribuidor de referencia del asesor no existe',
          );
        }
        permiso.idDistribuidor = String(distribuidor._id);
      }
      if (tenantActor && distribuidor) {
        const raiz = tenantActor.entidadRaiz;
        const esDistribuidorRaiz =
          raiz?.tipo === 'Distribuidor' &&
          !!raiz.idEntidad &&
          String(raiz.idEntidad) === String(distribuidor._id);
        if (!esDistribuidorRaiz) {
          throw new ForbiddenException(
            'El distribuidor de referencia no pertenece al tenant de la sesion',
          );
        }
      }
      const establecimientosAsignados = permiso.idEstablecimientos || [];
      const establecimientos = await Promise.all(
        establecimientosAsignados.map((id) =>
          this.establecimientosRepository.getById(id),
        ),
      );
      if (establecimientos.some((e) => !e?._id)) {
        throw new BadRequestException(
          'Uno o mas establecimientos asignados al asesor no existen',
        );
      }
      if (
        tenantActor &&
        establecimientos.some(
          (establecimiento) =>
            String(establecimiento.idTenant || '') !==
            String(tenantActor._id || ''),
        )
      ) {
        throw new ForbiddenException(
          'Uno o mas establecimientos asignados no pertenecen al tenant de la sesion',
        );
      }
      if (
        distribuidor &&
        establecimientos.some(
          (e) => String(e.idDistribuidor) !== String(distribuidor._id),
        )
      ) {
        throw new BadRequestException(
          'Los establecimientos no pertenecen al distribuidor de referencia',
        );
      }
      permiso.idEstablecimientos = Array.from(
        new Set(establecimientos.map((e) => String(e._id))),
      );
      const quimicas = new Set(
        establecimientos
          .map((e) => e.idQuimica)
          .filter(Boolean)
          .map(String),
      );
      permiso.idQuimica =
        distribuidor?.idQuimica ||
        (quimicas.size === 1
          ? Array.from(quimicas)[0]
          : idQuimicaSolicitada);
      if (
        idQuimicaSolicitada &&
        permiso.idQuimica &&
        String(permiso.idQuimica) !== idQuimicaSolicitada
      ) {
        throw new BadRequestException(
          'El alcance del asesor no pertenece a la compania seleccionada',
        );
      }
      // Un Asesor administra todos los lotes de sus establecimientos. La
      // seleccion por lote corresponde a los usuarios que el Asesor delegue.
      permiso.idLotes = [];
    }

    if (permiso.idLotes?.length) {
      const lotes = await Promise.all(
        permiso.idLotes.map((id) => this.lotesRepository.getById(id)),
      );
      const establecimientosPermitidos =
        permiso.nivel === 'Asesor'
          ? permiso.idEstablecimientos
          : [permiso.idEstablecimiento].filter(Boolean);
      if (
        lotes.some(
          (lote) =>
            !establecimientosPermitidos.includes(
              String(lote.idEstablecimiento),
            ),
        )
      ) {
        throw new BadRequestException(
          'Uno o mas lotes no pertenecen a los establecimientos asignados',
        );
      }
      permiso.idLotes = Array.from(
        new Set(lotes.map((lote) => String(lote._id))),
      );
    }
  }

  private validarAdministracionUsuario(
    usuario: IUsuario,
    permiso: IPermiso,
    actor?: IUsuario,
  ): void {
    if (permiso.nivel !== 'Asesor') return;
    if (actor?._id && String(actor._id) === String(usuario._id)) return;
    if (usuario.permisos?.some((p) => p.nivel !== 'Productor')) {
      throw new BadRequestException(
        'El asesor solo puede administrar usuarios productores de su red',
      );
    }
  }

  private async permisoGestionablePorAsesor(
    permisoDestino: IPermiso,
    permisoActual: IPermiso,
  ): Promise<boolean> {
    if (
      permisoDestino.nivel !== 'Productor' ||
      !permisoDestino.idProductor ||
      !permisoActual.idAsesor
    ) {
      return false;
    }
    const productor = await this.productoresRepository.getById(
      permisoDestino.idProductor,
    );
    return (
      !!productor?._id &&
      String(productor.idAsesorPropietario || '') ===
        String(permisoActual.idAsesor)
    );
  }

  private validarFotoProfesional(foto?: string): void {
    if (!foto) return;
    const match =
      /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(foto);
    if (!match) {
      throw new BadRequestException('La foto debe ser PNG, JPEG o WebP');
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 1024 * 1024) {
      throw new BadRequestException(
        'La foto profesional no puede superar 1 MB',
      );
    }
    const mime = match[1];
    const esPng = buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const esJpeg =
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const esWebp =
      buffer.subarray(0, 4).toString() === 'RIFF' &&
      buffer.subarray(8, 12).toString() === 'WEBP';
    if (
      (mime === 'image/png' && !esPng) ||
      (mime === 'image/jpeg' && !esJpeg) ||
      (mime === 'image/webp' && !esWebp)
    ) {
      throw new BadRequestException(
        'La firma binaria de la foto no coincide con su formato',
      );
    }
  }

  private validarNivelOperativoTenant(
    permiso: IPermiso,
    tenant: ITenant,
  ): void {
    if (String(permiso.idTenant || '') !== String(tenant._id || '')) {
      throw new ForbiddenException(
        'El permiso solicitado no pertenece al tenant de la sesion',
      );
    }
    if (permiso.nivel === 'Asesor') {
      if (tenant.capacidades?.administrarAsesores !== true) {
        throw new ForbiddenException(
          'El tenant no tiene habilitada la administracion de asesores',
        );
      }
      return;
    }
    if (permiso.nivel === 'Productor') {
      if (tenant.capacidades?.administrarProductores !== true) {
        throw new ForbiddenException(
          'El tenant no tiene habilitada la administracion de productores',
        );
      }
      return;
    }
    throw new ForbiddenException(
      'El administrador del tenant solo puede crear asesores y productores',
    );
  }

  private validarPerfilAsesor(data: Partial<IUsuario>): void {
    if (!data.permisos?.some((p) => p.nivel === 'Asesor')) return;
    const ubicacion = data.ubicacionProfesional;
    const coordinates = ubicacion?.geojson?.coordinates;
    const radio = Number(ubicacion?.radioInfluenciaKm);
    const tieneDireccion = Boolean(ubicacion?.direccion?.trim());
    const tieneCoordenadas =
      Array.isArray(coordinates) && coordinates.length > 0;

    // La cobertura profesional enriquece el mapa, pero un proveedor externo
    // de geocodificacion nunca debe impedir el alta del asesor. Si se informa
    // una ubicacion, en cambio, se exige que quede completa y coherente.
    if (!tieneDireccion && !tieneCoordenadas) return;
    if (
      !tieneDireccion ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !coordinates.every(Number.isFinite)
    ) {
      throw new BadRequestException(
        'El asesor requiere un domicilio profesional georreferenciado',
      );
    }
    if (!Number.isFinite(radio) || radio < 1 || radio > 1000) {
      throw new BadRequestException(
        'El radio de influencia del asesor debe estar entre 1 y 1000 km',
      );
    }
  }
}
