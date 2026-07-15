import { DataQualityStripComponent } from './data-quality-strip.component';

describe('DataQualityStripComponent calidad de riego', () => {
  let component: DataQualityStripComponent;

  beforeEach(() => {
    component = new DataQualityStripComponent();
    component.lote = { dispositivos: [] } as any;
  });

  it('ignora agua util cero y filas heredadas si el calculo no esta disponible', () => {
    component.siembra = {
      estadoCalculoAguaUtil: 'no_disponible',
      estadoRecomendacionRiego: 'no_disponible',
      aguaUtilReal: 0,
      ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 0 }],
    } as any;

    const riego = component.items.find((item) => item.label === 'Riego');
    expect(riego?.value).toBe('Sin datos validos');
    expect(riego?.source).toBe('Sin fuente valida');
    expect(riego?.score).toBe(38);
    expect(riego?.detail).toContain('no disponible, fallida o sin estado');
  });

  it('conserva el balance con estado estimado y lo rotula como modelo', () => {
    component.siembra = {
      estadoCalculoAguaUtil: 'estimado',
      estadoRecomendacionRiego: 'estimada',
      fuenteRecomendacionRiego: 'balance_climatico',
      aguaUtilReal: 0,
      ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 0 }],
    } as any;

    const riego = component.items.find((item) => item.label === 'Riego');
    expect(riego?.value).toBe('Modelo estimado');
    expect(riego?.source).toBe('ET0 + cultivo + suelo');
    expect(riego?.score).toBe(62);
    expect(riego?.detail).toContain('ceros validos');
  });

  it('no confunde una estimacion vacia con ausencia de demanda', () => {
    component.siembra = {
      estadoRecomendacionRiego: 'estimada',
      fuenteRecomendacionRiego: 'balance_climatico',
      ultimaPrediccionRiego: [],
    } as any;

    const riego = component.items.find((item) => item.label === 'Riego');
    expect(riego?.value).toBe('Estimacion pendiente');
    expect(riego?.score).toBe(45);
    expect(riego?.detail).toContain('no equivale a ausencia de demanda');
  });

  it('no eleva calidad por el solo hecho de tener sensor si la recomendacion fallo', () => {
    component.lote = { idSondaSuelo: 'sonda-1' } as any;
    component.siembra = {
      estadoRecomendacionRiego: 'fallida',
      fuenteRecomendacionRiego: 'sensor_suelo',
      ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 5 }],
    } as any;

    const riego = component.items.find((item) => item.label === 'Riego');
    expect(riego?.value).toBe('Sensor sin recomendacion');
    expect(riego?.score).toBe(52);
    expect(riego?.detail).toContain('fallida');
  });
});
