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
    return dispositivo;
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
    return dispositivo;
  }

  async assertPuedeVerPorIdentificador(
    identificador: string,
    user: IUsuario,
    modulo?: ModuloPermiso,
  ): Promise<IDispositivo> {
    const dispositivo = await this.getByIdentificador(
      identificador,
      user,
      modulo,
    );
    if (!dispositivo) {
      throw new ForbiddenException(
        'No tiene permiso para ver este dispositivo',
      );
    }
    return dispositivo;
  }

  async get(
    filtro: IQueryParam,
    user: IUsuario,
  ): Promise<IListado<IDispositivo>> {
    this.agregarFiltroPermisos(filtro, user);
    return await this.repository.get(filtro);
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
      $or.push({ idProductor: { $in: productoresUsuario } });
    }
    if (establecimientosUsuario.length > 0) {
      $or.push({ idEstablecimiento: { $in: establecimientosUsuario } });
    }
    for (const asesor of asesoresUsuario) {
      const alcance: any = {
        idEstablecimiento: { $in: establecimientosDelPermiso(asesor) },
      };
      if (asesor.idLotes?.length) alcance.idLote = { $in: asesor.idLotes };
      $or.push(alcance);
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
