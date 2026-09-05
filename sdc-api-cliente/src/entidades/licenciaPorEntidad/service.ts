import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoAsignacionLicencia,
  IAsignarLicenciaEntidad,
  ICreateLicenciaPorEntidad,
  IEstadoLicenciaEntidad,
  IHeredarLicenciaEntidad,
  ILicencia,
  ILicenciaPorEntidad,
  IListado,
  IPermiso,
  IQueryParam,
  IUpdateLicenciaPorEntidad,
  IUsuario,
  TipoEntidadLicencia,
} from 'modelos/src';
import { LicenciasService } from '../licencia/service';
import { LicenciaPorEntidadsRepository } from './repository';
import { LicenseUsageService } from './usage.service';

type CandidatoLicencia = {
  tipoEntidad: TipoEntidadLicencia;
  idEntidad?: string;
};

@Injectable()
export class LicenciaPorEntidadsService {
  constructor(
    private repository: LicenciaPorEntidadsRepository,
    private licencias: LicenciasService,
    private usage: LicenseUsageService,
  ) {}

  async getById(id: string): Promise<ILicenciaPorEntidad> {
    return await this.repository.getById(id);
  }

  /** Compatibilidad con consumidores existentes que resuelven una entidad directa. */
  async getLicenciaValidaByIdEntidad(id: string): Promise<ILicencia> {
    const directa = await this.getAsignacionVigente(id);
    if (directa?.licencia) return directa.licencia;
    return await this.getLicenciaDefault();
  }

  async getLicenciaDefaultPlan(): Promise<ILicencia> {
    return await this.getLicenciaDefault();
  }

  /**
   * Resuelve de lo mas especifico a lo mas general. La licencia nunca concede
   * permisos: solo describe prestaciones dentro del alcance ya autorizado.
   */
  async getLicenciaEfectivaPorPermiso(
    permiso?: IPermiso,
  ): Promise<ILicencia | null> {
    if (!permiso || permiso.nivel === 'Admin') return null;
    const estado = await this.getEstadoEfectivo(
      this.candidatosPorPermiso(permiso),
    );
    return estado.licencia || null;
  }

  async getEstadoActualPorPermiso(
    permiso: IPermiso,
  ): Promise<IEstadoLicenciaEntidad> {
    if (permiso.nivel === 'Admin') {
      return {
        tipoEntidad: 'Quimica',
        idEntidad: 'admin',
        origenEfectivo: 'sin_configurar',
        advertencias: [
          'El administrador global no esta limitado por una licencia comercial.',
        ],
      };
    }
    const estado = await this.getEstadoEfectivo(
      this.candidatosPorPermiso(permiso),
    );
    return await this.agregarUso(estado);
  }

  async getEstadoPorEntidad(
    tipoEntidad: TipoEntidadLicencia,
    idEntidad: string,
  ): Promise<IEstadoLicenciaEntidad> {
    this.validarTipoEntidad(tipoEntidad);
    if (!idEntidad)
      throw new BadRequestException('Falta la entidad de la licencia');
    const historial = await this.getHistorial(idEntidad);
    const asignacion = this.seleccionarVigente(historial);
    const licencia =
      asignacion?.licencia ||
      (asignacion?.idLicencia
        ? await this.licencias.getById(asignacion.idLicencia)
        : undefined);

    if (licencia) {
      return await this.agregarUso(
        this.armarEstado(
          tipoEntidad,
          idEntidad,
          licencia,
          asignacion,
          'directa',
          historial,
        ),
      );
    }
    const licenciaDefault = await this.getLicenciaDefault();
    return await this.agregarUso(
      this.armarEstado(
        tipoEntidad,
        idEntidad,
        licenciaDefault,
        undefined,
        'default',
        historial,
      ),
    );
  }

