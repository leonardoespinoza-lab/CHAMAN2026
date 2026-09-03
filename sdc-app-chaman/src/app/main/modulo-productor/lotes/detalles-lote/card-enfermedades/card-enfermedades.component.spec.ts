import { CardEnfermedadesComponent } from './card-enfermedades.component';

describe('CardEnfermedadesComponent - comunicacion sanitaria', () => {
  const crear = () => {
    const componente = new CardEnfermedadesComponent({} as any, {} as any);
    componente.siembra = {
      _id: 'siembra-1',
      semilla: { cultivo: 'Trigo', variedad: 'MS INTA 924' },
    } as any;
    return componente;
  };

  it('muestra un unico estado pendiente mientras la primera prediccion se calcula', () => {
    const componente = crear();

    expect(componente.calculosPendientes).toBeTrue();

    (componente.siembra as any).ultimaPrediccion = {
      enfermedades: [{ enfermedad: 'Mancha Amarilla', resultado: 0 }],
    };
    expect(componente.calculosPendientes).toBeFalse();
  });

  it('muestra cobertura insuficiente y nunca el resultado contractual en sombra', () => {
    const componente = crear();
    const prediccion = {
      idEnfermedad: 'trigo.roya_anaranjada',
      enfermedad: 'Roya Anaranjada',
      resultado: 0,
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

    expect((componente as any).resultadoEtiqueta(prediccion, 0, 'Roya Anaranjada', true)).toBe('Sin evaluar');
    expect((componente as any).estadoCorto(prediccion, 'Roya Anaranjada', 0, true)).toBe('Sin datos horarios');
    const lectura = (componente as any).lecturaCorta(
      prediccion,
      'Roya Anaranjada',
      'datos horarios insuficientes para evaluar',
      true
    );
    expect(lectura).toContain('Sin evaluacion');
    expect(lectura).toContain('0%');
    expect(lectura).toContain('0 de 240 horas');
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

    expect((componente as any).resultadoEtiqueta(prediccion, 6.25, 'Roya Anaranjada', true)).toBe('6.3%');
    expect((componente as any).estadoCorto(prediccion, 'Roya Anaranjada', 6.25, true)).toBe('Condiciones iniciales');
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

    expect((componente as any).estadoCorto(prediccion, 'Mancha de la Hoja', 32, true)).toBe('Dato varietal pendiente');
    expect((componente as any).sensibilidadVarietal('Mancha de la Hoja')).toContain(
      'factor conservador susceptible (S=1)'
    );
    expect(
      (componente as any).lecturaCorta(prediccion, 'Mancha de la Hoja', 'resultado de baja confianza', true)
    ).toContain('S=1');
  });

  it('muestra el indice limitado y deja explicita la saturacion del resultado crudo', () => {
    const componente = crear();
    const prediccion = {
      idEnfermedad: 'trigo.roya_hoja',
      enfermedad: 'Roya de la Hoja',
      resultado: 100,
      estado: 'calculado',
      modelo: { version: 5, validacion: 'operativo_provisional' },
      calidadDatos: { nivel: 'baja' },
      variables: { resultadoCrudo: 108.712 },
    } as any;

    expect((componente as any).resultadoEtiqueta(prediccion, 100, 'Roya de la Hoja', true)).toBe('100.0/100');
    expect((componente as any).estadoCorto(prediccion, 'Roya de la Hoja', 100, true)).toBe('Indice saturado');
    expect((componente as any).etiquetaMetrica('Roya de la Hoja', prediccion)).toBe('');
    expect((componente as any).puedeMostrarEscala(prediccion, 'Roya de la Hoja', true)).toBeTrue();
    expect((componente as any).lecturaCorta(prediccion, 'Roya de la Hoja', 'indice limitado', true)).toContain('108.7');
  });

  it('diferencia fuera de ventana de un indice cero', () => {
    const componente = crear();
    const prediccion = {
      idEnfermedad: 'trigo.fusarium_espiga',
      enfermedad: 'Fusarium de la Espiga',
      resultado: 0,
      estado: 'fuera_ventana',
      modelo: { version: 5, validacion: 'operativo_provisional' },
    } as any;

    expect((componente as any).resultadoEtiqueta(prediccion, 0, 'Fusarium de la Espiga', true)).toBe(
      'Fuera de ventana'
    );
    expect((componente as any).estadoCorto(prediccion, 'Fusarium de la Espiga', 0, true)).toBe('Fuera de ventana');
    expect((componente as any).puedeMostrarEscala(prediccion, 'Fusarium de la Espiga', true)).toBeFalse();
  });

  it('representa el indice provisional sobre una escala real de 0 a 100', () => {
    const componente = crear();
    const prediccion = {
      idEnfermedad: 'trigo.mancha_amarilla',
      enfermedad: 'Mancha Amarilla',
      resultado: 24.2,
      estado: 'calculado',
      modelo: { version: 5, validacion: 'operativo_provisional' },
      calidadDatos: { nivel: 'media' },
      variables: { resultadoCrudo: 24.2 },
    } as any;

    expect((componente as any).llenadoRiesgo(24.2, true, 'Mancha Amarilla', prediccion)).toBe(24.2);
    expect((componente as any).estadoCorto(prediccion, 'Mancha Amarilla', 24.2, true)).toBe('Recorrida recomendada');
  });

  it('presenta sin falsos ceros y con saturacion trazable el caso real de JURAMENTO', () => {
    const componente = crear();
    (componente.siembra as any).semilla.variedad = 'JURAMENTO';
    (componente.siembra as any).ultimaPrediccion = {
      enfermedades: [
        {
          idEnfermedad: 'trigo.mancha_amarilla',
          enfermedad: 'Mancha Amarilla',
          resultado: 11.37,
          estado: 'calculado',
          modelo: { version: 5, validacion: 'operativo_provisional' },
          calidadDatos: { nivel: 'media' },
          resistenciaUsada: { estado: 'observada', multiplicador: 0.5 },
          variables: { resultadoCrudo: 11.365 },
        },
        {
          idEnfermedad: 'trigo.roya_hoja',
          enfermedad: 'Roya de la Hoja',
          resultado: 100,
          estado: 'calculado',
          modelo: { version: 5, validacion: 'operativo_provisional' },
          calidadDatos: { nivel: 'baja' },
          resistenciaUsada: { estado: 'observada', multiplicador: 1 },
          variables: { resultadoCrudo: 108.712 },
        },
        {
          idEnfermedad: 'trigo.roya_anaranjada',
          enfermedad: 'Roya Anaranjada',
          resultado: 0,
          estado: 'sin_datos',
          modelo: { version: 5, validacion: 'experimental' },
          calidadDatos: { nivel: 'baja' },
          variables: { coberturaHoraria10d: 0, horasValidas10d: 0, horasEsperadas10d: 240 },
        },
        {
          idEnfermedad: 'trigo.mancha_hoja',
          enfermedad: 'Mancha de la Hoja',
          resultado: 24.22,
          estado: 'calculado',
          modelo: { version: 5, validacion: 'operativo_provisional' },
          calidadDatos: { nivel: 'sin_datos' },
          resistenciaUsada: { estado: 'desconocida', multiplicador: 1 },
          variables: { resultadoCrudo: 24.22 },
        },
        {
          idEnfermedad: 'trigo.fusarium_espiga',
          enfermedad: 'Fusarium de la Espiga',
          resultado: 0,
          estado: 'fuera_ventana',
          modelo: { version: 5, validacion: 'operativo_provisional' },
          calidadDatos: { nivel: 'media' },
          variables: {},
        },
      ],
    };

    const porNombre = new Map(componente.enfermedadInsights.map((item) => [item.nombreVisible, item]));
    expect(porNombre.get('Mancha Amarilla')).toEqual(
      jasmine.objectContaining({ resultadoEtiqueta: '11.4/100', fill: 11.37, estadoCorto: 'Seguimiento' })
    );
    expect(porNombre.get('Roya de la Hoja')).toEqual(
      jasmine.objectContaining({
        resultadoEtiqueta: '100.0/100',
        mostrarEscala: true,
        fill: 100,
        estadoCorto: 'Indice saturado',
        severity: 'medium',
      })
    );
    expect(porNombre.get('Roya Amarilla/Estriada (experimental)')).toEqual(
      jasmine.objectContaining({ resultadoEtiqueta: 'Sin evaluar', estadoCorto: 'Sin datos horarios' })
    );
    expect(porNombre.get('Mancha de la Hoja')).toEqual(
      jasmine.objectContaining({ resultadoEtiqueta: '24.2/100', fill: 24.22, estadoCorto: 'Dato varietal pendiente' })
    );
    expect(porNombre.get('Fusarium de la Espiga')).toEqual(
      jasmine.objectContaining({ resultadoEtiqueta: 'Fuera de ventana', mostrarEscala: false, severity: 'neutral' })
    );
  });

  it('declara explicitamente que Pecan no tiene modelo sanitario validado', () => {
    const componente = crear();
    componente.siembra = {
      semilla: { cultivo: 'Pecan', variedad: 'Kiowa' },
    } as any;

    expect(componente.tieneMotorSanitario).toBeFalse();
    expect(componente.resumenGeneral).toContain('sin modelo sanitario validado');
    expect(componente.mensajeSinModeloSanitario).toContain('No se calcula un porcentaje');
    expect(componente.etiquetaBotonActualizacion).toBe('Sin modelo sanitario validado');
    expect(componente.enfermedadInsights).toEqual([]);
  });

  it('habilita la curva principal solo cuando el cultivo tiene serie historica soportada', () => {
    const componente = crear();
    (componente.siembra as any).ultimaPrediccion = {
      enfermedades: [{ enfermedad: 'Mancha Amarilla', resultado: 11.4 }],
    };

    expect(componente.tieneCurvaSanitaria).toBeTrue();

    (componente.siembra as any).semilla.cultivo = 'Arveja';
    expect(componente.tieneCurvaSanitaria).toBeFalse();

    (componente.siembra as any).semilla.cultivo = 'Trigo';
    (componente.siembra as any).ultimaPrediccion.enfermedades = [];
    expect(componente.tieneCurvaSanitaria).toBeFalse();
  });

  it('abre la informacion del modelo sin propagar el click', () => {
    const componente = crear();
    const evento = jasmine.createSpyObj<Event>('event', ['stopPropagation']);

    componente.abrirInformacionModelo(evento);

    expect(evento.stopPropagation).toHaveBeenCalled();
    expect(componente.verInformacionModelo).toBeTrue();
  });
});
