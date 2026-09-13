import { TestBed } from '@angular/core/testing';
import { SiembraService } from '../../../../auxiliares/http/siembra.service';
import { ReporteService } from '../../../../auxiliares/http/reporte.service';
import { CardFrioTermicoComponent } from './card-frio-termico/card-frio-termico.component';
import { CardCalculosMeteorologicosComponent } from './card-calculos-meteorologicos/card-calculos-meteorologicos.component';
import { CardDemandaHidricaComponent } from './card-demanda-hidrica/card-demanda-hidrica.component';
import { CardRiesgosAgroclimaticosComponent } from './card-riesgos-agroclimaticos/card-riesgos-agroclimaticos.component';

describe('Renovacion de cuadros despues de registrar fenologia', () => {
  const sow = (id: string): any => ({
    _id: id,
    idLote: 'l1',
    fechaSiembra: '2020-01-01',
    semilla: { cultivo: 'Peral' },
    registrosFenologicos: [],
  });
  const changed = (s: any): any => ({
    ...s,
    registrosFenologicos: [
      { id: 'brota', etapa: 'Brotacion', tipoEvento: 'inicio_etapa', fechaInicioEtapa: new Date().toISOString() },
    ],
  });
  const response: any = {
    summary: {},
    dataSource: { type: 'open_meteo', completenessPercentage: 100 },
    series: [{ date: '2026-09-13', weather: {}, metrics: {}, warnings: [], qualityFlags: [] }],
    warnings: [],
  };
  it('frio y calculos vuelven a consultar sin solicitar otro reproceso', async () => {
    const api = {
      agrometeorologia: jasmine.createSpy().and.resolveTo(response),
      reprocesarAgrometeorologia: jasmine.createSpy().and.resolveTo(response),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SiembraService, useValue: api },
        { provide: ReporteService, useValue: {} },
      ],
    });
    const cold = TestBed.runInInjectionContext(() => new CardFrioTermicoComponent());
    spyOn<any>(cold, 'prepararVista');
    cold.siembra = sow('cold-revision-test');
    await cold.cargar();
    cold.siembra = changed(cold.siembra);
    await cold.cargar();
    expect(api.agrometeorologia).toHaveBeenCalledTimes(2);
    const calc = TestBed.runInInjectionContext(() => new CardCalculosMeteorologicosComponent());
    spyOn<any>(calc, 'prepararVista');
    calc.siembra = sow('calc-revision-test');
    await calc.cargar();
    calc.siembra = changed(calc.siembra);
    await calc.cargar();
    expect(api.agrometeorologia).toHaveBeenCalledTimes(4);
    expect(api.reprocesarAgrometeorologia).not.toHaveBeenCalled();
  });
  it('demanda hidrica invalida su cache tras registrar una etapa', async () => {
    const api = { agrometeorologia: jasmine.createSpy().and.resolveTo(response) };
    const c = new CardDemandaHidricaComponent(api as any);
    spyOn<any>(c, 'aplicar');
    c.siembra = sow('water-revision-test');
    await c.cargar();
    c.siembra = changed(c.siembra);
    await c.cargar();
    expect(api.agrometeorologia).toHaveBeenCalledTimes(2);
  });
  it('riesgos separa identidades, registros y respuestas fuera de orden', async () => {
    let finishOld!: (r: any) => void;
    const api = {
      listarRiesgosAgroclimaticos: jasmine
        .createSpy()
        .and.returnValues(new Promise((r) => (finishOld = r)), Promise.resolve({ cultivo: 'NUEVO' })),
    };
    const c = new CardRiesgosAgroclimaticosComponent({} as any, api as any);
    c.lote = { _id: 'l1', ubicacion: { centro: { lat: -39, lng: -67 } } } as any;
    c.siembra = sow('risk-revision-test');
    const key = (c as any).requestKey();
    const first = c.cargar();
    c.siembra = changed(c.siembra);
    expect((c as any).requestKey()).not.toBe(key);
    await c.cargar();
    finishOld({ cultivo: 'ANTERIOR' });
    await first;
    expect((c.riesgos as any).cultivo).toBe('NUEVO');
    const revised = (c as any).requestKey();
    c.siembra = { ...c.siembra, _id: 'otra' };
    expect((c as any).requestKey()).not.toBe(revised);
  });
});