  async asignar(
    idEntidad: string,
    data: IAsignarLicenciaEntidad,
    usuario?: IUsuario,
  ): Promise<IEstadoLicenciaEntidad> {
    if (!idEntidad || !data.idLicencia || !data.tipoEntidad) {
      throw new BadRequestException(
        'Entidad, tipo y plan de licencia son obligatorios',
      );
    }
    if (
      data.modalidadComercial &&
      !['prueba', 'cortesia', 'suscripcion'].includes(data.modalidadComercial)
    ) {
      throw new BadRequestException('Modalidad comercial no valida');
    }
    this.validarTipoEntidad(data.tipoEntidad);
    const fechaInicio = data.fechaInicio
      ? new Date(data.fechaInicio)
      : new Date();
    const fechaExpiracion = data.fechaExpiracion
      ? new Date(data.fechaExpiracion)
      : undefined;
    if (Number.isNaN(fechaInicio.getTime()))
      throw new BadRequestException('Fecha de inicio invalida');
    if (fechaExpiracion && Number.isNaN(fechaExpiracion.getTime())) {
      throw new BadRequestException('Fecha de expiracion invalida');
    }
    if (fechaExpiracion && fechaExpiracion.getTime() <= fechaInicio.getTime()) {
      throw new BadRequestException(
        'La expiracion debe ser posterior al inicio',
      );
    }

    const licencia = await this.licencias.getById(data.idLicencia);
    if (!licencia?._id)
      throw new NotFoundException('No se encontro el plan de licencia');
    if (licencia.estado === 'archivado') {
      throw new BadRequestException('No se puede asignar un plan archivado');
    }

    const historial = await this.getHistorial(idEntidad);
    const anterior = this.seleccionarVigente(historial);
    const ahora = new Date().toISOString();
    const esProgramada = fechaInicio.getTime() > Date.now();
    const reemplazables = historial.filter((candidate) =>
      esProgramada
        ? candidate.estado === 'programada'
        : this.estadoReemplazable(candidate.estado),
    );
    for (const item of reemplazables) {
      if (!item._id) continue;
      await this.repository.update(item._id, {
        estado: 'reemplazada',
        fechaActualizacion: ahora,
      });
    }

    const estado: EstadoAsignacionLicencia = esProgramada
      ? 'programada'
      : 'activa';
    const asignacion = await this.repository.create({
      idEntidad,
      tipoEntidad: data.tipoEntidad,
      idLicencia: licencia._id,
      fechaInicio: fechaInicio.toISOString(),
      fechaExpiracion: fechaExpiracion?.toISOString(),
      fechaActualizacion: ahora,
      estado,
      origen: 'manual',
      motivoCambio: data.motivoCambio?.trim() || 'Asignacion administrativa',
      modalidadComercial: data.modalidadComercial,
      creadoPorUsuario: usuario?._id,
      idAsignacionAnterior: anterior?._id,
    });
    asignacion.licencia = licencia;
    return await this.agregarUso(
      this.armarEstado(
        data.tipoEntidad,
        idEntidad,
        licencia,
        asignacion,
        'directa',
        [asignacion, ...historial],
      ),
    );
  }

  async heredar(
    idEntidad: string,
    data: IHeredarLicenciaEntidad,
    usuario?: IUsuario,
  ): Promise<IEstadoLicenciaEntidad> {
    if (!idEntidad || !data.tipoEntidad) {
      throw new BadRequestException('Entidad y tipo son obligatorios');
    }
    this.validarTipoEntidad(data.tipoEntidad);
    const historial = await this.getHistorial(idEntidad);
    const ahora = new Date().toISOString();
    const vigentes = historial.filter((item) =>
      this.estadoReemplazable(item.estado),
    );
    for (const item of vigentes) {
      if (!item._id) continue;
      await this.repository.update(item._id, {
        estado: 'reemplazada',
        fechaActualizacion: ahora,
        motivoCambio:
          data.motivoCambio?.trim() ||
          `Retorno a herencia por ${usuario?._id || 'administracion'}`,
      });
    }
    return await this.getEstadoPorEntidad(data.tipoEntidad, idEntidad);
  }

  async get(
    _filtro: IQueryParam,
    _user: IUsuario,
  ): Promise<IListado<ILicenciaPorEntidad>> {
    // El controlador limita este inventario al administrador global.
    return await this.repository.get(_filtro);
  }

