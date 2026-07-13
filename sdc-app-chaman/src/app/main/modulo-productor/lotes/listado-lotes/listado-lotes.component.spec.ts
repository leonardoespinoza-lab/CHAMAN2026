import { ListadoLotesComponent } from './listado-lotes.component';

describe('ListadoLotesComponent', () => {
  const crearComponente = () =>
    new ListadoLotesComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { instant: (value: string) => value } as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('usa el respaldo de calidad de OpenMeteo cuando el pronostico no persiste calidadDatos', () => {
    const componente = crearComponente();

    const indicador = (componente as any).indicadorClima({
      establecimiento: {
        prediccionClimatica: {
          pronosticos: [{ fuente: 'OpenMeteo' }],
        },
      },
      calidadClima: { nivel: 3 },
    });

    expect(indicador.value).toBe('Media');
    expect(indicador.detail).toBe('62/100');
    expect(indicador.tone).toBe('warn');
  });
});
