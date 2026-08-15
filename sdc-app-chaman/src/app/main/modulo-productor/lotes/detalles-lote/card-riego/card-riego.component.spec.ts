import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { CardRiegoComponent } from './card-riego.component';

describe('CardRiegoComponent', () => {
  let component: CardRiegoComponent;

  beforeEach(() => {
    component = new CardRiegoComponent({} as HelperService);
  });

  it('no convierte agua util no disponible ni recomendaciones heredadas en ceros reales', () => {
    configure(false, 'no_disponible', 0, [0, 0]);

    expect(component.aguaUtilValor).toBeNull();
    expect(component.cantidadRecomendacionHoy).toBeNull();
    expect(component.recomendacionesPositivas).toEqual([]);
    expect(component.etiquetaHoy).toBe('Sin dato');
    expect(component.resumen).toContain('recomendacion real no disponible');
  });

  it('conserva un balance modelado valido y lo identifica como estimacion', () => {
    configure(false, 'estimado', 38.5, [4, 0]);

    expect(component.esBalanceEstimado).toBeTrue();
    expect(component.aguaUtilValor).toBe(38.5);
    expect(component.etiquetaAguaUtil).toBe('Estimacion modelada');
    expect(component.cantidadRecomendacionHoy).toBe(4);
    expect(component.recomendacionesPositivas.map((item) => item.cantidad)).toEqual([4]);
    expect(component.etiquetaHoy).toBe('Estimacion modelada');
    expect(component.resumen).toContain('Balance estimado');
  });

  it('mantiene cero como resultado valido con sensor, pero no lo lista como aporte recomendado', () => {
    configure(true, 'calculado', 0, [0, 7]);

    expect(component.aguaUtilValor).toBe(0);
    expect(component.cantidadRecomendacionHoy).toBe(0);
    expect(component.etiquetaHoy).toBe('Sin riego sugerido');
    expect(component.recomendacionesPositivas.map((item) => item.cantidad)).toEqual([7]);
    expect(component.proximoRiego?.cantidad).toBe(7);
  });

  it('mantiene la etiqueta de estimacion aunque exista un sensor asignado', () => {
    configure(true, 'estimado', 25, [2, 0]);

    expect(component.esBalanceEstimado).toBeFalse();
    expect(component.esCalculoEstimado).toBeTrue();
    expect(component.etiquetaAguaUtil).toBe('Estimacion modelada');
    expect(component.etiquetaHoy).toBe('Estimacion modelada');
    expect(component.resumen).toContain('Balance estimado');
  });

  it('no habilita recomendaciones por tener sensor cuando el estado es fallido', () => {
    configure(true, 'fallida', 0, [6]);

    expect(component.tieneLanzaHumedad).toBeTrue();
    expect(component.puedeMostrarSerieRiego).toBeFalse();
    expect(component.cantidadRecomendacionHoy).toBeNull();
    expect(component.recomendaciones).toEqual([]);
    expect(component.resumen).toContain('fallo');
  });

  it('no expone el drawer legacy que promedia curvas y profundidades', () => {
    configure(true, 'calculado', 20, [3, 0]);

    expect(component.puedeAbrirCurvasLegacy).toBeFalse();
    expect((component as any).abrirDrawerRiego).toBeUndefined();
  });

  it('Arturo con sonda y sin siembra pide crear campania, sin publicar 0 mm', () => {
    component.lote = {
      dispositivos: [
        {
          tipo: 'Otro',
          servicios: [
            {
              id: 'perfil-arturo',
              tipo: 'perfil_suelo',
              nombre: 'Sentek Arturo',
              sensores: ['Humedad Suelo Profundidad'],
            },
          ],
        },
      ],
    } as any;
    component.siembra = undefined;

    expect(component.tieneLanzaHumedad).toBeTrue();
    expect(component.cantidadRecomendacionHoy).toBeNull();
    expect(component.resumen).toBe(
      'Sonda activa · falta crear/activar campaña y configurar cultivo.',
    );
  });

  it('oculta una serie accionable vieja cuando la campania de la sonda ya no esta vigente', () => {
    component.lote = {
      dispositivos: [{ tipo: 'Sensor de Humedad de Suelo' }],
    } as any;
    component.siembra = {
      fechaSiembra: '2024-05-07',
      fechaCosecha: null,
      activa: true,
      semilla: { cultivo: 'Pecan' },
      estadoCalculoAguaUtil: 'estimado',
      estadoRecomendacionRiego: 'estimada',
      fuenteRecomendacionRiego: 'balance_climatico',
      aguaUtilReal: 55,
      ultimaPrediccionRiego: [{ fecha: '2024-05-08', cantidad: 7 }],
    } as any;

    expect(component.campaniaRiegoVigente).toBeFalse();
    expect(component.resumen).toContain('campaña desactualizada');
    expect(component.cantidadRecomendacionHoy).toBeNull();
    expect(component.recomendacionHoy).toBeUndefined();
    expect(component.recomendaciones).toEqual([]);
    expect(component.puedeMostrarSerieRiego).toBeFalse();
    expect(component.esCalculoEstimado).toBeFalse();
    expect(component.etiquetaMotorRiego).toBe('Recomendación no disponible');
  });

  it('informa estimacion pendiente cuando la serie esta vacia', () => {
    configure(false, 'estimado', 20, []);

    expect(component.esCalculoEstimado).toBeTrue();
    expect(component.sinDemandaRiego).toBeFalse();
    expect(component.puedeMostrarSerieRiego).toBeFalse();
    expect(component.resumen).toContain('pendiente');
    expect(component.resumen).not.toContain('sin demanda');
  });

  it('no interpreta una serie de ceros como ausencia de demanda si el balance hidrico es invalido', () => {
    configure(false, 'estimado', Number.NaN, [0, 0]);

    expect(component.estadoAguaUtilValido).toBeFalse();
    expect(component.puedeMostrarSerieRiego).toBeFalse();
    expect(component.cantidadRecomendacionHoy).toBeNull();
    expect(component.sinDemandaRiego).toBeFalse();
    expect(component.resumen).toContain('Sin recomendacion operativa');
  });

  it('descarta cantidades ausentes, negativas o no finitas', () => {
    component.lote = { dispositivos: [{ tipo: 'Sensor de Humedad de Suelo' }] } as any;
    component.siembra = {
      fechaSiembra: new Date().toISOString(),
      fechaCosecha: null,
      activa: true,
      semilla: { cultivo: 'Trigo' },
      estadoCalculoAguaUtil: 'calculado',
      estadoRecomendacionRiego: 'calculada',
      fuenteRecomendacionRiego: 'sensor_suelo',
      aguaUtilReal: Number.NaN,
      ultimaPrediccionRiego: [
        { fecha: '2026-07-14' },
        { fecha: '2026-07-15', cantidad: -1 },
        { fecha: '2026-07-16', cantidad: Number.POSITIVE_INFINITY },
      ],
    } as any;

    expect(component.aguaUtilValor).toBeNull();
    expect(component.recomendaciones).toEqual([]);
    expect(component.cantidadRecomendacionHoy).toBeNull();
  });

  function configure(
    sensor: boolean,
    estado: 'calculado' | 'estimado' | 'no_disponible' | 'fallida',
    aguaUtilReal: number,
    cantidades: number[]
  ): void {
    component.lote = {
      dispositivos: sensor ? [{ tipo: 'Sensor de Humedad de Suelo' }] : [],
    } as any;
    component.siembra = {
      fechaSiembra: new Date().toISOString(),
      fechaCosecha: null,
      activa: true,
      semilla: { cultivo: 'Trigo' },
      estadoCalculoAguaUtil: estado,
      estadoRecomendacionRiego: estado === 'calculado' ? 'calculada' : estado === 'estimado' ? 'estimada' : estado,
      fuenteRecomendacionRiego:
        estado === 'estimado' ? 'balance_climatico' : sensor && estado === 'calculado' ? 'sensor_suelo' : undefined,
      aguaUtilReal,
      ultimaPrediccionRiego: cantidades.map((cantidad, index) => ({
        fecha: `2026-07-${String(14 + index).padStart(2, '0')}`,
        cantidad,
      })),
    } as any;
  }
});
