import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ICalificacionSensorMeteorologico,
  ICalificacionVariableMeteorologica,
  IConfiguracionEntradaAnalogica,
  ICreateDispositivo,
  IDispositivo,
  IIntervaloCalibracionMeteorologica,
  ILorawanUplink,
  ILorawanDeviceCatalogItem,
  IQueryParam,
  IUpdateDispositivo,
  VariableCalibracionMeteorologica,
} from 'modelos/src';
import { DispositivosRepository } from './repository';

@Injectable()
export class DispositivosService {
  constructor(private repository: DispositivosRepository) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateDispositivo) {
    const normalized = this.prepararConfiguracionLecturas(
      this.prepararCalificacionMeteorologica(dato),
    );
    this.validarCalificacionMeteorologica(normalized);
    this.validarConfiguracionLecturas(normalized);
    return await this.repository.create(normalized);
  }

  async upsertFromLorawanUplink(uplink: ILorawanUplink) {
    return await this.repository.upsertFromLorawanUplink(uplink);
  }

  async syncFromLorawanCatalog(items: ILorawanDeviceCatalogItem[]) {
    if (!Array.isArray(items) || items.length > 5000) {
      throw new BadRequestException('El inventario ChirpStack no es valido.');
    }
    return await this.repository.syncFromLorawanCatalog(items);
  }

  async update(id: string, dato: IUpdateDispositivo) {
    const hasQualification = Object.prototype.hasOwnProperty.call(
      dato,
      'calificacionMeteorologica',
    );
    const hasReadingConfiguration = Object.prototype.hasOwnProperty.call(
      dato,
      'configuracionLecturas',
    );
    const hasAnalogConfiguration = Boolean(
      dato.configuracionLecturas &&
      Object.prototype.hasOwnProperty.call(
        dato.configuracionLecturas,
        'entradaAnalogica',
      ),
    );
    const current =
      hasQualification || hasReadingConfiguration
        ? await this.repository.getById(id)
        : undefined;
    if ((hasQualification || hasReadingConfiguration) && !current) {
      throw new NotFoundException('No encontrado');
    }
    const normalized = this.prepararConfiguracionLecturas(
      this.prepararCalificacionMeteorologica(dato, current),
      current,
    );
    this.validarCalificacionMeteorologica(normalized);
    if (hasAnalogConfiguration) {
      this.validarConfiguracionLecturas(normalized);
    }
    const updated = await this.repository.update(id, normalized);
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  private prepararCalificacionMeteorologica<
    T extends ICreateDispositivo | IUpdateDispositivo,
  >(dato: T, current?: Partial<IDispositivo>): T {
    if (
      !Object.prototype.hasOwnProperty.call(
        dato,
        'calificacionMeteorologica',
      ) ||
      !dato.calificacionMeteorologica
    ) {
      return dato;
    }

    const previous = current?.calificacionMeteorologica;
    const incomingEditable = { ...dato.calificacionMeteorologica };
    delete incomingEditable.historialCalibraciones;
    const { humedadRelativa: incomingHumidity, ...incomingTemperature } =
      incomingEditable;
    const merged: ICalificacionSensorMeteorologico = {
      ...(previous || {}),
      ...incomingTemperature,
      ...(incomingHumidity
        ? {
            humedadRelativa: {
              ...(previous?.humedadRelativa || {}),
              ...incomingHumidity,
            },
          }
        : previous?.humedadRelativa
          ? { humedadRelativa: { ...previous.humedadRelativa } }
          : {}),
      historialCalibraciones: this.construirHistorialCalibraciones(previous, {
        ...(previous || {}),
        ...incomingTemperature,
        ...(incomingHumidity
          ? {
              humedadRelativa: {
                ...(previous?.humedadRelativa || {}),
                ...incomingHumidity,
              },
            }
          : previous?.humedadRelativa
            ? { humedadRelativa: { ...previous.humedadRelativa } }
            : {}),
      }),
    };

    return {
      ...dato,
      calificacionMeteorologica: merged,
    };
  }

  private prepararConfiguracionLecturas<
    T extends ICreateDispositivo | IUpdateDispositivo,
  >(dato: T, current?: Partial<IDispositivo>): T {
    if (
      !Object.prototype.hasOwnProperty.call(dato, 'configuracionLecturas') ||
      !dato.configuracionLecturas
    ) {
      return dato;
    }

    const incoming = dato.configuracionLecturas;
    const previous = current?.configuracionLecturas;
    const analogIncoming = incoming.entradaAnalogica;
    const analog = analogIncoming
      ? this.normalizarEntradaAnalogica({
          ...(previous?.entradaAnalogica || {}),
          ...analogIncoming,
        } as IConfiguracionEntradaAnalogica)
      : previous?.entradaAnalogica;

    return {
      ...dato,
      configuracionLecturas: {
        perfilSuelo: incoming.perfilSuelo || previous?.perfilSuelo,
        entradaAnalogica: analog,
      },
    };
  }

  private normalizarEntradaAnalogica(
    config: IConfiguracionEntradaAnalogica,
  ): IConfiguracionEntradaAnalogica {
    const variable = config.variable || 'sin_definir';
    const longitudCableM = this.numeroOpcional(config.longitudCableM);
    const tramoCableExteriorM = this.numeroOpcional(config.tramoCableExteriorM);
    const profundidadInformada = this.numeroOpcional(
      config.profundidadInstalacionM,
    );
    const profundidadDerivada =
      variable === 'nivel_napa' &&
      longitudCableM !== undefined &&
      tramoCableExteriorM !== undefined &&
      longitudCableM > tramoCableExteriorM
        ? Math.round((longitudCableM - tramoCableExteriorM) * 1000) / 1000
        : undefined;
    const normalized: IConfiguracionEntradaAnalogica = {
      ...config,
      canal: Number(config.canal) === 2 ? 2 : 1,
      tipoSenal: '4-20mA',
      variable,
      entradaMinMa: Number.isFinite(Number(config.entradaMinMa))
        ? Number(config.entradaMinMa)
        : 4,
      entradaMaxMa: Number.isFinite(Number(config.entradaMaxMa))
        ? Number(config.entradaMaxMa)
        : 20,
      salidaMin: this.numeroOpcional(config.salidaMin),
      salidaMax: this.numeroOpcional(config.salidaMax),
      unidadSalida: String(config.unidadSalida || '').trim() || undefined,
      profundidadInstalacionM: profundidadInformada ?? profundidadDerivada,
      longitudCableM,
      tramoCableExteriorM,
      fuenteCalibracion:
        String(config.fuenteCalibracion || '').trim() || undefined,
      observaciones: String(config.observaciones || '').trim() || undefined,
    };

    if (variable === 'nivel_napa') {
      normalized.versionConversion = 'lineal-4-20ma-v1';
      normalized.magnitudSalida = 'columna_agua_sobre_sensor';
      normalized.referenciaProfundidad = 'nivel_terreno';
    } else if (variable === 'presion_agua') {
      normalized.versionConversion = 'lineal-4-20ma-v1';
      normalized.magnitudSalida = 'presion_agua';
      normalized.referenciaProfundidad = undefined;
    } else {
      normalized.versionConversion = undefined;
      normalized.magnitudSalida = undefined;
      normalized.referenciaProfundidad = undefined;
    }

    return normalized;
  }

  private validarConfiguracionLecturas(
    dato: ICreateDispositivo | IUpdateDispositivo,
  ): void {
    const config = dato.configuracionLecturas?.entradaAnalogica;
    if (!config || config.variable === 'sin_definir') return;

    const faltantes: string[] = [];
    if (config.tipoSenal !== '4-20mA') {
      faltantes.push('tipo de senal 4-20 mA');
    }
    if (config.canal !== 1 && config.canal !== 2) {
      faltantes.push('canal analogico 1 o 2');
    }
    if (
      !Number.isFinite(config.entradaMinMa) ||
      !Number.isFinite(config.entradaMaxMa) ||
      config.entradaMaxMa <= config.entradaMinMa
    ) {
      faltantes.push('rango electrico creciente');
    }
    if (
      !Number.isFinite(config.salidaMin) ||
      !Number.isFinite(config.salidaMax) ||
      Number(config.salidaMax) === Number(config.salidaMin)
    ) {
      faltantes.push('escala fisica creciente');
    }
    if (!String(config.unidadSalida || '').trim()) {
      faltantes.push('unidad de salida');
    }
    if (!String(config.fuenteCalibracion || '').trim()) {
      faltantes.push('fuente de la escala del transductor');
    }

    if (config.variable === 'nivel_napa') {
      const profundidad = Number(config.profundidadInstalacionM);
      const longitudCable = this.numeroOpcional(config.longitudCableM);
      const tramoExterior = this.numeroOpcional(config.tramoCableExteriorM);
      if (!Number.isFinite(profundidad) || profundidad <= 0) {
        faltantes.push('profundidad vertical del sensor desde el terreno');
      }
      if (Number(config.salidaMax) <= Number(config.salidaMin)) {
        faltantes.push('escala de columna de agua creciente');
      }
      if (config.salidaMin! < 0) {
        faltantes.push('columna de agua minima no negativa');
      }
      if (
        String(config.unidadSalida || '')
          .trim()
          .toLowerCase() !== 'm'
      ) {
        faltantes.push('unidad de columna de agua en metros');
      }
      if ((longitudCable === undefined) !== (tramoExterior === undefined)) {
        faltantes.push('longitud total y tramo exterior del cable juntos');
      }
      if (
        longitudCable !== undefined &&
        tramoExterior !== undefined &&
        (longitudCable <= 0 || tramoExterior < 0 || tramoExterior >= longitudCable)
      ) {
        faltantes.push('geometria valida del cable');
      }
      if (
        longitudCable !== undefined &&
        tramoExterior !== undefined &&
        Number.isFinite(profundidad) &&
        Math.abs(longitudCable - tramoExterior - profundidad) > 0.02
      ) {
        faltantes.push('profundidad consistente con el tramo enterrado');
      }
    }

    if (faltantes.length) {
      throw new BadRequestException(
        `La configuracion del sensor analogico no es valida: ${[
          ...new Set(faltantes),
        ].join(', ')}.`,
      );
    }
  }

  private construirHistorialCalibraciones(
    previous: ICalificacionSensorMeteorologico | undefined,
    next: ICalificacionSensorMeteorologico,
  ): IIntervaloCalibracionMeteorologica[] {
    const history = (previous?.historialCalibraciones || []).map((item) => ({
      ...item,
    }));
    const candidates = [
      this.intervaloTemperatura(previous),
      this.intervaloHumedad(previous?.humedadRelativa),
      this.intervaloTemperatura(next),
      this.intervaloHumedad(next.humedadRelativa),
    ].filter(
      (
        item,
      ): item is Omit<
        IIntervaloCalibracionMeteorologica,
        'id' | 'registradoEn'
      > => !!item,
    );

    for (const candidate of candidates) {
      const sameWindow = history.find(
        (item) => this.claveIntervalo(item) === this.claveIntervalo(candidate),
      );
      if (sameWindow) {
        if (
          this.firmaIntervalo(sameWindow) !== this.firmaIntervalo(candidate)
        ) {
          throw new BadRequestException(
            `El intervalo historico ${this.claveIntervalo(candidate)} ya fue registrado y no puede reescribirse. Registre una nueva calibracion con su propia fecha de inicio.`,
          );
        }
        continue;
      }
      const signature = this.firmaIntervalo(candidate);
      history.push({
        ...candidate,
        id: `cal-${createHash('sha256')
          .update(signature)
          .digest('hex')
          .slice(0, 20)}`,
        registradoEn: new Date().toISOString(),
      });
    }

    return history.sort((left, right) => {
      const variable = left.variable.localeCompare(right.variable);
      return (
        variable ||
        String(left.fechaCalibracion).localeCompare(
          String(right.fechaCalibracion),
        )
      );
    });
  }

  private intervaloTemperatura(
    qualification?: ICalificacionSensorMeteorologico,
  ):
    | Omit<IIntervaloCalibracionMeteorologica, 'id' | 'registradoEn'>
    | undefined {
    if (!qualification) return undefined;
    return this.crearIntervalo('temperatura_aire', {
      estado: qualification.estado,
      rol: qualification.rolTemperatura,
      alturaM: qualification.alturaM,
      abrigoRadiacion: qualification.abrigoRadiacion,
      exactitud: qualification.exactitudTemperaturaC,
      fechaCalibracion: qualification.fechaCalibracion,
      proximaCalibracion: qualification.proximaCalibracion,
      offset: qualification.offsetTemperaturaC,
      fuenteCalibracion: qualification.fuenteCalibracion,
      observaciones: qualification.observaciones,
    });
  }

  private intervaloHumedad(
    qualification?: ICalificacionVariableMeteorologica,
  ):
    | Omit<IIntervaloCalibracionMeteorologica, 'id' | 'registradoEn'>
    | undefined {
    return qualification
      ? this.crearIntervalo('humedad_relativa', qualification)
      : undefined;
  }

  private crearIntervalo(
    variable: VariableCalibracionMeteorologica,
    qualification: ICalificacionVariableMeteorologica,
  ):
    | Omit<IIntervaloCalibracionMeteorologica, 'id' | 'registradoEn'>
    | undefined {
    const from = this.fechaValida(qualification.fechaCalibracion);
    const to = this.fechaValida(qualification.proximaCalibracion, true);
    if (!from || !to || to.getTime() < from.getTime()) return undefined;
    return {
      variable,
      version: 'calificacion-variable-v1',
      estado: qualification.estado,
      rol: qualification.rol,
      alturaM: this.numeroOpcional(qualification.alturaM),
      abrigoRadiacion: qualification.abrigoRadiacion,
      exactitud: this.numeroOpcional(qualification.exactitud),
      fechaCalibracion: from.toISOString(),
      proximaCalibracion: to.toISOString(),
      offset: this.numeroOpcional(qualification.offset),
      fuenteCalibracion:
        String(qualification.fuenteCalibracion || '').trim() || undefined,
      observaciones:
        String(qualification.observaciones || '').trim() || undefined,
    };
  }

  private claveIntervalo(
    item: Pick<
      IIntervaloCalibracionMeteorologica,
      'variable' | 'fechaCalibracion' | 'proximaCalibracion'
    >,
  ): string {
    return [
      item.variable,
      this.fechaValida(item.fechaCalibracion)?.toISOString() || '',
      this.fechaValida(item.proximaCalibracion, true)?.toISOString() || '',
    ].join('|');
  }

  private firmaIntervalo(
    item: Omit<IIntervaloCalibracionMeteorologica, 'id' | 'registradoEn'>,
  ): string {
    return JSON.stringify({
      variable: item.variable,
      version: item.version,
      estado: item.estado,
      rol: item.rol,
      alturaM: this.numeroOpcional(item.alturaM),
      abrigoRadiacion: item.abrigoRadiacion,
      exactitud: this.numeroOpcional(item.exactitud),
      fechaCalibracion:
        this.fechaValida(item.fechaCalibracion)?.toISOString() || null,
      proximaCalibracion:
        this.fechaValida(item.proximaCalibracion, true)?.toISOString() || null,
      offset: this.numeroOpcional(item.offset),
      fuenteCalibracion:
        String(item.fuenteCalibracion || '').trim() || undefined,
      observaciones: String(item.observaciones || '').trim() || undefined,
    });
  }

  private numeroOpcional(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }

  private validarCalificacionMeteorologica(
    dato: ICreateDispositivo | IUpdateDispositivo,
  ): void {
    const calificacion = dato.calificacionMeteorologica;
    if (!calificacion) return;

    const faltantes: string[] = [];
    if (
      !['calificado', 'referencia', 'rechazado'].includes(
        String(calificacion.estado),
      )
    ) {
      faltantes.push('estado de calidad válido');
    }
    const rolesValidos = ['aire_2m', 'aire_canopia', 'suelo', 'desconocido'];
    if (
      calificacion.rolTemperatura &&
      !rolesValidos.includes(calificacion.rolTemperatura)
    ) {
      faltantes.push('rol de temperatura válido');
    }
    if (
      calificacion.estado === 'calificado' &&
      calificacion.rolTemperatura !== 'aire_2m' &&
      calificacion.rolTemperatura !== 'aire_canopia'
    ) {
      faltantes.push('rol de temperatura de aire');
    }
    const alturaDeclarada =
      calificacion.alturaM !== undefined && calificacion.alturaM !== null;
    const altura = Number(calificacion.alturaM);
    if (
      (alturaDeclarada &&
        (!Number.isFinite(altura) || altura <= 0 || altura > 10)) ||
      (calificacion.estado === 'calificado' && !alturaDeclarada)
    ) {
      faltantes.push('altura de instalación entre 0 y 10 m');
    }
    if (
      calificacion.abrigoRadiacion !== undefined &&
      typeof calificacion.abrigoRadiacion !== 'boolean'
    ) {
      faltantes.push('estado válido del abrigo radiativo');
    }
    if (
      calificacion.estado === 'calificado' &&
      calificacion.abrigoRadiacion !== true
    ) {
      faltantes.push('abrigo radiativo confirmado');
    }
    const exactitudDeclarada =
      calificacion.exactitudTemperaturaC !== undefined &&
      calificacion.exactitudTemperaturaC !== null;
    const exactitud = Number(calificacion.exactitudTemperaturaC);
    if (
      (exactitudDeclarada &&
        (!Number.isFinite(exactitud) || exactitud <= 0 || exactitud > 2)) ||
      (calificacion.estado === 'calificado' && !exactitudDeclarada)
    ) {
      faltantes.push('exactitud térmica entre 0 y 2 °C');
    }
    const fechaCalibracionDeclarada =
      calificacion.fechaCalibracion !== undefined &&
      calificacion.fechaCalibracion !== null &&
      calificacion.fechaCalibracion !== '';
    const proximaCalibracionDeclarada =
      calificacion.proximaCalibracion !== undefined &&
      calificacion.proximaCalibracion !== null &&
      calificacion.proximaCalibracion !== '';
    const calibracion = this.fechaValida(calificacion.fechaCalibracion);
    const proxima = this.fechaValida(calificacion.proximaCalibracion, true);
    if (fechaCalibracionDeclarada && !calibracion) {
      faltantes.push('fecha de calibración válida');
    }
    if (proximaCalibracionDeclarada && !proxima) {
      faltantes.push('próxima calibración válida');
    }
    if (calificacion.estado === 'calificado' && !calibracion) {
      faltantes.push('fecha de calibración válida');
    }
    if (
      calificacion.estado === 'calificado' &&
      (!proxima || proxima.getTime() < Date.now())
    ) {
      faltantes.push('próxima calibración vigente');
    }
    if (
      calificacion.estado === 'calificado' &&
      calibracion &&
      calibracion.getTime() > Date.now()
    ) {
      faltantes.push('fecha de calibración no futura');
    }
    if (calibracion && proxima && proxima.getTime() < calibracion.getTime()) {
      faltantes.push('próxima calibración posterior a la calibración');
    }
    if (
      calificacion.estado === 'calificado' &&
      !String(calificacion.fuenteCalibracion || '').trim()
    ) {
      faltantes.push('fuente o certificado de calibración');
    }
    const offset = calificacion.offsetTemperaturaC;
    if (
      offset !== undefined &&
      (!Number.isFinite(Number(offset)) || Math.abs(Number(offset)) > 10)
    ) {
      faltantes.push('offset térmico válido entre -10 y 10 °C');
    }

    this.validarCalificacionHumedad(calificacion.humedadRelativa, faltantes);

    if (faltantes.length) {
      throw new BadRequestException(
        `La calificación meteorológica del sensor no es válida: ${[
          ...new Set(faltantes),
        ].join(', ')}.`,
      );
    }
  }

  private validarCalificacionHumedad(
    qualification: ICalificacionVariableMeteorologica | undefined,
    faltantes: string[],
  ): void {
    if (!qualification) return;
    const prefix = 'humedad relativa: ';
    if (
      !['calificado', 'referencia', 'rechazado'].includes(
        String(qualification.estado),
      )
    ) {
      faltantes.push(`${prefix}estado de calidad valido`);
    }
    const rolesValidos = ['aire_2m', 'aire_canopia', 'suelo', 'desconocido'];
    if (qualification.rol && !rolesValidos.includes(qualification.rol)) {
      faltantes.push(`${prefix}rol de exposicion valido`);
    }
    if (
      qualification.estado === 'calificado' &&
      qualification.rol !== 'aire_2m' &&
      qualification.rol !== 'aire_canopia'
    ) {
      faltantes.push(`${prefix}rol de aire`);
    }

    const alturaDeclarada =
      qualification.alturaM !== undefined && qualification.alturaM !== null;
    const altura = Number(qualification.alturaM);
    if (
      (alturaDeclarada &&
        (!Number.isFinite(altura) || altura <= 0 || altura > 10)) ||
      (qualification.estado === 'calificado' && !alturaDeclarada)
    ) {
      faltantes.push(`${prefix}altura entre 0 y 10 m`);
    }
    if (
      qualification.abrigoRadiacion !== undefined &&
      typeof qualification.abrigoRadiacion !== 'boolean'
    ) {
      faltantes.push(`${prefix}estado valido del abrigo`);
    }
    if (
      qualification.estado === 'calificado' &&
      qualification.abrigoRadiacion !== true
    ) {
      faltantes.push(`${prefix}abrigo confirmado`);
    }

    const exactitudDeclarada =
      qualification.exactitud !== undefined && qualification.exactitud !== null;
    const exactitud = Number(qualification.exactitud);
    if (
      (exactitudDeclarada &&
        (!Number.isFinite(exactitud) || exactitud <= 0 || exactitud > 5)) ||
      (qualification.estado === 'calificado' && !exactitudDeclarada)
    ) {
      faltantes.push(`${prefix}exactitud entre 0 y 5 puntos porcentuales`);
    }

    const fechaDeclarada =
      qualification.fechaCalibracion !== undefined &&
      qualification.fechaCalibracion !== null &&
      qualification.fechaCalibracion !== '';
    const proximaDeclarada =
      qualification.proximaCalibracion !== undefined &&
      qualification.proximaCalibracion !== null &&
      qualification.proximaCalibracion !== '';
    const from = this.fechaValida(qualification.fechaCalibracion);
    const to = this.fechaValida(qualification.proximaCalibracion, true);
    if (fechaDeclarada && !from) {
      faltantes.push(`${prefix}fecha de calibracion valida`);
    }
    if (proximaDeclarada && !to) {
      faltantes.push(`${prefix}vigencia valida`);
    }
    if (qualification.estado === 'calificado' && !from) {
      faltantes.push(`${prefix}fecha de calibracion requerida`);
    }
    if (
      qualification.estado === 'calificado' &&
      (!to || to.getTime() < Date.now())
    ) {
      faltantes.push(`${prefix}calibracion vigente`);
    }
    if (
      qualification.estado === 'calificado' &&
      from &&
      from.getTime() > Date.now()
    ) {
      faltantes.push(`${prefix}fecha de calibracion no futura`);
    }
    if (from && to && to.getTime() < from.getTime()) {
      faltantes.push(`${prefix}vigencia posterior a la calibracion`);
    }
    if (
      qualification.estado === 'calificado' &&
      !String(qualification.fuenteCalibracion || '').trim()
    ) {
      faltantes.push(`${prefix}fuente o certificado`);
    }
    if (
      qualification.offset !== undefined &&
      (!Number.isFinite(Number(qualification.offset)) ||
        Math.abs(Number(qualification.offset)) > 20)
    ) {
      faltantes.push(`${prefix}offset entre -20 y 20 puntos porcentuales`);
    }
  }

  private fechaValida(value?: unknown, finDelDia = false): Date | undefined {
    if (!value) return undefined;
    const date = new Date(
      finDelDia &&
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? `${value}T23:59:59.999Z`
        : (value as string | number | Date),
    );
    if (Number.isNaN(date.getTime())) return undefined;
    return date;
  }
}
