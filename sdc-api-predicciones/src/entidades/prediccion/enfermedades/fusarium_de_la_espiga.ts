import { Injectable } from '@nestjs/common';
import {
  IContextoVentanaSanitariaTrigo,
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesFusariumDeLaEspiga,
} from 'modelos/src';
import {
  calcularFusariumEspiga,
  calcularFusariumEspigaCrudo,
  gradosDiaBase0,
  resolverResistencia,
  TRIGO_FUSARIUM_GDD_BASE_0_MAX,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
import {
  camposClimaticosFaltantes,
  crearPrediccionFueraVentana,
  crearPrediccionSinDatos,
  metadataSanitariaFusarium,
} from './calidad';

@Injectable()
export class FusariumDeLaEspigaService {
  async predecir(
    semilla: ISemilla,
    clima: {
      precip: number;
      precipAnterior: number;
      hr: number;
      hrAnterior: number;
      Tavg: number;
      Tmin: number;
      Tmax: number;
    },
    prediccionAnterior?: IPrediccion,
    predecir?: boolean,
    contexto?: IContextoVentanaSanitariaTrigo,
  ): Promise<IPrediccionEnfermedad> {
    const prediccionAnteriorEnfermedad = prediccionAnterior?.enfermedades.find(
      (e) =>
        (e.idEnfermedad === 'trigo.fusarium_espiga' ||
          e.enfermedad === 'Fusarium de la Espiga') &&
        e.modelo?.version === TRIGO_MOTOR_SANITARIO_VERSION,
    );
    const anteriores = (prediccionAnteriorEnfermedad?.variables ||
      {}) as IVariablesFusariumDeLaEspiga;
    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.fusarium_espiga',
    );
    const variables: IVariablesFusariumDeLaEspiga = {
      ...anteriores,
      GDN: Math.max(0, Number(anteriores.GDN) || 0),
      PMoj: Math.max(0, Number(anteriores.PMoj) || 0),
      GDAcum: Math.max(0, Number(anteriores.GDAcum) || 0),
      diasClimaEsperados: Math.max(
        0,
        Number(anteriores.diasClimaEsperados) || 0,
      ),
      diasClimaValidos: Math.max(0, Number(anteriores.diasClimaValidos) || 0),
      factorSusceptibilidad: resistencia.multiplicador,
      formulaVersion: TRIGO_MOTOR_SANITARIO_VERSION,
    };
    const crearCierreVentana = (): IPrediccionEnfermedad => {
      const motivo =
        'Fuera de la ventana de 530 GDD base 0 iniciada con anteras visibles.';
      const fueraVentana = crearPrediccionFueraVentana(
        'Fusarium de la Espiga',
        'trigo.fusarium_espiga',
        motivo,
        'Moschini y Fortugno (1996); adaptacion varietal del contrato sanitario trigo 2026',
        TRIGO_MOTOR_SANITARIO_VERSION,
        'operativo_provisional',
        variables,
        prediccionAnteriorEnfermedad,
      );
      return {
        ...fueraVentana,
        ...metadataSanitariaFusarium(
          resistencia,
          variables.coberturaClima,
          contexto?.calidadClima,
        ),
        modelo: {
          ...fueraVentana.modelo,
          resolucion: 'diaria',
          alcance: motivo,
        },
      };
    };
    if (variables.GDAcum >= TRIGO_FUSARIUM_GDD_BASE_0_MAX) {
      return crearCierreVentana();
    }
    const faltantes = camposClimaticosFaltantes(clima, [
      'precipAnterior',
      'hr',
      'hrAnterior',
      'Tavg',
      'Tmin',
      'Tmax',
    ]);
    if (predecir) {
      variables.diasClimaEsperados += 1;
      if (!faltantes.length) variables.diasClimaValidos += 1;
    }
    variables.coberturaClima = variables.diasClimaEsperados
      ? +(variables.diasClimaValidos / variables.diasClimaEsperados).toFixed(4)
      : 0;
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        'Fusarium de la Espiga',
        'trigo.fusarium_espiga',
        faltantes,
        'Moschini y Fortugno (1996) / contrato sanitario trigo 2026',
        TRIGO_MOTOR_SANITARIO_VERSION,
        'operativo_provisional',
        variables,
      );
    }
    // Logger.log(
    //   `Prediccion de Fusarium de la Espiga: fecha ${fecha}, semilla ${semilla}, clima ${clima}, prediccionAnterior ${prediccionAnteriorEnfermedad}`,
    // );

    if (variables.GDAcum < TRIGO_FUSARIUM_GDD_BASE_0_MAX) {
      // Suma de temperaturas medias

      variables.GDAcum = predecir
        ? +(variables.GDAcum + gradosDiaBase0(clima.Tavg)).toFixed(2)
        : 0;

      // número de períodos de mojado de 2 días con registro de precipitación > 0,2 y HR>81% en el día 1 y una HR≥78% en el día 2.
      if (
        clima.precipAnterior >= 0.2 &&
        clima.hrAnterior > 81 &&
        clima.hr >= 78
      ) {
        variables.PMoj = predecir ? variables.PMoj + 1 : 0;
      }

      // GDN = GDTx + GDTn
      // GDTx = ∑d (Tx-26) si Tx>26°C
      // GDTn = ∑d (9-Tn)  si Tn<9°C
      let resisual = 0;
      if (clima.Tmax > 26) {
        resisual += clima.Tmax - 26;
      }
      if (clima.Tmin < 9) {
        resisual += 9 - clima.Tmin;
      }
      variables.GDN = predecir ? +(variables.GDN + resisual).toFixed(2) : 0;

      variables.resultadoCrudo = +calcularFusariumEspigaCrudo(
        variables.PMoj,
        variables.GDN,
        resistencia.multiplicador,
      ).toFixed(4);

      const resultado = calcularFusariumEspiga(
        variables.PMoj,
        variables.GDN,
        resistencia.multiplicador,
      );

      if (!predecir) {
        variables.PMoj = 0;
        variables.GDN = 0;
        variables.GDAcum = 0;
      }

      const prediccion: IPrediccionEnfermedad = {
        enfermedad: 'Fusarium de la Espiga',
        idEnfermedad: 'trigo.fusarium_espiga',
        resultado: predecir ? +resultado.toFixed(2) : 0,
        estado: 'calculado',
        ...metadataSanitariaFusarium(
          resistencia,
          variables.coberturaClima,
          contexto?.calidadClima,
        ),
        modelo: {
          id: 'trigo.fusarium_espiga',
          version: TRIGO_MOTOR_SANITARIO_VERSION,
          fuente:
            'Moschini y Fortugno (1996); adaptacion varietal del contrato sanitario trigo 2026',
          resolucion: 'diaria',
          validacion: 'operativo_provisional',
          alcance:
            'Incidencia meteorologica ajustada por perfil varietal; no equivale a diagnostico confirmado.',
        },
        variables,
      };
      return prediccion;
    }
    return crearCierreVentana();
  }
}
