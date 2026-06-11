import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  ISiembra,
  IListado,
  IQueryParam,
  ICreateSiembra,
  IUpdateSiembra,
  ICrono,
  ILote,
  IFertilizacion,
  IFumigacion,
  IClimaEstacionMeteorologica,
  Cultivo,
  IEtapasTrigo,
  IEtapasMaiz,
  IEtapasSoja,
  IHuellaHidrica,
  IFilter,
  IPermiso,
  IPrediccion,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { CronosService } from '../crono/service';
import { PrediccionsService } from '../prediccion/service';
import { SemillasService } from '../semilla/service';
import { SiembrasRepository } from './repository';
import { LotesService } from '../lote/service';
import {
  EQ,
  EXTRACCION_N,
  EXTRACCION_P,
  KCAL_X_KG,
  PESOS_CPP,
  PESOS_N,
  PESOS_P,
} from '../../env';
import { FertilizacionsService } from '../fertilizacion/service';
import { FumigacionsService } from '../fumigacion/service';
import { ClimaService } from '../clima/service';

interface Stage {
  name: string;
  kcProm: number;
  days: number;
}
@Injectable()
export class SiembrasService {
  private logger = new Logger(SiembrasService.name);

  constructor(
    private repository: SiembrasRepository,
    private prediccionsService: PrediccionsService,
    private semillasService: SemillasService,
    private cronosService: CronosService,
    private lotesService: LotesService,
    @Inject(forwardRef(() => FertilizacionsService))
    private fertilizacionsService: FertilizacionsService,
    private fumigacionsService: FumigacionsService,
    private climaService: ClimaService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<ISiembra> {
    const data = await this.repository.getById(id);
    if (!this.puedeVer(data, permiso)) {
      throw new Error('No tiene permiso para ver esta siembra');
    }
    return data;
  }

  async get(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<ISiembra>> {
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async generarPrediccionEnfermedades(
    idSiembra: string,
    permiso: IPermiso,
  ): Promise<IPrediccion[]> {
    await this.getById(idSiembra, permiso);
    return await this.prediccionsService.prediccion(idSiembra);
  }

  async create(data: ICreateSiembra, permiso: IPermiso): Promise<ISiembra> {
    if (!data.idLote) {
      throw new BadRequestException('No se ingresó el lote');
    }
    const lote = await this.lotesService.getById(data.idLote, permiso);
    data.idDepartamento = lote?.idDepartamento;
    data.idEstablecimiento = lote?.idEstablecimiento;
    data.idProductor = lote?.idProductor;
    data.idDistribuidor = lote?.idDistribuidor;
    data.idQuimica = lote?.idQuimica;
    data.coordenadas = lote?.ubicacion?.centro;
    data.geojson = {
      type: 'Point',
      coordinates: HelperService.coorToGeoJson(data.coordenadas),
    };
    const crono = await this.getCrono(data);
    data.idCrono = crono?._id;

    const created = await this.repository.create(data);
    const idSiembra = created._id;
    // Si el lote no tiene siembra o la siembra es anterior a la nueva, se actualiza el idSiembra del lote
    if (!lote.siembra || lote.siembra.fechaSiembra < data.fechaSiembra) {
      this.updateIdSiembraEnLote(data.idLote, idSiembra, permiso);
    }
    await this.crearPrediccion(idSiembra);
    this.encolarNdvi(data.idLote, permiso);
    return await this.getById(created._id, permiso);
  }

  async cosechar(
    id: string,
    data: IUpdateSiembra,
    permiso: IPermiso,
  ): Promise<ISiembra> {
    // Traigo la siembra a cosechar
    const siembra = await this.getById(id, permiso);
    // Actualizo los suelos del lote de la siembra (elimina las raices)
    const lote = await this.lotesService.getById(siembra.idLote, permiso);
    if (lote) {
      if (lote.suelos) {
        for (const l of lote.suelos) {
          l.hayRaices = false;
        }
        await this.lotesService.update(lote._id, lote, permiso);
      }
    }
    // Actualizo la siembra
    data.rendimientoObtenidoKgHaSeco =
      data.rendimientoObtenidoKgHa * (100 / (100 + data.humedadCosecha));
    data.activa = false;

    siembra.fechaCosecha = data.fechaCosecha;
    siembra.rendimientoObtenidoKgHaSeco = data.rendimientoObtenidoKgHaSeco;
    const huellaHidrica = await this.calcularHuellaHidrica(
      siembra,
      lote,
      permiso,
    );
    data.huellaHidrica = huellaHidrica;
    await this.calcularHuellaHidrica(siembra, lote, permiso);
    // return siembra;
    const [updated] = await Promise.all([
      this.repository.update(id, data),
      this.lotesService.update(lote._id, { huellaHidrica }, permiso),
    ]);
    return updated;
  }

  async update(
    id: string,
    data: IUpdateSiembra,
    permiso: IPermiso,
  ): Promise<ISiembra> {
    const lote = await this.lotesService.getById(data.idLote, permiso);
    data.idDepartamento = lote?.idDepartamento;
    data.idEstablecimiento = lote?.idEstablecimiento;
    data.idProductor = lote?.idProductor;
    data.idDistribuidor = lote?.idDistribuidor;
    data.idQuimica = lote?.idQuimica;
    data.coordenadas = lote?.ubicacion?.centro;
    data.geojson = {
      type: 'Point',
      coordinates: HelperService.coorToGeoJson(data.coordenadas),
    };
    const crono = await this.getCrono(data);
    data.idCrono = crono?._id;

    await this.repository.update(id, data);
    await this.actualizarPrediccion(id, permiso);
    this.encolarNdvi(data.idLote, permiso);
    return await this.getById(id, permiso);
  }

  async delete(id: string, permiso: IPermiso): Promise<ISiembra> {
    const siembra = await this.getById(id, permiso);
    const deleted = await this.repository.delete(id);
    this.prediccionsService.deleteByIdSiembra(id, permiso);
    this.actualizarLoteAlEliminarSiembra(siembra, permiso);
    return deleted;
  }

  private async siembraAnterior(idLote: string, fechaSiembraAnteriorA: string) {
    const filter: IFilter<ISiembra> = {
      idLote,
      fechaSiembra: { $lt: fechaSiembraAnteriorA },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fechaSiembra',
      limit: 1,
    };
    const res = await this.repository.get(query);
    return res.datos[0];
  }

  private async actualizarLoteAlEliminarSiembra(
    siembra: ISiembra,
    permiso: IPermiso,
  ) {
    // Actualizo los suelos del lote de la siembra
    const lote = await this.lotesService.getById(siembra.idLote, permiso);
    if (!lote) {
      console.debug('No se encontró el lote de la siembra');
    } else {
      let update = false;
      // Si se está eliminando la siembra actual, se actualiza el idSiembra del lote a la siembra anterior si existe
      if (lote.idSiembra === siembra._id) {
        const siembraAnterior = await this.siembraAnterior(
          lote._id,
          siembra.fechaSiembra,
        );
        lote.idSiembra = siembraAnterior?._id || null;
        update = true;
      }

      // Elimina las raices de los suelos del lote
      if (!lote.suelos) {
        console.debug('No se encontraron los suelos del lote');
      } else {
        for (const l of lote.suelos) {
          l.hayRaices = false;
        }
        update = true;
      }

      if (update) {
        await this.lotesService.update(lote._id, lote, permiso);
      }
    }
  }

  private async ultimaSiembra(idLote: string, permiso: IPermiso) {
    const filter: IFilter<ISiembra> = { idLote };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fechaSiembra',
      limit: 1,
    };
    const res = await this.get(query, permiso);
    return res.datos[0];
  }

  private async updateIdSiembraEnLote(
    idLote: string,
    idSiembra: string,
    permiso: IPermiso,
  ) {
    try {
      await this.lotesService.update(idLote, { idSiembra }, permiso);
    } catch (error) {
      this.logger.error(
        `Error al actualizar el idSiembra ${idSiembra} en el lote ${idLote}`,
      );
      console.error(error);
    }
  }

  private async crearPrediccion(idSiembra: string) {
    try {
      await this.prediccionsService.prediccion(idSiembra);
    } catch (error) {
      this.logger.error(
        `Error al crear la predicción para la siembra ${idSiembra}`,
      );
      console.error(error);
    }
  }

  private encolarNdvi(idLote: string, permiso: IPermiso) {
    this.lotesService.generarNdvi(idLote, permiso).catch((error) => {
      this.logger.error(`Error al encolar NDVI para el lote ${idLote}`);
      console.error(error);
    });
  }

  // HUELLA HIDRICA
  private datosValidos(siembra: ISiembra, lote: ILote) {
    if (!siembra.dosisN) {
      throw new BadRequestException('No se ingresó la dosis de Nitrógeno');
    }
    if (!siembra.dosisP) {
      throw new BadRequestException('No se ingresó la dosis de Fósforo');
    }
    if (!siembra.rendimientoObtenidoKgHaSeco) {
      throw new BadRequestException('No se ingresó el rendimiento obtenido');
    }
    if (!lote.texturaEscorrentia) {
      throw new BadRequestException('No se ingresó la textura de escorrentía');
    }
    if (!lote.texturaLixiviacion) {
      throw new BadRequestException('No se ingresó la textura de lixiviación');
    }
    if (!lote.drenajeNaturalEscorrentia) {
      throw new BadRequestException(
        'No se ingresó el drenaje natural de escorrentía',
      );
    }
    if (!lote.drenajeNaturalLixiviacion) {
      throw new BadRequestException(
        'No se ingresó el drenaje natural de lixiviación',
      );
    }
    if (!lote.depositoN) {
      throw new BadRequestException('No se ingresó el depósito de Nitrógeno');
    }
    if (!siembra.lluviasPromedio) {
      throw new BadRequestException('No se ingresó las lluvias promedio');
    }
    if (!siembra.fijacionN) {
      throw new BadRequestException('No se ingresó la fijación de Nitrógeno');
    }
    if (!siembra.manejoAgronomico) {
      throw new BadRequestException('No se ingresó el manejo agronómico');
    }
    if (!siembra.intensidadLluvias) {
      throw new BadRequestException('No se ingresó la intensidad de lluvias');
    }
  }

  public async calcularHuellaHidrica(
    siembra: ISiembra,
    lote: ILote,
    permiso: IPermiso,
  ) {
    console.debug(
      `Calculando Huella Hídrica para ${siembra.semilla?.cultivo} entre las fechas ${siembra.fechaSiembra} y ${siembra.fechaCosecha} - rendimiento seco ${siembra.rendimientoObtenidoKgHaSeco}`,
    );

    this.datosValidos(siembra, lote);

    // const f = await this.HHGFertilizantes(siembra, lote);
    // console.debug('HHGris Fertilizantes:', f);

    const [HHGFertilizantes, HHGFumigaciones, HHVyA] = await Promise.all([
      this.HHGFertilizantes(siembra, lote),
      this.HHGFumigaciones(siembra, lote, permiso),
      this.HHVerdeYAzul(siembra, lote),
    ]);
    console.debug('HHGris Fertilizantes:', HHGFertilizantes);
    console.debug('HHGris Fumigaciones:', HHGFumigaciones);
    console.debug('HHAzul:', HHVyA.HHGAzul);
    console.debug('HHVerde:', HHVyA.HHGVerde);

    const hh: IHuellaHidrica = {
      azul: {
        litrosKg: HHVyA.HHGAzul,
        litrosKcal: this.kgToKcal(HHVyA.HHGAzul, siembra),
      },
      verde: {
        litrosKg: HHVyA.HHGVerde,
        litrosKcal: this.kgToKcal(HHVyA.HHGVerde, siembra),
      },
      gris: {
        litrosKgAgroquimico: HHGFumigaciones,
        litrosKgFertilizante: HHGFertilizantes,
        litrosKg: HHGFertilizantes + HHGFumigaciones,
        litrosKcal: this.kgToKcal(HHGFumigaciones + HHGFertilizantes, siembra),
      },
      total: {
        litrosKg:
          HHGFertilizantes + HHGFumigaciones + HHVyA.HHGVerde + HHVyA.HHGAzul,
        litrosKcal: this.kgToKcal(
          HHGFertilizantes + HHGFumigaciones + HHVyA.HHGVerde + HHVyA.HHGAzul,
          siembra,
        ),
      },
    };
    console.debug('Huella Hídrica:', hh);
    return hh;
  }

  private kgToKcal(valor: number, siembra: ISiembra) {
    const cultivo = siembra.semilla?.cultivo;
    const valorKcal = KCAL_X_KG[cultivo];
    return (valor / siembra.rendimientoObtenidoKgHaSeco) * valorKcal;
  }

  // HUELLA HIDRICA GRIS
  // FERTILIZACION
  private calcularPotencialTotalN(siembra: ISiembra, lote: ILote) {
    let suma = 0;
    suma += EQ.depositoN[lote.depositoN] * PESOS_N.depositoN;
    suma +=
      EQ.texturaLixiviacion[lote.texturaLixiviacion] *
      PESOS_N.texturaLixiviacion;
    suma +=
      EQ.texturaEscorrentia[lote.texturaEscorrentia] *
      PESOS_N.texturaEscorrentia;
    suma +=
      EQ.drenajeNaturalLixiviacion[lote.drenajeNaturalLixiviacion] *
      PESOS_N.drenajeNaturalLixiviacion;
    suma +=
      EQ.drenajeNaturalEscorrentia[lote.drenajeNaturalEscorrentia] *
      PESOS_N.drenajeNaturalEscorrentia;
    suma +=
      EQ.lluviasPromedio[siembra.lluviasPromedio] * PESOS_N.lluviasPromedio;
    suma += EQ.fijacionN[siembra.fijacionN] * PESOS_N.fijacionN;
    suma += EQ.dosisN[siembra.dosisN] * PESOS_N.dosisN;
    suma += EQ.rendimiento[siembra.rendimiento] * PESOS_N.rendimiento;
    suma +=
      EQ.manejoAgronomico[siembra.manejoAgronomico] * PESOS_N.manejoAgronomico;
    return suma;
  }

  private calcularPotencialTotalP(siembra: ISiembra, lote: ILote) {
    let suma = 0;
    suma +=
      EQ.texturaLixiviacion[lote.texturaLixiviacion] *
      PESOS_P.texturaLixiviacion;
    suma +=
      EQ.erosionEscorrentiaPendiente[lote.erosionEscorrentiaPendiente] *
      PESOS_P.erosionEscorrentiaPendiente;
    suma += EQ.contenidoP[lote.contenidoP] * PESOS_P.contenidoP;
    suma +=
      EQ.intensidadLluvias[siembra.intensidadLluvias] *
      PESOS_P.intensidadLluvias;
    suma += EQ.dosisP[siembra.dosisP] * PESOS_P.dosisP;
    suma += EQ.rendimiento[siembra.rendimiento] * PESOS_P.rendimiento;
    suma +=
      EQ.manejoAgronomico[siembra.manejoAgronomico] * PESOS_P.manejoAgronomico;
    return suma;
  }

  private calcularAporteTotalN(fertilizaciones: IFertilizacion[]) {
    let aporteTotalN = 0;
    for (const f of fertilizaciones) {
      aporteTotalN += (f.dosisKgHa * f.fertilizante?.porcentajeN) / 100;
    }
    return aporteTotalN;
  }

  private calcularAporteTotalP(fertilizaciones: IFertilizacion[]) {
    let aporteTotalP = 0;
    for (const f of fertilizaciones) {
      aporteTotalP += (f.dosisKgHa * f.fertilizante?.porcentajeP) / 100;
    }
    return aporteTotalP;
  }

  private calcularExtraccionNxTn(siembra: ISiembra) {
    const cultivo = siembra.semilla?.cultivo;
    return (EXTRACCION_N[cultivo] * siembra.rendimientoObtenidoKgHaSeco) / 1000;
  }

  private calcularExtraccionPxTn(siembra: ISiembra) {
    const cultivo = siembra.semilla?.cultivo;
    return (EXTRACCION_P[cultivo] * siembra.rendimientoObtenidoKgHaSeco) / 1000;
  }

  private async HHGFertilizantes(siembra: ISiembra, lote: ILote) {
    const potencialP: number = this.calcularPotencialTotalP(siembra, lote);
    const potencialN: number = this.calcularPotencialTotalN(siembra, lote);
    console.debug('Potencial Total N:', potencialN);
    console.debug('Potencial Total P:', potencialP);

    const desde = new Date(siembra.fechaSiembra);
    desde.setDate(desde.getDate() - 30);
    const fertilizaciones =
      await this.fertilizacionsService.getByIdLoteAndFechasInternal(
        siembra.idLote,
        desde.toISOString(),
        siembra.fechaCosecha,
      );
    console.debug('Fertilizaciones:', fertilizaciones?.length);

    const aporteTotalN = this.calcularAporteTotalN(fertilizaciones);
    const aporteTotalP = this.calcularAporteTotalP(fertilizaciones);
    console.debug('Aporte Total N:', aporteTotalN);
    console.debug('Aporte Total P:', aporteTotalP);

    const extracionNxTn = this.calcularExtraccionNxTn(siembra);
    const extracionNxTp = this.calcularExtraccionPxTn(siembra);
    console.debug('Extraccion NxTn:', extracionNxTn);
    console.debug('Extraccion PxTn:', extracionNxTp);

    const saldoN = aporteTotalN - extracionNxTn;
    const saldoP = aporteTotalP - extracionNxTp;
    console.debug('Saldo N:', saldoN);
    console.debug('Saldo P:', saldoP);

    const excedenteN = (saldoN * potencialN) / 100;
    const excedenteP = (saldoP * potencialP) / 100;
    console.debug('Excedente N:', excedenteN);
    console.debug('Excedente P:', excedenteP);

    const CONST_N = 35;
    const CONST_P = 4;

    const LtHaN = (excedenteN / CONST_N) * 1000;
    const LtHaP = (excedenteP / CONST_P) * 1000;
    console.debug('Litros por Ha N:', LtHaN);
    console.debug('Litros por Ha P:', LtHaP);

    const LtKgN = (LtHaN / siembra.rendimientoObtenidoKgHaSeco) * 1000;
    const LtKgP = (LtHaP / siembra.rendimientoObtenidoKgHaSeco) * 1000;
    console.debug('Litros por Kg N:', LtKgN);
    console.debug('Litros por Kg P:', LtKgP);

    const LtKgTotal = LtKgN + LtKgP;
    return LtKgTotal;
  }

  // FUMIGACION
  private calcularPotencialTotalCPP(
    siembra: ISiembra,
    lote: ILote,
    fumigacion: IFumigacion,
  ) {
    let suma = 0;
    suma += fumigacion.principioActivo?.koc * PESOS_CPP.koc;
    suma +=
      fumigacion.principioActivo?.persistencia *
      PESOS_CPP.persistenciaEscorrentia;
    suma +=
      fumigacion.principioActivo?.persistencia *
      PESOS_CPP.persistenciaLixiviacion;
    suma +=
      EQ.texturaLixiviacion[lote.texturaLixiviacion] *
      PESOS_CPP.texturaLixiviacion;
    suma +=
      EQ.texturaEscorrentia[lote.texturaEscorrentia] *
      PESOS_CPP.texturaEscorrentia;
    suma +=
      EQ.materiaOrganica[siembra.materiaOrganica] * PESOS_CPP.materiaOrganica;
    suma +=
      EQ.intensidadLluvias[siembra.intensidadLluvias] *
      PESOS_CPP.intensidadLluvias;
    suma +=
      EQ.lluviasPromedio[siembra.lluviasPromedio] * PESOS_CPP.lluviasPromedio;
    suma +=
      EQ.manejoAgronomico[siembra.manejoAgronomico] *
      PESOS_CPP.manejoAgronomico;
    return suma;
  }

  private async HHGFumigaciones(
    siembra: ISiembra,
    lote: ILote,
    permiso: IPermiso,
  ) {
    const res = await this.fumigacionsService.getByIdSiembra(
      siembra._id,
      permiso,
    );
    const fumigaciones = res.datos;
    console.debug('Fumigaciones:', fumigaciones?.length);

    let sumaHhIa = 0;
    for (const f of fumigaciones) {
      const potencialCPP: number = this.calcularPotencialTotalCPP(
        siembra,
        lote,
        f,
      );
      console.debug(
        `Potencial Total CPP para ${f.principioActivo?.nombre}:`,
        potencialCPP,
      );
      const IaHa = (f.dosisLtHa * f.concentracion) / 100;
      console.debug(`IaHa para ${f.principioActivo?.nombre}:`, IaHa);

      const hhIa = IaHa * potencialCPP;
      console.debug(`HHG Ia para ${f.principioActivo?.nombre}:`, hhIa);

      sumaHhIa += hhIa;
    }

    console.debug('Suma HHG Ia:', sumaHhIa);

    const total = sumaHhIa / 0.0005 / siembra.rendimientoObtenidoKgHaSeco;
    return total;
  }

  // HUELLA HIDRICA VERDE y AZUL

  private getStages(cultivo: Cultivo, crono: ICrono): Stage[] {
    const stagesMaiz: Stage[] = [
      { name: 'Siembra', kcProm: 0.1, days: 0 },
      { name: 'siembra_emergencia', kcProm: 0.175, days: 0 },
      // { name: 'V4', kcProm: 0.425, days: 38 },
      // { name: 'V8', kcProm: 0.825, days: 56 },
      // { name: 'V12', kcProm: 0.94, days: 63 },
      // { name: 'VT', kcProm: 1.06, days: 71 },
      { name: 'emergencia_floracion', kcProm: 1.2, days: 76 },
      // { name: 'R2', kcProm: 1.15, days: 84 },
      // { name: 'R3', kcProm: 1.05, days: 93 },
      // { name: 'R4', kcProm: 0.9, days: 105 },
      // { name: 'R5', kcProm: 0.725, days: 112 },
      // { name: 'R6', kcProm: 0.35, days: 118 },
      { name: 'floracion_madurez', kcProm: 0.125, days: 160 },
    ];
    const stagesSoja: Stage[] = [
      { name: 'Siembra', kcProm: 0.1, days: 0 },
      { name: 'siembra_emergencia', kcProm: 0.4, days: 0 },
      // { name: 'V4', kcProm: 0.5, days: 11 },
      // { name: 'V8', kcProm: 0.75, days: 22 },
      // { name: 'V12', kcProm: 0.95, days: 33 },
      { name: 'emergencia_R1', kcProm: 1.05, days: 44 },
      // { name: 'R2', kcProm: 1.16, days: 51 },
      { name: 'R1_R3', kcProm: 1.02, days: 66 },
      // { name: 'R4', kcProm: 0.9, days: 70 },
      { name: 'R3_R5', kcProm: 0.85, days: 80 },
      // { name: 'R6', kcProm: 0.65, days: 92 },
      { name: 'R5_R7', kcProm: 0.4, days: 118 },
    ];
    const stagesTrigo: Stage[] = [
      { name: 'Siembra', kcProm: 0.1, days: 0 }, // Siembra
      { name: 'R0_R1', kcProm: 0.3, days: 0 }, // Emergencia
      { name: 'R1_R2', kcProm: 0.5, days: 0 }, // Espiguilla terminal
      { name: 'R2_R3', kcProm: 0.75, days: 0 }, // Hoja bandera
      { name: 'R3_R4', kcProm: 0.95, days: 0 }, // Espigazon
      { name: 'R4_R5', kcProm: 1.15, days: 0 }, // Antesis
      { name: 'R5_R6', kcProm: 0.9, days: 0 }, // Llenado de granos
      { name: 'R6_R7', kcProm: 0.4, days: 0 }, // Madurez fisiologica
    ];

    if (cultivo === 'Trigo') {
      const etapas = crono.etapas as IEtapasTrigo;
      let tiempoAcumulado = etapas.R0_R1;
      stagesTrigo[1].days = tiempoAcumulado;
      for (let i = 2; i < stagesTrigo.length; i++) {
        const stage = stagesTrigo[i];
        const tiempoEtapa = etapas[stage.name] as number;
        tiempoAcumulado += tiempoEtapa;
        stage.days = tiempoAcumulado;
      }
      return stagesTrigo;
    }

    if (cultivo === 'Maiz') {
      const etapas = crono.etapas as IEtapasMaiz;
      let tiempoAcumulado = etapas.emergencia_floracion;
      stagesMaiz[1].days = tiempoAcumulado;
      for (let i = 2; i < stagesMaiz.length; i++) {
        const stage = stagesMaiz[i];
        const tiempoEtapa = etapas[stage.name] as number;
        tiempoAcumulado += tiempoEtapa;
        stage.days = tiempoAcumulado;
      }
      return stagesMaiz;
    }

    if (cultivo === 'Soja') {
      const etapas = crono.etapas as IEtapasSoja;
      let tiempoAcumulado = etapas.siembra_emergencia;
      stagesSoja[1].days = tiempoAcumulado;
      for (let i = 2; i < stagesSoja.length; i++) {
        const stage = stagesSoja[i];
        const tiempoEtapa = etapas[stage.name] as number;
        tiempoAcumulado += tiempoEtapa;
        stage.days = tiempoAcumulado;
      }
      return stagesSoja;
    }

    return this.getGenericStages(crono);
  }

  private getGenericStages(crono: ICrono): Stage[] {
    const etapas = (crono?.etapas || {}) as Record<string, number>;
    const keys = Object.keys(etapas);
    const stages: Stage[] = [{ name: 'Inicio', kcProm: 0.35, days: 0 }];
    let acumulado = 0;

    for (const key of keys) {
      acumulado += Number(etapas[key] || 0);
      stages.push({
        name: key,
        kcProm: 0.75,
        days: acumulado,
      });
    }

    return stages.length > 1 ? stages : [{ name: 'Inicio', kcProm: 0.5, days: 0 }];
  }

  private getKc(diasDesdeSiembra: number, cultivo: Cultivo, crono: ICrono) {
    const stages = this.getStages(cultivo, crono);
    if (diasDesdeSiembra === 0) {
      console.debug('Etapas:', stages);
    }

    // Si los días están fuera del rango, devuelve el valor más cercano
    if (diasDesdeSiembra <= stages[0].days) return stages[0].kcProm;
    if (diasDesdeSiembra >= stages[stages.length - 1].days)
      return stages[stages.length - 1].kcProm;

    // Buscar los estadios entre los que cae la cantidad de días
    for (let i = 0; i < stages.length - 1; i++) {
      const currentStage = stages[i];
      const nextStage = stages[i + 1];

      if (
        diasDesdeSiembra >= currentStage.days &&
        diasDesdeSiembra <= nextStage.days
      ) {
        // Interpolación lineal para estimar el Kc Prom
        const proportion =
          (diasDesdeSiembra - currentStage.days) /
          (nextStage.days - currentStage.days);

        const suma = proportion * (nextStage.kcProm - currentStage.kcProm);
        const result = currentStage.kcProm + suma;
        return +result.toFixed(2);
      }
    }

    // Si no se encuentra, devolver 0 por seguridad
    return 0;
  }

  private calcularETC(
    siembra: ISiembra,
    clima: IClimaEstacionMeteorologica,
    diaDesdeSiembra: number,
    crono: ICrono,
  ) {
    const cultivo = siembra.semilla?.cultivo;
    // const crono = await this.cronosService.getById(siembra.idCrono);
    const kc = this.getKc(diaDesdeSiembra, cultivo, crono);
    const et0Dia = clima.et0?.result || 0;
    return kc * et0Dia;
  }

  private getPendiente(lote: ILote) {
    switch (lote.erosionEscorrentiaPendiente) {
      case 'Baja (0 - 3%)':
        return 0.015;
      case 'Moderada (3 - 8%)':
        return 0.055;
      case 'Alta (8 - 15%)':
        return 0.115;
      case 'Muy Alta (> 15%)':
        return 0.15;
    }
  }

  private getFactorTextura(lote: ILote) {
    switch (lote.texturaEscorrentia) {
      case 'Arcilloso':
        return 0.8;
      case 'Franco arcilloso':
        return 0.8;
      case 'Franco':
        return 0.85;
      case 'Franco arenoso':
        return 0.8;
      case 'Arenoso':
        return 0.7;
    }
  }

  private getFactorCobertura(siembra: ISiembra) {
    switch (siembra.labranza) {
      case 'Siembra Directa':
        return 0.95;
      case 'Convencional':
        return 0.7;
      case 'Labranza':
        return 0.95;
      case 'Reducida':
        return 0.8;
    }
  }

  private calcularLluviasEfectivas(
    siembra: ISiembra,
    lote: ILote,
    clima: IClimaEstacionMeteorologica,
  ) {
    const lluvia = clima.lluvia?.sum || 0;
    const intensidad = lluvia > 20 ? 0.7 : lluvia > 10 ? 0.8 : 0.9;
    const pendiente = this.getPendiente(lote);
    const factorPendiente = 1 - pendiente;
    const factorTextura = this.getFactorTextura(lote);
    const factorCobertura = this.getFactorCobertura(siembra);
    const llEfectivaPorc =
      intensidad * factorPendiente * factorTextura * factorCobertura;
    const llEfectivaMM = lluvia * llEfectivaPorc;
    return llEfectivaMM;
  }

  private async HHVerdeYAzul(siembra: ISiembra, lote: ILote) {
    const clima = await this.climaService.getClimaEntreFechas(
      lote.ubicacion?.centro?.lat,
      lote.ubicacion?.centro?.lng,
      siembra.fechaSiembra,
      siembra.fechaCosecha,
    );
    console.debug('Clima:', clima?.length);

    let ETVerde = 0;
    let ETAzul = 0;
    const crono = siembra.crono;

    const promises = clima.map(async (diaClima, dia) => {
      const etc = await this.calcularETC(siembra, diaClima, dia, crono);
      const lluviasEfectivas = this.calcularLluviasEfectivas(
        siembra,
        lote,
        diaClima,
      );
      console.debug(`ETC día ${dia}:`, etc);
      console.debug(`Lluvias efectivas día ${dia}:`, lluviasEfectivas);
      const ETV = etc <= lluviasEfectivas ? etc : lluviasEfectivas;
      const ETA = etc - lluviasEfectivas > 0 ? etc - lluviasEfectivas : 0;
      console.debug(`ET Verde día ${dia}:`, ETV);
      console.debug(`ET Azul día ${dia}:`, ETA);
      return { ETV, ETA };
    });

    const results = await Promise.all(promises);

    results.forEach(({ ETV, ETA }) => {
      ETVerde += ETV;
      ETAzul += ETA;
    });

    console.debug('ET Verde total:', ETVerde);
    console.debug('ET Azul total:', ETAzul);

    const HHGVerde = (ETVerde * 10000) / siembra.rendimientoObtenidoKgHaSeco;
    const HHGAzul = (ETAzul * 10000) / siembra.rendimientoObtenidoKgHaSeco;

    return { HHGVerde, HHGAzul };
  }

  // Private

  private async actualizarPrediccion(idSiembra: string, permiso: IPermiso) {
    try {
      await this.prediccionsService.deleteByIdSiembra(idSiembra, permiso);
    } catch (error) {
      Logger.error(error);
    }

    try {
      await this.prediccionsService.prediccion(idSiembra);
    } catch (error) {
      Logger.error(error);
    }
  }

  private puedeVer(data: ISiembra, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Quimica') {
      return !data.idQuimica || data.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return (
        !data.idDistribuidor || data.idDistribuidor === permiso.idDistribuidor
      );
    }
    if (permiso.nivel === 'Productor') {
      return !data.idProductor || data.idProductor === permiso.idProductor;
    }
    if (permiso.nivel === 'Establecimiento') {
      return (
        !data.idEstablecimiento ||
        data.idEstablecimiento === permiso.idEstablecimiento
      );
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<ISiembra> = HelperService.filtroToObject(
      query.filter,
    );
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Quimica') {
      $and.push({ idQuimica: permiso.idQuimica });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ idDistribuidor: permiso.idDistribuidor });
    }
    if (permiso.nivel === 'Productor') {
      $and.push({ idProductor: permiso.idProductor });
    }
    if (permiso.nivel === 'Establecimiento') {
      $and.push({ idEstablecimiento: permiso.idEstablecimiento });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }

