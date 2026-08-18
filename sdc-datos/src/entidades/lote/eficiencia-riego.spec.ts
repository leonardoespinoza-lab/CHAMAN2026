import { LoteSchema } from './modelos/schema';

describe('LoteSchema - eficiencia de riego', () => {
  it('persiste un porcentaje operativo acotado entre 10 y 100', () => {
    const path = LoteSchema.path('eficienciaRiego') as any;

    expect(path).toBeDefined();
    expect(path.options.min).toBe(10);
    expect(path.options.max).toBe(100);
  });
});
