import {
  calcularHuellaHidrica,
  calcularSeguimientoHuellaHidrica,
} from './huella-hidrica.engine';
import { AlgoritmosService } from './service';

describe('Huella: conservar algoritmo por cultivo y banco de pruebas', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-09-13T12:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it.each([
    'Trigo',
    'Soja',
    'Maiz',
    'Cebada',
    'Arveja',
    'Papa',
    'Vid',
    'Manzano',
    'Peral',
    'Pecan',
  ])(
    '%s no exige fenologia manual ni acepta una ETc ajena como sustitucion silenciosa',
    (cultivo) => {
      const params: any = {
        siembra: {
          fechaSiembra: '2026-09-01',
          fechaCosecha: '2026-09-03',
          semilla: { cultivo },
          rendimientoObtenidoKgHaSeco: 1000,
          lluviasPromedio: '< 600',
          fijacionN: '0',
          manejoAgronomico: 'Bueno',
          intensidadLluvias: 'Suaves',
          materiaOrganica: '< 1',
          labranza: 'Siembra Directa',
        },
        lote: {
          depositoN: '< 0.5',
          texturaLixiviacion: 'Franco',
          texturaEscorrentia: 'Franco',
          drenajeNaturalLixiviacion: 'Bien Drenado',
          drenajeNaturalEscorrentia: 'Bien Drenado',
          erosionEscorrentiaPendiente: 'Baja (0 - 3%)',
          contenidoP: '< 12',
        },
        clima: [1, 2, 3].map((d) => ({
          fecha: `2026-09-0${d}`,
          lluviaMm: 1,
          et0Mm: 4,
        })),
        riegos: [{ laminaMm: 2 }],
      };
      const final = calcularHuellaHidrica(params);
      const seguimiento = calcularSeguimientoHuellaHidrica(params);
      const conRegistro: any = JSON.parse(JSON.stringify(params));
      conRegistro.siembra.registrosFenologicos = [
        { etapa: 'Brotacion', fechaInicioEtapa: '2026-09-01' },
      ];
      conRegistro.clima.forEach((d) => {
        d.kc = 99;
        d.etcMm = 999;
      });
      expect(calcularHuellaHidrica(conRegistro)).toEqual(final);
      expect(calcularSeguimientoHuellaHidrica(conRegistro)).toEqual(
        seguimiento,
      );
      expect(final.parciales.etAzulMm).toBeLessThanOrEqual(2);
      const banco = Object.create(
        AlgoritmosService.prototype,
      ) as AlgoritmosService;
      expect(banco.simularHuellaHidrica(params)).toEqual(final);
      expect(banco.simularSeguimientoHuellaHidrica(params)).toEqual(
        seguimiento,
      );
    },
  );
});
