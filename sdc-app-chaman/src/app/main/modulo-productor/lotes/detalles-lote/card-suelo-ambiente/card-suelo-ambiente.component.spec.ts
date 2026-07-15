import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { CardSueloAmbienteComponent } from './card-suelo-ambiente.component';

describe('CardSueloAmbienteComponent request lifecycle', () => {
  let loteService: {
    sueloAmbiente: jasmine.Spy;
    reprocesarSueloAmbiente: jasmine.Spy;
  };
  let component: CardSueloAmbienteComponent;

  beforeEach(() => {
    loteService = {
      sueloAmbiente: jasmine.createSpy('sueloAmbiente'),
      reprocesarSueloAmbiente: jasmine.createSpy('reprocesarSueloAmbiente'),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: LoteService, useValue: loteService },
        { provide: HelperService, useValue: { notifError: jasmine.createSpy('notifError') } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new CardSueloAmbienteComponent());
  });

  afterEach(() => component.ngOnDestroy());

  it('does not reload when only the lot object reference changes', async () => {
    loteService.sueloAmbiente.and.resolveTo({ status: 'ready' });
    const first = lot('lot-1', -34.1);
    component.lote = first;
    component.ngOnChanges({ lote: new SimpleChange(undefined, first, true) });
    await flushPromises();

    const refreshedReference = { ...first, nombre: 'Lote actualizado' };
    component.lote = refreshedReference;
    component.ngOnChanges({ lote: new SimpleChange(first, refreshedReference, false) });
    await flushPromises();

    expect(loteService.sueloAmbiente).toHaveBeenCalledTimes(1);
  });

  it('ignores a response from a lot that is no longer active', async () => {
    const firstRequest = deferred<any>();
    const secondRequest = deferred<any>();
    loteService.sueloAmbiente.and.returnValues(firstRequest.promise, secondRequest.promise);

    const first = lot('lot-1', -34.1);
    component.lote = first;
    component.ngOnChanges({ lote: new SimpleChange(undefined, first, true) });

    const second = lot('lot-2', -35.2);
    component.lote = second;
    component.ngOnChanges({ lote: new SimpleChange(first, second, false) });

    firstRequest.resolve({ status: 'ready', loteId: 'lot-1' });
    await flushPromises();
    expect(component.assessment).toBeUndefined();

    secondRequest.resolve({ status: 'ready', loteId: 'lot-2' });
    await flushPromises();
    expect(component.assessment?.loteId).toBe('lot-2');
  });

  it('clears state and polling when the lot becomes unavailable', async () => {
    loteService.sueloAmbiente.and.resolveTo({ status: 'processing' });
    const current = lot('lot-1', -34.1);
    component.lote = current;
    component.ngOnChanges({ lote: new SimpleChange(undefined, current, true) });
    await flushPromises();

    component.lote = undefined;
    component.ngOnChanges({ lote: new SimpleChange(current, undefined, false) });

    expect(component.assessment).toBeUndefined();
    expect(component.loading).toBeFalse();
  });

  it('keeps canonical cartography primary and exposes a confirmed override separately', () => {
    component.lote = {
      _id: 'lot-1',
      sueloConfirmadoPorUsuario: true,
      sueloProcedencia: 'manual',
    };
    component.assessment = {
      loteId: 'lot-1',
      status: 'ready',
      summary: {
        canonicalTexture: 'Franco limoso',
        estimatedTexture: 'Franco limoso',
        operationalTexture: 'Arcilloso',
        operationalTextureSource: 'manual',
        depthFromCm: 0,
        depthToCm: 30,
      },
      sources: [
        { type: 'inta', provider: 'INTA', confidence: 'medium' },
        { type: 'soilgrids', provider: 'SoilGrids', confidence: 'medium' },
      ],
    };

    expect(component.canonicalTextureLabel).toBe('Franco limoso');
    expect(component.operationalTextureLabel).toBe('Arcilloso');
    expect(component.hasOperationalOverride).toBeTrue();
    expect(component.sourceLabel).toBe('INTA + SoilGrids');
    expect(component.operationalSourceLabel).toBe('Confirmado por usuario');
  });

  it('shows an unconfirmed manual value as legacy instead of confirmed', () => {
    component.lote = {
      _id: 'lot-legacy',
      sueloProcedencia: 'manual',
    };
    component.assessment = {
      loteId: 'lot-legacy',
      status: 'ready',
      source: { type: 'manual', confidence: 'low' },
      summary: {
        canonicalTexture: 'Franco limoso',
        estimatedTexture: 'Franco limoso',
        operationalTexture: 'Arcilloso',
        operationalTextureSource: 'manual',
        depthFromCm: 0,
        depthToCm: 30,
      },
      manualConflict: true,
    };

    expect(component.hasOperationalOverride).toBeTrue();
    expect(component.isOperationalTextureConfirmed).toBeFalse();
    expect(component.sourceLabel).toBe('Solo dato legacy');
    expect(component.operationalTextureTitle).toBe('Alternativa legacy');
    expect(component.operationalSourceLabel).toBe('Dato legacy no confirmado');
    expect(component.operationalConflictTitle).toContain('alternativa legacy');
  });

  it('separates hydraulic confidence, fallback depth and INTA limitations', () => {
    component.lote = {
      _id: 'lot-small',
      ubicacionAdministrativa: {
        loteId: 'lot-small',
        estado: 'ready',
        confianza: 'media',
        superficieCalculadaM2: 29_600,
      },
    };
    component.assessment = {
      loteId: 'lot-small',
      status: 'ready',
      summary: {
        depthFromCm: 0,
        depthToCm: 30,
        availableWaterMmPerMeter: 158,
        profileAvailableWaterMm: 158,
        drainageClass: 'imperfect',
        effectiveDepthCm: 100,
        effectiveDepthSource: 'operational_fallback',
        effectiveDepthConfidence: 'low',
        effectiveDepthIsFallback: true,
      },
      source: {
        type: 'mixed',
        confidence: 'medium',
        confidenceFactors: ['El lote es menor que una celda SoilGrids de 250 m.'],
      },
      sources: [{ type: 'soilgrids', confidence: 'low', resolutionMeters: 250 }],
      propertyProvenance: {
        availableWaterMmPerMeter: {
          value: 158,
          unit: 'mm/m',
          source: 'soilgrids',
          observedOrEstimated: 'estimated',
          confidence: 'medium',
        },
      },
      soilUnits: [
        {
          source: 'inta_local',
          limitations: ['Drenaje imperfecto', 'Salinidad', 'salinidad'],
        },
      ],
    };

    expect(component.confidenceLabel).toBe('Confianza media');
    expect(component.hydraulicConfidence).toBe('low');
    expect(component.hydraulicConfidenceLabel).toBe('Confianza hídrica baja');
    expect(component.effectiveDepthDescription).toContain('fallback; no medido');
    expect(component.isSmallerThanSoilGridsCell).toBeTrue();
    expect(component.soilGridsScaleWarning).toContain('2,96 ha');
    expect(component.intaLimitations).toEqual(['Drenaje: Imperfecto', 'Drenaje imperfecto', 'Salinidad']);
  });
});

function lot(id: string, longitude: number): any {
  return {
    _id: id,
    ubicacion: {
      geojson: {
        type: 'Polygon',
        coordinates: [
          [
            [longitude, -32],
            [longitude + 0.01, -32],
            [longitude, -31.99],
            [longitude, -32],
          ],
        ],
      },
    },
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
