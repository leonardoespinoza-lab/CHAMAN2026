import { IPrediccionEnfermedad } from 'modelos/src';
import { buscarPrediccionEnfermedadCanonica } from './enfermedad-card-compat';

describe('compatibilidad canonica de la tarjeta sanitaria', () => {
  it('encuentra el ID legado aunque el nombre persistido ya sea el correcto', () => {
    const prediccion = {
      enfermedad: 'Roya Amarilla/Estriada',
      idEnfermedad: 'trigo.roya_anaranjada',
      resultado: 15,
      variables: {},
    } as IPrediccionEnfermedad;

    expect(buscarPrediccionEnfermedadCanonica([prediccion], 'Roya Anaranjada')).toBe(prediccion);
  });

  it('acepta el nombre legado cuando todavia no existe ID persistido', () => {
    const prediccion = {
      enfermedad: 'Roya Anaranjada',
      resultado: 5,
      variables: {},
    } as IPrediccionEnfermedad;

    expect(buscarPrediccionEnfermedadCanonica([prediccion], 'Roya Amarilla/Estriada')).toBe(prediccion);
  });
});
