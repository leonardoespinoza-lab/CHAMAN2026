import { ListadoLotesComponent } from './listado-lotes.component';

describe('ListadoLotesComponent indicador de riego', () => {
  let component: ListadoLotesComponent;

  beforeEach(() => {
    component = new ListadoLotesComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('no presenta agua util cero como calculada cuando el estado no esta disponible', () => {
    const riego = (component as any).indicadorRiego({
      dispositivos: [],
      siembra: {
        estadoCalculoAguaUtil: 'no_disponible',
        estadoRecomendacionRiego: 'no_disponible',
        aguaUtilReal: 0,
        ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 0 }],
      },
    } as any);

    expect(riego?.value).toBe('Sin sensor');
    expect(riego?.detail).toBe('Pendiente');
    expect(riego?.tooltip).toContain('no disponible o fallida');
  });

  it('muestra un cero con estado estimado como balance modelado, no como dato de sensor', () => {
    const riego = (component as any).indicadorRiego({
      dispositivos: [],
      siembra: {
        estadoCalculoAguaUtil: 'estimado',
        estadoRecomendacionRiego: 'estimada',
        fuenteRecomendacionRiego: 'balance_climatico',
        aguaUtilReal: 0,
        ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 0 }],
      },
    } as any);

    expect(riego?.value).toBe('0 mm');
    expect(riego?.detail).toBe('Balance modelado');
    expect(riego?.tone).toBe('info');
    expect(riego?.tooltip).toContain('Estimacion');
  });
});

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
      {} as any
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

  it('no convierte una formula experimental en riesgo sanitario del listado', () => {
    const componente = crearComponente();
    const indicador = (componente as any).indicadorEnfermedades({
      siembra: {
        ultimaPrediccion: {
          fecha: new Date().toISOString(),
          enfermedades: [
            {
              idEnfermedad: 'trigo.roya_anaranjada',
              enfermedad: 'Roya Anaranjada',
              resultado: 67.81,
              estado: 'calculado',
              modelo: { version: 5, validacion: 'experimental' },
              calidadDatos: { nivel: 'baja' },
            },
          ],
        },
      },
    });

    expect(indicador.value).toBe('Precaucion');
    expect(indicador.tone).toBe('warn');
    expect(indicador.tooltip).toContain('no constituyen una alerta confirmada');
  });
});