  private async getCrono(
    siembra: ICreateSiembra | IUpdateSiembra,
  ): Promise<ICrono | undefined> {
    const semilla = await this.semillasService.getById(siembra.idSemilla);
    const cultivo = semilla?.cultivo;
    const ciclo = semilla?.ciclo;
    const idDepartamento = siembra.idDepartamento;
    const diaSiembra = new Date(siembra.fechaSiembra).getDate();
    const mesSiembra = new Date(siembra.fechaSiembra).getMonth() + 1;
    const filtro = {
      ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
      idDepartamento,
      diaSiembra,
      mesSiembra,
      cultivo,
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filtro),
    };
    const resp = await this.cronosService.get(query);
    if (resp.datos[0]) {
      return resp.datos[0];
    }

    const fallbackPorDepartamento: IQueryParam = {
      filter: JSON.stringify({
        ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
        idDepartamento,
        cultivo,
      }),
      limit: 1,
    };
    const porDepartamento = await this.cronosService.get(fallbackPorDepartamento);
    if (porDepartamento.datos[0]) {
      return porDepartamento.datos[0];
    }

    const fallbackGenerico: IQueryParam = {
      filter: JSON.stringify({
        ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
        cultivo,
        idDepartamento: { $exists: false },
      }),
      limit: 1,
    };
    const generico = await this.cronosService.get(fallbackGenerico);
    return generico.datos[0];
  }
}
