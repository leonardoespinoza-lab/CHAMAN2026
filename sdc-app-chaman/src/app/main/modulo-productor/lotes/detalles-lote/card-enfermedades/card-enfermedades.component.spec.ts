import { CardEnfermedadesComponent } from './card-enfermedades.component';

describe('CardEnfermedadesComponent - comunicacion sanitaria', () => {
  const crear = () => {
    const componente = new CardEnfermedadesComponent({} as any, {} as any);
    componente.siembra = {
      semilla: { cultivo: 'Trigo', variedad: 'MS INTA 924' },
    } as any;
    return componente;
  };

  it('muestra cobertura insuficiente y nunca el resultado contractual en sombra', () => {
    const componente = crear();
    const prediccion = {
      idEnfermedad: 'trigo.roya_anaranjada',
      enfermedad: 'Roya Anaranjada',
      resultado: 67.81,
      estado: 'sin_datos',
      modelo: { version: 5, validacion: 'experimental' },
      variables: {
        horasEsperadas10d: 240,
        horasValidas10d: 0,
        coberturaHoraria10d: 0,
        frecuenciaAmbientalPct: 0,
        resultadoContractualLimitado: 67.81,
      },
    } as any;

    expect((componente as any).resultadoEtiqueta(prediccion, 67.81, 'Roya Anaranjada', true)).toBe(
      '0% cobertura horaria'
    );
    expect((componente as any).estadoCorto(prediccion, 'Roya Anaranjada', 67.81, true)).toBe(
      'Datos horarios insuficientes'
    );
    const lectura = (componente as any).lecturaCorta(
      prediccion,
      'Roya Anaranjada',
      'datos horarios insuficientes para evaluar',
      true
    );
    expect(lectura).toContain('0 de 240 horas');
    expect(lectura).toContain('solo para auditoria');
    expect(lectura).not.toContain('67.81');
  });

  it('expresa el porcentaje de horas favorables cuando la cobertura es suficiente', () => {
    const componente = crear();
    const prediccion = {
      estado: 'calculado',
      modelo: { version: 5, validacion: 'experimental' },
      variables: {
        horasEsperadas10d: 240,
        horasValidas10d: 240,
        coberturaHoraria10d: 1,
        frecuenciaAmbientalPct: 6.25,
        nivelOportunidad: 1,
      },
    } as any;

    expect((componente as any).resultadoEtiqueta(prediccion, 6.25, 'Roya Anaranjada', true)).toBe(
      '6.3% horas favorables'
    );
    expect((componente as any).estadoCorto(prediccion, 'Roya Anaranjada', 6.25, true)).toBe(
      'Condiciones iniciales'
    );
  });

  it('explica el supuesto conservador cuando falta resistencia varietal', () => {
    const componente = crear();
    const prediccion = {
      idEnfermedad: 'trigo.mancha_hoja',
      resultado: 32,
      estado: 'calculado',
      modelo: { version: 5, validacion: 'operativo_provisional' },
      calidadDatos: { nivel: 'sin_datos' },
      resistenciaUsada: { estado: 'desconocida', multiplicador: 1 },
    } as any;
    (componente.siembra as any).ultimaPrediccion = { enfermedades: [prediccion] };

    expect((componente as any).estadoCorto(prediccion, 'Mancha de la Hoja', 32, true)).toBe(
      'Resistencia pendiente'
    );
    expect((componente as any).sensibilidadVarietal('Mancha de la Hoja')).toContain(
      'factor conservador susceptible (S=1)'
    );
    expect(
      (componente as any).lecturaCorta(prediccion, 'Mancha de la Hoja', 'resultado de baja confianza', true)
    ).toContain('No descarta presencia');
  });
});
