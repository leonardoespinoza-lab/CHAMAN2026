import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import {
  IDispositivo,
  IListado,
  IQueryParam,
  ICreateDispositivo,
  IUpdateDispositivo,
  IUsuario,
  ModuloPermiso,
  IPermiso,
  serviciosDispositivoNormalizados,
  IServicioDispositivo,
  SensoresV2,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { establecimientosDelPermiso } from '../../auxiliares/authorization/alcance-permiso';
import { DispositivosRepository } from './repository';
import {
  DecisionPipelineQueueService,
  DecisionTrigger,
} from '../../auxiliares/decision-pipeline';

const DEVICE_SCIENCE_FIELDS = [
  'idLote',
  'idEstablecimiento',
  'fechaAsignacionLote',
  'historialAsignacionesLote',
  'tipo',
  'sensores',
  'calificacionMeteorologica',
  'geojson',
  'servicios',
] as const;

@Injectable()
export class DispositivosService {
  constructor(
    private repository: DispositivosRepository,
    @Optional()
    private readonly decisionPipelineQueue?: DecisionPipelineQueueService,
  ) {}

  async getById(
    id: string,
    user?: IUsuario,
    modulo?: ModuloPermiso,
  ): Promise<IDispositivo> {
    const dispositivo = await this.repository.getById(id);
    if (user && !this.puedeVer(dispositivo, user, modulo)) {
      throw new ForbiddenException(
        'No tiene permiso para ver este dispositivo',
      );
    }
    return user
      ? this.filtrarParaUsuario(dispositivo, user, modulo)
      : dispositivo;
  }

  async assertPuedeVer(
    id: string,
    user: IUsuario,
    modulo?: ModuloPermiso,
  ): Promise<IDispositivo> {
    return await this.getById(id, user, modulo);
  }

  async getByIdentificador(
    identificador: string,
    user?: IUsuario,
    modulo?: ModuloPermiso,
  ): Promise<IDispositivo | undefined> {
    const dispositivo = await this.resolverDispositivo(identificador);
    if (user && !this.puedeVer(dispositivo, user, modulo)) {
      throw new ForbiddenException(
        'No tiene permiso para ver este dispositivo',
      );
    }
    return user && dispositivo
      ? this.filtrarParaUsuario(dispositivo, user, modulo)
      : dispositivo;
  }

  async assertPuedeVerPorIdentificador(
    identificador: string,
    user: IUsuario,
    modulo?: ModuloPermiso,
  ): Promise<IDispositivo> {
    const contexto = await this.contextoAutorizadoPorIdentificador(
      identificador,
      user,
      modulo,
    );
    return contexto.visible;
  }

  /**
   * Contexto interno para proyectar evidencia historica de un controlador
   * multi-servicio. `fisico` nunca debe serializarse al usuario: conserva el
   * inventario completo solo para detectar servicios ocultos o ambiguos.
   */
  async contextoAutorizadoPorIdentificador(
    identificador: string,
    user: IUsuario,
    modulo?: ModuloPermiso,
  ): Promise<{ fisico: IDispositivo; visible: IDispositivo }> {
    const fisico = await this.resolverDispositivo(identificador);
    if (!fisico || !this.puedeVer(fisico, user, modulo)) {
      throw new ForbiddenException(
        'No tiene permiso para ver este dispositivo',
      );
    }
    return {
      fisico,
      visible: this.filtrarParaUsuario(fisico, user, modulo),
    };
  }

  async get(
    filtro: IQueryParam,
    user: IUsuario,
  ): Promise<IListado<IDispositivo>> {
    this.agregarFiltroPermisos(filtro, user);
    const listado = await this.repository.get(filtro);
    return {
      ...listado,
      datos: listado.datos.map((dispositivo) =>
        this.filtrarParaUsuario(dispositivo, user),
      ),
    };
  }

  async create(data: ICreateDispositivo): Promise<IDispositivo> {
    const created = await this.repository.create(data);
    await this.enqueueDeviceScopes(
      'dispositivo.created',
      Object.keys(data || {}),
      created,
    );
    return created;
  }

  async update(id: string, data: IUpdateDispositivo): Promise<IDispositivo> {
    const changedFields = DEVICE_SCIENCE_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(data, field),
    );
    const previous = changedFields.length
      ? await this.repository.getById(id)
      : undefined;
    const updated = await this.repository.update(id, data);
    if (changedFields.length) {
      await this.enqueueDeviceScopes(
        'dispositivo.updated',
        [...changedFields],
        previous,
        updated,
      );
    }
    return updated;
  }

  async delete(id: string): Promise<IDispositivo> {
    const previous = await this.repository.getById(id);
    const deleted = await this.repository.delete(id);
    await this.enqueueDeviceScopes(
      'dispositivo.deleted',
      ['idLote', 'idEstablecimiento'],
      previous,
    );
    return deleted;
  }

  // Private

  private async enqueueDeviceScopes(
    trigger: DecisionTrigger,
    changedFields: string[],
    ...devices: Array<IDispositivo | undefined>
  ): Promise<void> {
    if (!this.decisionPipelineQueue) return;
    const scopes = new Map<'lote' | 'establecimiento', Set<string>>([
      ['lote', new Set<string>()],
      ['establecimiento', new Set<string>()],
    ]);
    for (const device of devices) {
      const idLote = String(device?.idLote || '').trim();
      const idEstablecimiento = String(device?.idEstablecimiento || '').trim();
      if (idLote) scopes.get('lote')!.add(idLote);
      else if (idEstablecimiento) {
        scopes.get('establecimiento')!.add(idEstablecimiento);
      }
      for (const servicio of serviciosDispositivoNormalizados(device)) {
        const loteServicio = String(servicio.idLote || '').trim();
        const establecimientoServicio = String(
          servicio.idEstablecimiento || '',
        ).trim();
        if (loteServicio) scopes.get('lote')!.add(loteServicio);
        else if (establecimientoServicio) {
          scopes.get('establecimiento')!.add(establecimientoServicio);
        }
      }
    }
    for (const idLote of scopes.get('lote')!) {
      await this.decisionPipelineQueue.enqueueForLot(idLote, {
        trigger,
        changedFields,
        sincronizarClima: false,
      });
    }
    for (const idEstablecimiento of scopes.get('establecimiento')!) {
      await this.decisionPipelineQueue.enqueueForEstablishment(
        idEstablecimiento,
        {
          trigger,
          changedFields,
          sincronizarClima: false,
        },
      );
    }
  }

  private async resolverDispositivo(
    identificador: string,
  ): Promise<IDispositivo | undefined> {
    if (!identificador) {
      return undefined;
    }

    if (this.esObjectId(identificador)) {
      try {
        return await this.repository.getById(identificador);
      } catch {
        // El identificador tambien puede ser un devEUI con forma no ObjectId.
      }
    }

    const variantesDevEui = Array.from(
      new Set(
        [
          identificador,
          identificador.toUpperCase(),
          identificador.toLowerCase(),
        ].filter(Boolean),
      ),
    );

    const response = await this.repository.get({
      filter: JSON.stringify({
        $or: variantesDevEui.map((deveui) => ({ deveui })),
      }),
      limit: 1,
    });

    return response.datos?.[0];
  }

  private esObjectId(value: string): boolean {
    return /^[a-f\d]{24}$/i.test(value);
  }

  puedeVer(
    dispositivo: IDispositivo | undefined,
    user: IUsuario,
    modulo?: ModuloPermiso,
  ): boolean {
    if (!dispositivo || !user?.permisos?.length) {
      return false;
    }

    return user.permisos.some((permiso) => {
      if (!this.puedeVerModulo(permiso, modulo)) {
        return false;
      }
      if (permiso.nivel === 'Admin') {
        return true;
      }
      if (this.serviciosVisibles(dispositivo, permiso).length) {
        return true;
      }
      if (permiso.nivel === 'Quimica') {
        return (
          !!permiso.idQuimica && permiso.idQuimica === dispositivo.idQuimica
        );
      }
      if (permiso.nivel === 'Distribuidor') {
        return (
          !!permiso.idDistribuidor &&
          permiso.idDistribuidor === dispositivo.idDistribuidor
        );
      }
      if (permiso.nivel === 'Productor') {
        return (
          !!permiso.idProductor &&
          permiso.idProductor === dispositivo.idProductor
        );
      }
      if (permiso.nivel === 'Establecimiento') {
        return (
          !!permiso.idEstablecimiento &&
          permiso.idEstablecimiento === dispositivo.idEstablecimiento
        );
      }
      if (permiso.nivel === 'Asesor') {
        return (
          establecimientosDelPermiso(permiso).includes(
            String(dispositivo.idEstablecimiento),
          ) &&
          (!permiso.idLotes?.length ||
            permiso.idLotes.includes(String(dispositivo.idLote)))
        );
      }
      return false;
    });
  }

  private serviciosVisibles(
    dispositivo: IDispositivo,
    permiso: IPermiso,
  ): IServicioDispositivo[] {
    return serviciosDispositivoNormalizados(dispositivo).filter((servicio) => {
      if (permiso.nivel === 'Admin') return true;
      if (permiso.nivel === 'Quimica') {
        return (
          !!permiso.idQuimica && permiso.idQuimica === dispositivo.idQuimica
        );
      }
      if (permiso.nivel === 'Distribuidor') {
        return (
          !!permiso.idDistribuidor &&
          permiso.idDistribuidor === dispositivo.idDistribuidor
        );
      }
      if (permiso.nivel === 'Productor') {
        return (
          !!permiso.idProductor && permiso.idProductor === servicio.idProductor
        );
      }
      if (permiso.nivel === 'Establecimiento') {
        return (
          !!permiso.idEstablecimiento &&
          permiso.idEstablecimiento === servicio.idEstablecimiento
        );
      }
      if (permiso.nivel === 'Asesor') {
        return (
          establecimientosDelPermiso(permiso).includes(
            String(servicio.idEstablecimiento),
          ) &&
          (!permiso.idLotes?.length ||
            permiso.idLotes.includes(String(servicio.idLote)))
        );
      }
      return false;
    });
  }

  private filtrarParaUsuario(
    dispositivo: IDispositivo,
    user: IUsuario,
    modulo?: ModuloPermiso,
  ): IDispositivo {
    if (user.permisos?.some((permiso) => permiso.nivel === 'Admin')) {
      return dispositivo;
    }
    const servicios = new Map<string, IServicioDispositivo>();
    user.permisos
      .filter((permiso) => this.puedeVerModulo(permiso, modulo))
      .flatMap((permiso) => this.serviciosVisibles(dispositivo, permiso))
      .forEach((servicio) => servicios.set(servicio.id, servicio));
    const visibles = [...servicios.values()];
    const tieneServiciosExplicitos = Array.isArray(dispositivo.servicios);
    const sensoresPermitidos = new Set<SensoresV2>(['Batería']);
    visibles.forEach((servicio) =>
      servicio.sensores.forEach((sensor) => sensoresPermitidos.add(sensor)),
    );
    const valores = dispositivo.ultimoReporte?.datos?.valores || {};
    const tiposVisibles = new Set(visibles.map((servicio) => servicio.tipo));
    const configuracionLecturas = dispositivo.configuracionLecturas
      ? {
          perfilSuelo: tiposVisibles.has('perfil_suelo')
            ? dispositivo.configuracionLecturas.perfilSuelo
            : undefined,
          entradaAnalogica: tiposVisibles.has('nivel_napa')
            ? dispositivo.configuracionLecturas.entradaAnalogica
            : undefined,
        }
      : undefined;
    return {
      ...dispositivo,
      // Un controlador puede alimentar lotes o clientes distintos. Cuando ya
      // tiene servicios explícitos, las relaciones globales legacy no deben
      // revelar el otro destino al consumidor del servicio filtrado.
      ...(tieneServiciosExplicitos
        ? {
            idProductor: undefined,
            idEstablecimiento: undefined,
            idLote: undefined,
            productor: undefined,
            establecimiento: undefined,
            lote: undefined,
          }
        : {}),
      servicios: visibles,
      sensores: (dispositivo.sensores || []).filter((sensor) =>
        sensoresPermitidos.has(sensor),
      ),
      configuracionLecturas,
      ultimoReporte: dispositivo.ultimoReporte
        ? {
            ...dispositivo.ultimoReporte,
            datos: {
              valores: Object.fromEntries(
                Object.entries(valores).filter(([sensor]) =>
                  sensoresPermitidos.has(sensor as SensoresV2),
                ),
              ),
            },
          }
        : undefined,
    };
  }

  private puedeVerModulo(permiso: IPermiso, modulo?: ModuloPermiso): boolean {
    if (!modulo || !permiso.modulos) {
      return true;
    }
    return permiso.modulos[modulo] !== false;
  }

  private agregarFiltroPermisos(params: IQueryParam, user: IUsuario) {
    const filtro = HelperService.filtroToObject(params.filter);
    const $and = filtro.$and || [];
    const $or = [];

    if (user.permisos?.some((p) => p.nivel === 'Admin')) {
      return;
    }

    const quimicasUsuario = user.permisos
      .filter((p) => p.nivel === 'Quimica' && p.idQuimica)
      .map((p) => p.idQuimica);
    const distribuidoresUsuario = user.permisos
      .filter((p) => p.nivel === 'Distribuidor' && p.idDistribuidor)
      .map((p) => p.idDistribuidor);
    const productoresUsuario = user.permisos
      .filter((p) => p.nivel === 'Productor' && p.idProductor)
      .map((p) => p.idProductor);
    const establecimientosUsuario = user.permisos
      .filter((p) => p.nivel === 'Establecimiento' && p.idEstablecimiento)
      .map((p) => p.idEstablecimiento);
    const asesoresUsuario = user.permisos.filter((p) => p.nivel === 'Asesor');

    if (quimicasUsuario.length > 0) {
      $or.push({ idQuimica: { $in: quimicasUsuario } });
    }
    if (distribuidoresUsuario.length > 0) {
      $or.push({ idDistribuidor: { $in: distribuidoresUsuario } });
    }
    if (productoresUsuario.length > 0) {
      $or.push(
        { idProductor: { $in: productoresUsuario } },
        { 'servicios.idProductor': { $in: productoresUsuario } },
      );
    }
    if (establecimientosUsuario.length > 0) {
      $or.push(
        { idEstablecimiento: { $in: establecimientosUsuario } },
        { 'servicios.idEstablecimiento': { $in: establecimientosUsuario } },
      );
    }
    for (const asesor of asesoresUsuario) {
      const alcance: any = {
        idEstablecimiento: { $in: establecimientosDelPermiso(asesor) },
      };
      if (asesor.idLotes?.length) alcance.idLote = { $in: asesor.idLotes };
      $or.push(alcance);
      const alcanceServicio: any = {
        'servicios.idEstablecimiento': {
          $in: establecimientosDelPermiso(asesor),
        },
      };
      if (asesor.idLotes?.length) {
        alcanceServicio['servicios.idLote'] = { $in: asesor.idLotes };
      }
      $or.push(alcanceServicio);
    }
    if ($or.length > 0) {
      $and.push({ $or });
    }
    if ($and.length > 0) {
      filtro.$and = $and;
      params.filter = JSON.stringify(filtro);
    }
  }
}
