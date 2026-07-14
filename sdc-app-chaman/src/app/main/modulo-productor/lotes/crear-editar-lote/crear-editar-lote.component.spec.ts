import { CrearEditarLoteComponent } from './crear-editar-lote.component';

describe('CrearEditarLoteComponent soil payload', () => {
  it('omits every soil field during a neutral edit', () => {
    const component = createComponent({
      nombre: 'Lote original',
      capacidadDeCampo: 30,
      puntoMarchitez: 14,
      texturaLixiviacion: 'Franco',
      texturaEscorrentia: 'Franco',
      sueloReferencia: { texturaSuperficial: 'Franco' },
      suelos: [
        {
          profundidad: 20,
          textura: 'Franco',
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
        },
      ],
    });
    component.form?.get('nombre')?.setValue('Lote renombrado');

    const data = getData(component);

    for (const field of SOIL_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(data, field)).toBeFalse();
    }
  });

  it('sends only CC when only CC was explicitly edited and preserves every layer', () => {
    const layers = [
      {
        profundidad: 20,
        textura: 'Arcilloso',
        capacidadDeCampo: 40,
        puntoMarchitez: 22,
      },
      {
        profundidad: 40,
        textura: 'Franco arenoso',
        capacidadDeCampo: 22,
        puntoMarchitez: 10,
      },
    ];
    const component = createComponent({
      capacidadDeCampo: 30,
      sueloReferencia: { texturaSuperficial: 'Franco' },
      suelos: layers,
    });
    const layersBeforeEdit = component.suelos.getRawValue();
    component.form?.get('capacidadDeCampo')?.setValue(33);
    component.form?.get('capacidadDeCampo')?.markAsDirty();

    const data = getData(component);

    expect(data.capacidadDeCampo).toBe(33);
    for (const field of SOIL_FIELDS.filter((name) => name !== 'capacidadDeCampo')) {
      expect(Object.prototype.hasOwnProperty.call(data, field)).toBeFalse();
    }
    expect(component.suelos.getRawValue()).toEqual(layersBeforeEdit);
  });

  it('sends only PMP when only PMP was explicitly edited', () => {
    const component = createComponent({
      capacidadDeCampo: 30,
      puntoMarchitez: 14,
      suelos: [
        {
          profundidad: 20,
          textura: 'Franco',
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
        },
      ],
    });
    const layersBeforeEdit = component.suelos.getRawValue();
    component.form?.get('puntoMarchitez')?.setValue(16);
    component.form?.get('puntoMarchitez')?.markAsDirty();

    const data = getData(component);

    expect(data.puntoMarchitez).toBe(16);
    for (const field of SOIL_FIELDS.filter((name) => name !== 'puntoMarchitez')) {
      expect(Object.prototype.hasOwnProperty.call(data, field)).toBeFalse();
    }
    expect(component.suelos.getRawValue()).toEqual(layersBeforeEdit);
  });

  it('serializes automatic probe layers as mapping only, without null physical values', () => {
    const component = createComponent();
    component.dispositivos = [
      {
        _id: 'probe-1',
        nombre: 'Lanza de humedad',
        sensores: ['Humedad suelo 10 cm', 'Humedad suelo 20 cm'] as any,
      },
    ];
    component.form?.get('idsDispositivo')?.setValue(['probe-1']);

    component.onDispositivosChange();
    const data = getData(component);

    expect(data.suelos?.length).toBe(2);
    expect(data.suelos?.[0]).toEqual({
      numeroDeSensor: 1,
      profundidad: 10,
      hayRaices: true,
    });
    for (const layer of data.suelos || []) {
      expect(Object.prototype.hasOwnProperty.call(layer, 'textura')).toBeFalse();
      expect(Object.prototype.hasOwnProperty.call(layer, 'capacidadDeCampo')).toBeFalse();
      expect(Object.prototype.hasOwnProperty.call(layer, 'puntoMarchitez')).toBeFalse();
    }
  });
});

const SOIL_FIELDS = [
  'suelos',
  'capacidadDeCampo',
  'puntoMarchitez',
  'sueloReferencia',
  'texturaLixiviacion',
  'texturaEscorrentia',
];

function createComponent(lote?: any): CrearEditarLoteComponent {
  const component = new CrearEditarLoteComponent(
    {} as any,
    { instant: (value: string) => value } as any,
    {} as any,
    {
      notifSuccess: jasmine.createSpy('notifSuccess'),
      notifWarn: jasmine.createSpy('notifWarn'),
      notifError: jasmine.createSpy('notifError'),
      calcularCentroide: jasmine.createSpy('calcularCentroide'),
      calcularAreaHectareas: jasmine.createSpy('calcularAreaHectareas'),
    } as any,
    {} as any,
    {} as any,
    {} as any
  );
  component.lote = lote;
  (component as any).createForm();
  return component;
}

function getData(component: CrearEditarLoteComponent): any {
  return (component as any).getData();
}