  async getInternal(
    filtro: IQueryParam,
  ): Promise<IListado<ILicenciaPorEntidad>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateLicenciaPorEntidad): Promise<ILicenciaPorEntidad> {
    const now = new Date().toISOString();
    return await this.repository.create({
      fechaInicio: data.fechaInicio || now,
      fechaActualizacion: now,
      estado: data.estado || 'activa',
      origen: data.origen || 'sistema',
      ...data,
    });
  }

  async update(
    id: string,
    data: IUpdateLicenciaPorEntidad,
  ): Promise<ILicenciaPorEntidad> {
    return await this.repository.update(id, {
      ...data,
      fechaActualizacion: new Date().toISOString(),
    });
  }

  async delete(id: string): Promise<ILicenciaPorEntidad> {
    return await this.repository.delete(id);
  }

  private async getEstadoEfectivo(
    candidatos: CandidatoLicencia[],
  ): Promise<IEstadoLicenciaEntidad> {
    const validos = candidatos.filter(
      (item): item is Required<CandidatoLicencia> => !!item.idEntidad,
    );
    for (let index = 0; index < validos.length; index += 1) {
      const candidato = validos[index];
      const asignacion = await this.getAsignacionVigente(candidato.idEntidad);
      if (!asignacion) continue;
      const licencia =
        asignacion.licencia ||
        (asignacion.idLicencia
          ? await this.licencias.getById(asignacion.idLicencia)
          : undefined);
      if (!licencia) continue;
      return this.armarEstado(
        validos[0]?.tipoEntidad || candidato.tipoEntidad,
        validos[0]?.idEntidad || candidato.idEntidad,
        licencia,
        asignacion,
        index === 0 ? 'directa' : 'heredada',
        undefined,
        candidato,
      );
    }

    const tipoEntidad = validos[0]?.tipoEntidad || 'Quimica';
    const idEntidad = validos[0]?.idEntidad || 'sin-entidad';
    const licenciaDefault = await this.getLicenciaDefault();
    return this.armarEstado(
      tipoEntidad,
      idEntidad,
      licenciaDefault,
      undefined,
      'default',
    );
  }

  private async getAsignacionVigente(
    idEntidad: string,
  ): Promise<ILicenciaPorEntidad | undefined> {
    return this.seleccionarVigente(await this.getHistorial(idEntidad));
  }

  private async getHistorial(
    idEntidad: string,
  ): Promise<ILicenciaPorEntidad[]> {
    const listado = await this.repository.get({
      page: 0,
      limit: 0,
      sort: '-fechaInicio -fechaCreacion',
      filter: JSON.stringify({ idEntidad }),
      populate: JSON.stringify({ path: 'licencia' }),
    });
    return listado?.datos || [];
  }

  private seleccionarVigente(
    historial: ILicenciaPorEntidad[],
  ): ILicenciaPorEntidad | undefined {
    const ahora = Date.now();
    return historial.find((item) => {
      if (!this.estadoVigente(item.estado)) return false;
      const inicio = item.fechaInicio || item.fechaCreacion;
      if (inicio && new Date(inicio).getTime() > ahora) return false;
      if (
        item.fechaExpiracion &&
        new Date(item.fechaExpiracion).getTime() < ahora
      )
        return false;
      return true;
    });
  }

  private estadoVigente(estado?: EstadoAsignacionLicencia): boolean {
    // Sin estado corresponde a registros legacy y se mantiene compatible.
    // Una asignacion programada pasa a ser elegible automaticamente cuando
    // llega fechaInicio; el filtro temporal se aplica en seleccionarVigente.
    return (
      !estado ||
      estado === 'activa' ||
      estado === 'gracia' ||
      estado === 'programada'
    );
  }

  private estadoReemplazable(estado?: EstadoAsignacionLicencia): boolean {
    return (
      !estado ||
      estado === 'activa' ||
      estado === 'gracia' ||
      estado === 'programada'
    );
  }

  private async getLicenciaDefault(): Promise<ILicencia> {
    const listado = await this.licencias.getInternal({
      page: 0,
      limit: 1,
      sort: 'fechaCreacion',
      filter: JSON.stringify({ default: true }),
    });
    const licencia = listado?.datos?.[0];
    if (licencia) return licencia;

    // Compatibilidad para instalaciones antiguas que crearon "Gratis" sin
    // marcarlo como default. No se inventa una asignacion ni se altera la base.
    const legacy = await this.licencias.getInternal({
      page: 0,
      limit: 0,
      sort: 'fechaCreacion',
    });
    const candidato = (legacy?.datos || []).find((item) =>
      ['gratis', 'free', 'base'].includes(
        String(item.nombre || '')
          .trim()
          .toLowerCase(),
      ),
    );
    if (candidato) return candidato;

    // El middleware debe mantener la aplicacion accesible aun si el catalogo
    // administrativo esta incompleto. Las altas exigiran un plan persistido.
    return {
      nombre: 'Base de contingencia',
      codigo: 'sistema_contingencia',
      version: 1,
      estado: 'activo',
      modeloFacturacion: 'sin_cargo',
      modoLimite: 'informativo',
      default: true,
      modulos: {
        Enfermedades: true,
        Riego: true,
        'Huella Hídrica': true,
        NDVI: true,
        Clima: true,
        'Etapas Fenológicas': true,
      },
    };
  }

  private candidatosPorPermiso(permiso: IPermiso): CandidatoLicencia[] {
    if (permiso.nivel === 'Quimica') {
      return [{ tipoEntidad: 'Quimica', idEntidad: permiso.idQuimica }];
    }
    if (permiso.nivel === 'Distribuidor') {
      return [
        { tipoEntidad: 'Distribuidor', idEntidad: permiso.idDistribuidor },
        { tipoEntidad: 'Quimica', idEntidad: permiso.idQuimica },
      ];
    }
    if (permiso.nivel === 'Productor') {
      return [
        { tipoEntidad: 'Productor', idEntidad: permiso.idProductor },
        { tipoEntidad: 'Distribuidor', idEntidad: permiso.idDistribuidor },
        { tipoEntidad: 'Quimica', idEntidad: permiso.idQuimica },
      ];
    }
    if (permiso.nivel === 'Establecimiento') {
      return [
        {
          tipoEntidad: 'Establecimiento',
          idEntidad: permiso.idEstablecimiento,
        },
        { tipoEntidad: 'Productor', idEntidad: permiso.idProductor },
        { tipoEntidad: 'Distribuidor', idEntidad: permiso.idDistribuidor },
        { tipoEntidad: 'Quimica', idEntidad: permiso.idQuimica },
      ];
    }
    if (permiso.nivel === 'Asesor') {
      return [
        { tipoEntidad: 'Asesor', idEntidad: permiso.idAsesor },
        { tipoEntidad: 'Distribuidor', idEntidad: permiso.idDistribuidor },
        { tipoEntidad: 'Quimica', idEntidad: permiso.idQuimica },
      ];
    }
    return [];
  }

  private armarEstado(
    tipoEntidad: TipoEntidadLicencia,
    idEntidad: string,
    licencia: ILicencia,
    asignacion: ILicenciaPorEntidad | undefined,
    origenEfectivo: IEstadoLicenciaEntidad['origenEfectivo'],
    historial?: ILicenciaPorEntidad[],
    fuente?: CandidatoLicencia,
  ): IEstadoLicenciaEntidad {
    const advertencias: string[] = [];
    if (origenEfectivo === 'default')
      advertencias.push(
        'No hay asignacion vigente; se aplica el plan por defecto.',
      );
    if (origenEfectivo === 'heredada')
      advertencias.push(
        'La licencia se hereda de una entidad superior de la red.',
      );
    if (!licencia.codigo)
      advertencias.push(
        'Plan legacy sin codigo comercial; puede seguir operando, pero requiere catalogacion.',
      );
    let diasRestantes: number | undefined;
    if (asignacion?.fechaExpiracion) {
      diasRestantes = Math.max(
        0,
        Math.ceil(
          (new Date(asignacion.fechaExpiracion).getTime() - Date.now()) /
            86400000,
        ),
      );
    }
    return {
      tipoEntidad,
      idEntidad,
      licencia,
      asignacion,
      origenEfectivo,
      tipoEntidadFuente:
        fuente?.tipoEntidad ||
        (asignacion?.tipoEntidad as TipoEntidadLicencia | undefined),
      idEntidadFuente: fuente?.idEntidad || asignacion?.idEntidad,
      diasRestantes,
      advertencias,
      historial,
    };
  }

  /**
   * La medicion se ejecuta solo en endpoints administrativos de estado. Nunca
   * forma parte del middleware de autenticacion ni decide permisos.
   */
  private async agregarUso(
    estado: IEstadoLicenciaEntidad,
  ): Promise<IEstadoLicenciaEntidad> {
    if (!estado.licencia || estado.idEntidad === 'admin') return estado;
    try {
      estado.uso = await this.usage.medir(
        estado.tipoEntidad,
        estado.idEntidad,
        estado.licencia,
      );
    } catch (_error) {
      estado.advertencias.push(
        'No fue posible medir el consumo actual. La asignacion sigue vigente; el dato comercial requiere reintento.',
      );
    }
    return estado;
  }

  private validarTipoEntidad(
    tipo: string,
  ): asserts tipo is TipoEntidadLicencia {
    const tipos: TipoEntidadLicencia[] = [
      'Quimica',
      'Distribuidor',
      'Productor',
      'Establecimiento',
      'Asesor',
    ];
    if (!tipos.includes(tipo as TipoEntidadLicencia)) {
      throw new BadRequestException('Tipo de entidad de licencia no valido');
    }
  }
}
