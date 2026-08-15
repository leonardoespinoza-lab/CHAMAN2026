import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { IDispositivo } from 'modelos/src';

import { LorawanUplinksService } from '../../../../auxiliares/http/lorawan-uplinks.service';
import { ReporteService } from '../../../../auxiliares/http/reporte.service';
import { DetallesDispositivoComponent } from './detalles-dispositivo.component';
import { GraficoHistoricoSueloComponent } from './grafico-historico-suelo/grafico-historico-suelo.component';

describe('DetallesDispositivoComponent', () => {
  let component: DetallesDispositivoComponent;
  let fixture: ComponentFixture<DetallesDispositivoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetallesDispositivoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DetallesDispositivoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('consulta y representa el mismo periodo crudo en 24 h, 7 dias y 30 dias', async () => {
    const reportes = TestBed.inject(ReporteService);
    const uplinks = TestBed.inject(LorawanUplinksService);
    const historicoSpy = spyOn(reportes, 'historico').and.resolveTo({ datos: [] } as any);
    const rawHistorySpy = spyOn(uplinks, 'rawHistory').and.resolveTo([]);
    const dispositivo = {
      _id: 'device-sentek',
      deveui: '24E124454E358347',
      nombre: 'Controlador Arturo',
      tipo: 'Sensor de Humedad de Suelo',
      configuracionLecturas: {
        perfilSuelo: { profundidadesCm: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] },
      },
    } as IDispositivo;

    (component as any).setDispositivo(dispositivo);
    component.historicoHasta = '2026-01-01T00:00:00.000Z';

    for (const [dias, limite] of [
      [1, 1000],
      [7, 4000],
      [30, 12000],
    ] as const) {
      await component.cambiarPeriodoHistorico(dias);
      expect(historicoSpy).toHaveBeenCalledWith('device-sentek', dias, 2500);
      expect(rawHistorySpy).toHaveBeenCalledWith('24E124454E358347', dias, limite);
    }

    expect(component.historicoHasta).not.toBe('2026-01-01T00:00:00.000Z');
    fixture.detectChanges();
    const grafico = fixture.debugElement.query(By.directive(GraficoHistoricoSueloComponent))
      .componentInstance as GraficoHistoricoSueloComponent;
    expect(grafico.periodDays).toBe(30);
    expect(grafico.periodEnd).toBe(component.historicoHasta);
  });

  it('no permite que una respuesta vieja reemplace el periodo mas reciente', async () => {
    const reportes = TestBed.inject(ReporteService);
    const uplinks = TestBed.inject(LorawanUplinksService);
    spyOn(reportes, 'historico').and.resolveTo({ datos: [] } as any);
    const resolvers = new Map<number, (frames: any[]) => void>();
    spyOn(uplinks, 'rawHistory').and.callFake(
      (_devEUI, dias) => new Promise((resolve) => resolvers.set(dias ?? 7, resolve))
    );
    (component as any).setDispositivo({
      _id: 'device-sentek',
      deveui: '24E124454E358347',
      tipo: 'Sensor de Humedad de Suelo',
    } as IDispositivo);

    const sieteDias = component.cambiarPeriodoHistorico(7);
    const treintaDias = component.cambiarPeriodoHistorico(30);
    resolvers.get(30)?.([{ id: 'periodo-actual' }]);
    await treintaDias;
    resolvers.get(7)?.([{ id: 'respuesta-vieja' }]);
    await sieteDias;

    expect(component.rawFrames.map((frame) => frame.id)).toEqual(['periodo-actual']);
    expect(component.diasHistorico).toBe(30);
  });
});
