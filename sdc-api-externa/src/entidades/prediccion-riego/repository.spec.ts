import { API_DATOS, SOIL_INTELLIGENCE_INTERNAL_TOKEN } from '../../env';
import { PrediccionRiegoRepository } from './repository';

describe('PrediccionRiegoRepository', () => {
  it('consume el contrato edafico con el token interno', async () => {
    const axios = {
      GET: jest.fn().mockResolvedValue(null),
    };
    const repository = new PrediccionRiegoRepository(axios as any);

    await repository.getAgronomicInputsByLot('lote/1');

    expect(axios.GET).toHaveBeenCalledWith(
      `${API_DATOS}/soil-intelligence/lots/lote%2F1/agronomic-inputs`,
      {
        headers: SOIL_INTELLIGENCE_INTERNAL_TOKEN
          ? { 'x-chaman-internal-token': SOIL_INTELLIGENCE_INTERNAL_TOKEN }
          : {},
      },
    );
  });
});
