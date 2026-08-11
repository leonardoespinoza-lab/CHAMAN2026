import { CardRiesgosAgroclimaticosComponent } from './card-riesgos-agroclimaticos.component';

describe('CardRiesgosAgroclimaticosComponent - disponibilidad climatica', () => {
  function createComponent(): CardRiesgosAgroclimaticosComponent {
    return new CardRiesgosAgroclimaticosComponent({} as any, {} as any);
  }

  it('no expone mensajes tecnicos cuando no existe una serie valida', () => {
    const component = createComponent();
    component.riesgos = undefined;

    const message = (component as any).normalizarErrorClimatico(
      new Error('Http Exception during parsing'),
    );

    expect(message).toContain('pronostico climatico se esta actualizando');
    expect(message).not.toContain('Http');
    expect(message).not.toContain('Exception');
  });

  it('conserva y fecha la ultima serie valida si falla una renovacion', () => {
    const component = createComponent();
    component.riesgos = {
      generadoEn: '2026-08-10T12:30:00.000Z',
    } as any;

    const message = (component as any).normalizarErrorClimatico({ message: 'Http Exception' });

    expect(message).toContain('Se conserva la ultima serie climatica valida');
    expect(component.fechaUltimaSerieValida?.toISOString()).toBe('2026-08-10T12:30:00.000Z');
  });
});
