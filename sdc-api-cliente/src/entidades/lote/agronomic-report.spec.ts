import { IReporteNDVI, ISiembra } from 'modelos/src';
import { LotesService } from './service';

describe('LotesService - seguimiento satelital del informe agronomico', () => {
  const service = new LotesService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  ) as any;

  const siembra: ISiembra = {
    fechaSiembra: '2026-07-01T00:00:00.000Z',
    semilla: { cultivo: 'Arveja', variedad: 'KINGFISHER' },
    crono: {
      etapas: {
        siembra_emergencia: 8,
        emergencia_vegetativo: 24,
        vegetativo_floracion: 30,
      },
    } as any,
  };

  const reportes: IReporteNDVI[] = [
    {
      fechaDeLaImagen: '2026-07-08T00:00:00.000Z',
      indices: { ndvi: 0.513, ndre: 0.24 },
      coleccion: 'sentinel-2-l2a',
      metadataImagen: { qualityMask: { validCoveragePct: 92 } } as any,
    },
    {
      fechaDeLaImagen: '2026-07-12T00:00:00.000Z',
      indices: { ndvi: 0.527, evi: 0.41 },
      coleccion: 'sentinel-2-l2a',
      metadataImagen: { qualityMask: { validCoveragePct: 88 } } as any,
    },
  ];

  it('mantiene una escala NDVI fija y muestra fecha, dia de ciclo y valor real', () => {
    const html = service.renderNdviSparkline(reportes, siembra);

    expect(html).toContain('escala fija 0-1');
    expect(html).toContain('D+7');
    expect(html).toContain('D+11');
    expect(html).toContain('0,513');
    expect(html).toContain('0,527');
    expect(html).toContain('+0,014');
    expect(html).toContain('Etapa en ultima escena');
  });

  it('prioriza una etapa fenologica registrada a campo para la fecha de escena', () => {
    const conRegistro: ISiembra = {
      ...siembra,
      registrosFenologicos: [
        {
          fecha: '2026-07-10T00:00:00.000Z',
          etapa: 'V3 - tercer nudo',
        },
      ],
    };

    const puntos = service.getPuntosNdviCertificado(reportes, conRegistro);

    expect(puntos[0].etapaConfirmada).toBe(false);
    expect(puntos[1]).toMatchObject({
      etapa: 'V3 - tercer nudo',
      etapaFuente: 'Registro de campo',
      etapaConfirmada: true,
    });
  });

  it('expone trazabilidad, calidad y los indices complementarios sin mezclarlos', () => {
    const html = service.renderTablaSatelital(reportes, siembra);

    expect(html).toContain('Trazabilidad de escenas');
    expect(html).toContain('92% valida');
    expect(html).toContain('Indices complementarios por escena');
    expect(html).toContain('<th>NDRE</th>');
    expect(html).toContain('<th>EVI</th>');
    expect(html).toContain('sentinel-2-l2a');
  });

  it('descarta fechas inutiles y valores fuera del rango normalizado', () => {
    const puntos = service.getPuntosNdviCertificado(
      [
        { fechaDeLaImagen: 'invalida', indices: { ndvi: 0.5 } },
        {
          fechaDeLaImagen: '2026-07-10T00:00:00.000Z',
          indices: { ndvi: 1.4 },
        },
      ],
      siembra,
    );

    expect(puntos).toEqual([]);
  });

  it('no presenta un cero sin estado valido como agua util real', () => {
    const sinDato = {
      aguaUtilReal: 0,
      estadoCalculoAguaUtil: 'no_disponible',
    } as ISiembra;
    const calculado = {
      aguaUtilReal: 18.4,
      estadoCalculoAguaUtil: 'calculado',
    } as ISiembra;

    expect(service.getRiegoTexto(sinDato)).toBe('Sin recomendacion');
    expect(service.getRiegoScore(sinDato)).toBe(25);
    expect(service.getRiegoTexto(calculado)).toContain('18,4 mm agua util');
    expect(service.getRiegoScore(calculado)).toBe(65);
  });

  it('separa recomendacion estimada de lectura de agua util', () => {
    const balance = {
      aguaUtilReal: null,
      estadoCalculoAguaUtil: 'no_disponible',
      estadoRecomendacionRiego: 'estimada',
      fuenteRecomendacionRiego: 'balance_climatico',
      ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 4 }],
    } as any;
    const fallida = {
      estadoCalculoAguaUtil: 'fallida',
      estadoRecomendacionRiego: 'fallida',
      ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 0 }],
    } as any;

    expect(service.getRiegoTexto(balance)).toContain('4 mm estimados');
    expect(service.getRiegoScore(balance)).toBe(62);
    expect(service.getRiegoTexto(fallida)).toBe('Sin recomendacion');
    expect(service.getRiegoScore(fallida)).toBe(25);
  });
});
