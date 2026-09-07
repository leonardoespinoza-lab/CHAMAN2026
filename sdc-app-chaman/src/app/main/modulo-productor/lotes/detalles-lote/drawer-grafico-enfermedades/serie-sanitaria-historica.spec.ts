import {
  construirSeriesSanitariasHistoricas,
  escaparTextoSanitario,
  unidadSerieSanitaria,
} from './serie-sanitaria-historica';

const registro = (fecha: string, resultado: unknown, version: number | undefined = 4, extra = {}) =>
  ({
    fecha: `${fecha}T03:00:00.000Z`,
    enfermedades: [
      {
        enfermedad: 'Mancha en Red',
        idEnfermedad: 'cebada.mancha_red',
        resultado,
        estado: 'calculado',
        modelo: version ? { version } : undefined,
        ...extra,
      },
    ],
  }) as any;

describe('historial sanitario de presentación', () => {
  it('separa el salto real de agosto sin cambiar los resultados ni unir versiones', () => {
    const entrada = [registro('2026-08-03', 99.86, 3), registro('2026-08-04', 41.09, 4)];
    const copia = JSON.stringify(entrada);
    const series = construirSeriesSanitariasHistoricas(entrada);
    expect(series.map((s) => s.versionEtiqueta)).toEqual(['v3', 'v4']);
    expect(series.map((s) => s.data.map((p) => p.y))).toEqual([
      [99.86, null],
      [null, 41.09],
    ]);
    expect(JSON.stringify(entrada)).toBe(copia);
  });

  it('distingue fuera de ventana, falta de datos y cero calculado', () => {
    const [serie] = construirSeriesSanitariasHistoricas([
      registro('2026-07-01', 0, 4, { estado: 'fuera_ventana' }),
      registro('2026-07-02', 0, 4, { estado: 'sin_datos' }),
      registro('2026-07-03', 0),
      registro('2026-07-04', 24.62, 4, { calidadDatos: { nivel: 'baja' } }),
    ]);
    expect(serie.data.map((p) => p.y)).toEqual([null, null, 0, 24.62]);
    expect(serie.data.map((p) => p.custom.estado)).toEqual(['fuera_ventana', 'sin_datos', 'calculado', 'calculado']);
    expect(serie.data[3].custom.calidad).toBe('baja');
  });

  it('no convierte datos inválidos en ceros ni recorta valores fuera de escala', () => {
    for (const valor of [null, undefined, '', '20', NaN, Infinity, -1, 101]) {
      expect(construirSeriesSanitariasHistoricas([registro('2026-07-01', valor)])[0].data[0].y).toBeNull();
    }
  });

  it('interrumpe días ausentes y enfermedades omitidas, ordenando fechas', () => {
    const series = construirSeriesSanitariasHistoricas([
      registro('2026-07-05', 55),
      registro('2026-07-01', 50),
      { fecha: '2026-07-02T03:00:00.000Z', enfermedades: [] } as any,
      { fecha: 'fecha-invalida', enfermedades: [] } as any,
    ]);
    expect(series[0].data.map((p) => p.y)).toEqual([50, null, null, 55]);
  });

  it('no puentea una versión intermedia ni repite fechas', () => {
    const series = construirSeriesSanitariasHistoricas([
      registro('2026-07-01', 10, 3),
      registro('2026-07-02', 20, 4),
      registro('2026-07-03', 30, 3),
      registro('2026-07-03', 31, 3),
    ]);
    expect(series[0].data.map((p) => p.y)).toEqual([10, null, 31]);
  });

  it('mantiene los registros legados separados de una versión identificada', () => {
    const legado = registro('2026-07-01', 10);
    delete legado.enfermedades[0].modelo;
    expect(
      construirSeriesSanitariasHistoricas([legado, registro('2026-07-02', 20)]).map((s) => s.versionEtiqueta)
    ).toEqual(['legado', 'v4']);
  });

  it('usa porcentaje solamente para horas favorables del contrato horario de roya amarilla', () => {
    expect(unidadSerieSanitaria('cebada.mancha_red', 4)).toBe('/100');
    expect(unidadSerieSanitaria('trigo.roya_hoja', 5)).toBe('/100');
    expect(unidadSerieSanitaria('trigo.roya_anaranjada', 3)).toBe('/100');
    expect(unidadSerieSanitaria('trigo.roya_anaranjada', 5)).toBe('% horas favorables');
  });

  it('escapa texto ajeno antes de usarlo en un tooltip HTML', () => {
    expect(escaparTextoSanitario('<img src=x onerror="x">&')).toBe('&lt;img src=x onerror=&quot;x&quot;&gt;&amp;');
  });
});
