import { TestBed } from '@angular/core/testing';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { CardUbicacionLoteComponent } from './card-ubicacion-lote.component';

describe('CardUbicacionLoteComponent information dialog', () => {
  let component: CardUbicacionLoteComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LoteService, useValue: {} },
        { provide: HelperService, useValue: {} },
      ],
    });
    component = TestBed.runInInjectionContext(() => new CardUbicacionLoteComponent());
  });

  it('shows the manual conflict once and keeps unrelated warnings', () => {
    component.ubicacion = {
      loteId: 'lote-1',
      estado: 'partial',
      conflictoManual: {
        existe: true,
        detalle: 'La ubicacion manual no coincide con GeoRef.',
      },
      advertencias: [
        'La ubicacion manual no coincide con GeoRef.',
        ' la ubicaci\u00f3n manual no coincide con georef. ',
        'El lote cruza una jurisdiccion administrativa.',
      ],
    } as any;

    expect(component.informationWarnings).toEqual(['El lote cruza una jurisdiccion administrativa.']);
    expect(component.informationObservationCount).toBe(2);
  });
});
