import {
  calcularFinCicloSoja,
  calcularRoyaHoja,
  gradosDiaRoyaMaiz,
} from 'modelos/src';
import { AlgoritmosService } from './service';

describe('simulador admin y motor canonico de enfermedades', () => {
  const service = new AlgoritmosService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );

  it('usa la resistencia de la campania mas reciente y la misma formula de roya de maiz', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Maiz',
      variedad: 'Hibrido prueba',
      etapa: 'Emergencia',
      humedadRelativa: 96,
      lluvia48h: 0,
      temperatura: 17,
      diasSimulados: 2,
      resistencia: [
        {
          idEnfermedad: 'maiz.roya',
          enfermedad: 'Roya del Maiz',
          multiplicador: 0.35,
          estado: 'historica',
          campaniaFuente: '24/25',
          fuente: 'fuente anterior',
        },
        {
          idEnfermedad: 'maiz.roya',
          enfermedad: 'Roya del Maiz',
          multiplicador: 0.8,
          estado: 'observada',
          campaniaFuente: '25/26',
          fuente: 'fuente vigente',
        },
      ],
    });
    const roya = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'maiz.roya',
    );
    const gd = gradosDiaRoyaMaiz(96, 17) * 2;
    const esperado = calcularRoyaHoja(gd, 2, 1 / 3);

    expect(roya.riesgo).toBeCloseTo(esperado, 1);
    expect(roya.resistenciaCampania).toBe('25/26');
    expect(roya.resistenciaFuente).toBe('fuente vigente');
  });

  it('no confunde una resistencia desconocida con un dato observado', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Maiz',
      etapa: 'Emergencia',
      humedadRelativa: 96,
      lluvia48h: 0,
      temperatura: 17,
      susceptibilidad: 0.2,
      diasSimulados: 1,
      resistencia: [
        {
          idEnfermedad: 'maiz.roya',
          enfermedad: 'Roya del Maiz',
          multiplicador: 1,
          estado: 'desconocida',
          campaniaFuente: '25/26',
          fuente: 'sin dato varietal publicado',
        },
      ],
    });
    const roya = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'maiz.roya',
    );

    expect(roya.resistenciaEstado).toBe('desconocida');
    expect(roya.susceptibilidad).toBe(1);
    expect(roya.resistenciaFuente).toBe('sin dato varietal publicado');
  });

  it('reproduce la formula compartida de fin de ciclo de soja', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Soja',
      etapa: 'R3',
      lluvia48h: 20,
      diasSimulados: 3,
      resistencia: [
        {
          idEnfermedad: 'soja.fin_ciclo',
          enfermedad: 'Fin de Ciclo',
          multiplicador: 0.5,
          estado: 'observada',
          campaniaFuente: '25/26',
        },
      ],
    });
    const finCiclo = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'soja.fin_ciclo',
    );

    expect(finCiclo.riesgo).toBeCloseTo(calcularFinCicloSoja(90, 0.5), 1);
  });

  it('declara tizon foliar sin modelo en vez de fabricar riesgo', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Maiz',
      etapa: 'VT',
      humedadRelativa: 90,
      lluvia48h: 30,
      temperatura: 23,
    });
    const tizon = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'maiz.tizon_foliar',
    );

    expect(tizon.nivel).toBe('sin modelo científico validado');
    expect(tizon.riesgo).toBe(0);
  });

  it('simula el screening de mildiu de arveja sin presentarlo como porcentaje', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Arveja',
      variedad: 'KINGFISHER',
      etapa: 'E',
      humedadRelativa: 94,
      horasMojado: 6,
      lluvia48h: 2,
      temperatura: 16,
    });
    const mildiu = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'arveja.mildiu',
    );

    expect(result.modo).toBe('screening_ambiental');
    expect(mildiu.nivel).toBe('alto');
    expect(mildiu.riesgo).toBe(80);
    expect(mildiu.resistenciaEstado).toBe('desconocida');
    expect(result.trazas.join(' ')).toContain('no son porcentajes');
  });

  it('mantiene oidio de arveja fuera de ventana antes de floracion', () => {
    const result: any = service.simularEnfermedades({
      cultivo: 'Arveja',
      etapa: 'E',
      humedadRelativa: 70,
      horasMojado: 0,
      lluvia48h: 0,
      temperatura: 24,
    });
    const oidio = result.enfermedades.find(
      (item: any) => item.idEnfermedad === 'arveja.oidio',
    );

    expect(oidio.nivel).toBe('fuera de ventana');
    expect(oidio.riesgo).toBe(0);
  });
});
