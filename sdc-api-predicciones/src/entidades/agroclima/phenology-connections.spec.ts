import { AgroclimaService } from './service';

describe('Etapa observada y riesgos agroclimaticos', () => {
  const service = new AgroclimaService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  ) as any;
  const record: any = {
    id: 'campo',
    etapa: 'Floracion',
    tipoEvento: 'inicio_etapa',
    fechaInicioEtapa: '2026-09-09T15:00:00Z',
    confianza: 'alta',
    coberturaObservadaPct: 80,
  };
  const sow = (records: any[] = []): any => ({
    _id: 's1',
    idLote: 'l1',
    fechaSiembra: '2020-01-01',
    semilla: { cultivo: 'Manzano', variedad: 'Rosy Glow' },
    registrosFenologicos: records,
  });
  const day: any = {
    fecha: '2026-09-10',
    temperaturaMin: -2,
    temperaturaMax: 14,
    lluvia: 12,
    weatherCode: 99,
    probabilidadLluvia: 90,
    cape: 2500,
    showers: 12,
    rafagaViento: 65,
  };
  it('helada toma el estadio observado y sus umbrales en lugar del calendario', () => {
    const observed = service.calcularRiesgoHelada([day], sow([record]));
    const dormant = service.calcularRiesgoHelada(
      [day],
      sow([{ ...record, etapa: 'Reposo invernal' }]),
    );
    expect(observed.etapaFenologica).toBe('Floracion');
    expect(observed.evidencia.join(' ')).toContain('registrada en campo');
    expect(observed.umbralDanoLeveC).not.toBe(dormant.umbralDanoLeveC);
    expect(observed.posibilidadPct).toBeGreaterThan(dormant.posibilidadPct);
  });
  it('resuelve observacion puntual solo en su dia incluso si se registro por la tarde', () => {
    const s = sow([
      {
        ...record,
        tipoEvento: 'observacion',
        fecha: '2026-09-09T15:00:00Z',
        fechaInicioEtapa: undefined,
      },
    ]);
    const risks = service.calcularRiesgoHelada(
      [{ ...day, fecha: '2026-09-09' }, day],
      s,
    );
    expect(risks.serie[0].etapaFenologica).toBe('Floracion');
    expect(risks.serie[0].evidencia.join(' ')).toContain('registrada en campo');
    expect(risks.serie[1].evidencia.join(' ')).toContain(
      'referencia por calendario',
    );
  });
  it.each([
    { confianza: 'baja' },
    { coberturaObservadaPct: 0 },
    { idLote: 'otro' },
    { campania: '2025/2026' },
    { fechaInicioEtapa: '2026-09-11' },
  ])('no certifica etapa invalida %j', (override) => {
    const r = service.calcularRiesgoHelada(
      [day],
      sow([{ ...record, ...override }]),
    );
    expect(r.evidencia.join(' ')).toContain('referencia por calendario');
  });
  it('granizo incluye contexto sin alterar indices, calidad ni disparador meteorologico', () => {
    const bare = service.calcularRiesgoGranizo([day]);
    const observed = service.calcularRiesgoGranizo([day], sow([record]));
    expect(observed.etapaFenologica).toBe('Floracion');
    expect(observed.evidencia.join(' ')).toContain(
      'No se estima porcentaje de dano',
    );
    expect(observed.posibilidadPct).toBe(bare.posibilidadPct);
    expect(observed.nivel).toBe(bare.nivel);
    expect(observed.calidadDatos).toEqual(bare.calidadDatos);
    expect(
      service.debeEmitirAlertaGranizo(observed, '2026-09-09T15:00:00Z'),
    ).toBe(service.debeEmitirAlertaGranizo(bare, '2026-09-09T15:00:00Z'));
  });
  it('la alerta persistida conserva el contexto de campo que calculo el motor', async () => {
    const alerts = {
      registrarEventoSiembra: jest.fn().mockResolvedValue(undefined),
      finalizarEventoSiembra: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
      enviarEventoAgroclimatico: jest.fn().mockResolvedValue(undefined),
    };
    const live = new AgroclimaService(
      {} as any,
      {
        getById: jest
          .fn()
          .mockResolvedValue({
            ...sow([record]),
            lote: {
              nombre: 'QA',
              ubicacion: { centro: { lat: -39, lng: -67 } },
            },
          }),
      } as any,
      alerts as any,
      notifications as any,
    ) as any;
    jest
      .spyOn(live, 'fetchOpenMeteoAgroForecast')
      .mockResolvedValue([{ ...day, temperaturaMin: -8 }]);
    // probar el camino real de evaluacion/registro sin enviar notificaciones reales
    jest.spyOn(live, 'debeEmitirAlertaGranizo').mockReturnValue(false);
    await live.evaluarYRegistrar('s1');
    expect(alerts.registrarEventoSiembra).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'helada',
        reporte: expect.objectContaining({ etapaFenologica: 'Floracion' }),
      }),
    );
    expect(notifications.enviarEventoAgroclimatico).toHaveBeenCalled();
  });
});
