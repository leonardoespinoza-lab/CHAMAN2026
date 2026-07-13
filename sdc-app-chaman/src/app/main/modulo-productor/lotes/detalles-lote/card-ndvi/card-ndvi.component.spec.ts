import { CardNDVIComponent } from './card-ndvi.component';

describe('CardNDVIComponent - historial satelital', () => {
  function createComponent(): CardNDVIComponent {
    return new CardNDVIComponent({ notifWarn: () => undefined } as any, {} as any, {} as any, {} as any, {} as any);
  }

  it('asocia cada escena con la etapa de su propia fecha y prioriza el registro de campo', () => {
    const component = createComponent();
    component.siembra = {
      fechaSiembra: '2026-07-01T00:00:00.000Z',
      semilla: { cultivo: 'Soja', variedad: 'Test' },
      crono: {
        cultivo: 'Soja',
        etapas: {
          siembra_emergencia: 5,
          emergencia_R1: 20,
          R1_R3: 20,
          R3_R5: 20,
          R5_R7: 20,
        },
      },
      registrosFenologicos: [{ fecha: '2026-07-08T00:00:00.000Z', etapa: 'E - Emergencia observada' }],
    } as any;
    component.ndvis = [
      {
        _id: 'later',
        fechaDeLaImagen: '2026-07-10T00:00:00.000Z',
        indices: { ndvi: 0.42 },
        coleccion: 'Sentinel-2',
      },
      {
        _id: 'earlier',
        fechaDeLaImagen: '2026-07-03T00:00:00.000Z',
        indices: { ndvi: 0.21 },
        coleccion: 'Sentinel-2',
      },
    ];
    component.reporte = component.ndvis[1];

    (component as any).actualizarHistorialIndice();

    expect(component.historialIndice[0].stage.name).toBe('Siembra');
    expect(component.historialIndice[0].stage.confirmed).toBeFalse();
    expect(component.historialIndice[1].stage.name).toBe('E - Emergencia observada');
    expect(component.historialIndice[1].stage.confirmed).toBeTrue();
    expect(component.historialIndiceOptions?.series?.length).toBe(1);
  });

  it('no inventa una etapa historica de Arveja cuando faltan GDD por fecha', () => {
    const component = createComponent();
    component.siembra = {
      fechaSiembra: '2026-07-01T00:00:00.000Z',
      semilla: {
        cultivo: 'Arveja',
        fenologiaReferencia: {
          unidadEtapas: 'grados_dia',
          temperaturaBaseC: 0,
          rangosTermicos: { S_E: { min: 125, max: 140 } },
        },
      },
    } as any;
    component.ndvis = [
      {
        _id: 'pea',
        fechaDeLaImagen: '2026-07-08T00:00:00.000Z',
        indices: { savi: 0.31 },
      },
    ];
    component.reporte = component.ndvis[0];
    component.capaSatelitalActiva = 'savi';

    (component as any).actualizarHistorialIndice();

    expect(component.historialIndice[0].stage.name).toContain('Etapa térmica sin confirmar');
    expect(component.historialIndice[0].stage.source).toContain('GDD histórico');
    expect(component.historialIndice[0].stage.confirmed).toBeFalse();
  });
});
