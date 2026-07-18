import { CrearEditarDispositivosComponent } from './crear-editar-dispositivos.component';

describe('CrearEditarDispositivosComponent', () => {
  const createComponent = () => {
    const component = new CrearEditarDispositivosComponent(
      { snapshot: { paramMap: { get: () => null } } } as any,
      { get: () => undefined } as any,
      { instant: (value: string) => value } as any,
      {} as any,
      {} as any,
      {} as any
    );
    (component as any).createForm();
    return component;
  };

  it('serializa fechas de calibracion y conserva un offset cero real', () => {
    const component = createComponent();
    component.form?.get('deveui')?.setValue('AABBCCDDEEFF0011');
    component.form?.get('calificacionMeteorologica')?.patchValue({
      estado: 'calificado',
      rolTemperatura: 'aire_2m',
      alturaM: 2,
      abrigoRadiacion: true,
      exactitudTemperaturaC: 0.2,
      fechaCalibracion: '2026-06-01',
      proximaCalibracion: '2027-06-01',
      offsetTemperaturaC: 0,
      fuenteCalibracion: '  Certificado INTI 2026-14  ',
    });

    const data = (component as any).getData();

    expect(data.calificacionMeteorologica).toEqual(
      jasmine.objectContaining({
        fechaCalibracion: '2026-06-01T12:00:00.000Z',
        proximaCalibracion: '2027-06-01T23:59:59.999Z',
        offsetTemperaturaC: 0,
        fuenteCalibracion: 'Certificado INTI 2026-14',
      })
    );
  });

  it('no convierte campos numericos o fechas vacias en ceros o epoch falsos', () => {
    const component = createComponent();
    component.form?.get('calificacionMeteorologica')?.patchValue({
      estado: 'referencia',
      alturaM: '',
      exactitudTemperaturaC: null,
      fechaCalibracion: '',
      proximaCalibracion: null,
      offsetTemperaturaC: '   ',
      fuenteCalibracion: '   ',
      observaciones: '',
    });

    const qualification = (component as any).getData().calificacionMeteorologica;

    expect(qualification.alturaM).toBeUndefined();
    expect(qualification.exactitudTemperaturaC).toBeUndefined();
    expect(qualification.offsetTemperaturaC).toBeUndefined();
    expect(qualification.fechaCalibracion).toBeUndefined();
    expect(qualification.proximaCalibracion).toBeUndefined();
    expect(qualification.fuenteCalibracion).toBeUndefined();
    expect(qualification.observaciones).toBeUndefined();
  });

  it('mantiene invalida una declaracion calificada hasta completar metadatos vigentes', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-07-16T12:00:00.000Z'));
    try {
      const component = createComponent();
      const qualification = component.form?.get('calificacionMeteorologica');
      qualification?.patchValue({ estado: 'calificado' });

      expect(qualification?.hasError('calificacionMeteorologicaIncompleta')).toBeTrue();

      qualification?.patchValue({
        rolTemperatura: 'aire_2m',
        alturaM: 2,
        abrigoRadiacion: true,
        exactitudTemperaturaC: 0.2,
        fechaCalibracion: '2026-06-01',
        proximaCalibracion: '2027-06-01',
        offsetTemperaturaC: 0,
        fuenteCalibracion: 'Certificado trazable',
      });

      expect(qualification?.valid).toBeTrue();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('serializa la calibracion de humedad sin heredar la de temperatura', () => {
    const component = createComponent();
    component.form?.get('calificacionMeteorologica')?.patchValue({
      estado: 'calificado',
      rolTemperatura: 'aire_2m',
      alturaM: 2,
      abrigoRadiacion: true,
      exactitudTemperaturaC: 0.2,
      fechaCalibracion: '2026-06-01',
      proximaCalibracion: '2027-06-01',
      fuenteCalibracion: 'Certificado temperatura',
    });
    component.form?.get('calificacionMeteorologica.humedadRelativa')?.patchValue({
      estado: 'referencia',
      rol: 'desconocido',
      alturaM: '',
      exactitud: null,
      fechaCalibracion: '',
      proximaCalibracion: null,
      offset: '   ',
      fuenteCalibracion: '   ',
    });

    const data = (component as any).getData();

    expect(data.calificacionMeteorologica.estado).toBe('calificado');
    expect(data.calificacionMeteorologica.humedadRelativa).toEqual(
      jasmine.objectContaining({
        estado: 'referencia',
        rol: 'desconocido',
        alturaM: undefined,
        exactitud: undefined,
        fechaCalibracion: undefined,
        proximaCalibracion: undefined,
        offset: undefined,
        fuenteCalibracion: undefined,
      })
    );
  });

  it('exige metadatos propios antes de calificar humedad relativa', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-07-16T12:00:00.000Z'));
    try {
      const component = createComponent();
      const humidity = component.form?.get('calificacionMeteorologica.humedadRelativa');
      humidity?.patchValue({ estado: 'calificado' });

      expect(humidity?.hasError('calificacionHumedadIncompleta')).toBeTrue();

      humidity?.patchValue({
        rol: 'aire_2m',
        alturaM: 2,
        abrigoRadiacion: true,
        exactitud: 2.5,
        fechaCalibracion: '2026-06-01',
        proximaCalibracion: '2027-06-01',
        offset: 0,
        fuenteCalibracion: 'Patron RH trazable',
      });

      expect(humidity?.valid).toBeTrue();
      expect(component.estadoCalificacion).toBe('referencia');
      expect(component.estadoCalificacionHumedad).toBe('calificado');
      const serialized = (component as any).getData().calificacionMeteorologica.humedadRelativa;
      expect(serialized.offset).toBe(0);
      expect(serialized.fechaCalibracion).toBe('2026-06-01T12:00:00.000Z');
      expect(serialized.proximaCalibracion).toBe('2027-06-01T23:59:59.999Z');
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
