import { PrediccionSchema } from './schema';

describe('PrediccionSchema runtime', () => {
  it('declara explicitamente los campos fenologicos opcionales', () => {
    expect(PrediccionSchema.path('fuenteFenologia')?.instance).toBe('String');
    expect(PrediccionSchema.path('registroFenologicoId')?.instance).toBe('String');
    expect(PrediccionSchema.path('calidadFenologia')?.instance).toBe('Mixed');
  });
});
