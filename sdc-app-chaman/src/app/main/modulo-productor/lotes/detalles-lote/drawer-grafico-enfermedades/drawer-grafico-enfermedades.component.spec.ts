import { DrawerGraficoEnfermedadesComponent } from './drawer-grafico-enfermedades.component';

describe('DrawerGraficoEnfermedadesComponent - grafico principal', () => {
  const crear = () =>
    new DrawerGraficoEnfermedadesComponent({} as any, {} as any, { instant: (value: string) => value } as any);

  it('usa una escala completa de 0 a 100 para no recortar resultados altos', () => {
    const componente = crear();

    const options = (componente as any).chartBasicOptions([], [], []);

    expect(options.yAxis.max).toBe(100);
  });

  it('evita repetir titulo y subtitulo cuando el grafico esta embebido', () => {
    const componente = crear();
    componente.embedded = true;

    const options = (componente as any).chartBasicOptions([], [], []);

    expect(options.title.text).toBeUndefined();
    expect(options.subtitle.text).toBeUndefined();
  });
});
