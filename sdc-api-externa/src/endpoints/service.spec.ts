import { Logger } from '@nestjs/common';
import { IEntradasAgronomicasSuelo, IPrediccionRiego } from 'modelos/src';
import { EndpointsService } from './service';

describe('EndpointsService consultarPrediccionRiego', () => {
  const currentInputs = (
    overrides: Partial<IEntradasAgronomicasSuelo> = {},
  ): IEntradasAgronomicasSuelo => ({
    loteId: 'lote-1',
    status: 'ready',
    stale: false,
    selectionPolicyVersion: 'soil-agronomic-selection-v1.0.0',
    selectionReason: 'automatic_assessment',
    fieldCapacityPercentage: 31,
    wiltingPointPercentage: 14,
    depthLayers: [],
    provenance: {},
    ...overrides,
  });

  const createService = (
    prediction: IPrediccionRiego,
    inputs: IEntradasAgronomicasSuelo | null = null,
  ) => {
    const prediccionRiegoService = {
      getBySiembraYFecha: jest.fn().mockResolvedValue(prediction),
      getAgronomicInputsByLot: jest.fn().mockResolvedValue(inputs),
    };
    const siembrasService = {
      getById: jest.fn().mockResolvedValue({ _id: 'siembra-1' }),
    };
    const service = new EndpointsService(
      {} as any,
      {} as any,
      {} as any,
      siembrasService as any,
      {} as any,
      {} as any,
      {} as any,
      prediccionRiegoService as any,
      {} as any,
    );
    return { service, prediccionRiegoService, siembrasService };
  };

  it('valida ownership antes de leer la prediccion', async () => {
    const apikey = { key: 'externa-1' } as any;
    const { service, prediccionRiegoService, siembrasService } = createService({
      idSiembra: 'siembra-1',
    });
    siembrasService.getById.mockRejectedValueOnce(
      new Error('No tienes permiso para ver esta siembra'),
    );

    await expect(
      service.consultarPrediccionRiego(apikey, 'siembra-1'),
    ).rejects.toThrow('No tienes permiso');
    expect(siembrasService.getById).toHaveBeenCalledWith('siembra-1', apikey);
    expect(prediccionRiegoService.getBySiembraYFecha).not.toHaveBeenCalled();
    expect(prediccionRiegoService.getAgronomicInputsByLot).not.toHaveBeenCalled();
  });

  it('publica CC y PMP del contrato edafico vigente', async () => {
    const { service, prediccionRiegoService } = createService(
      {
        idSiembra: 'siembra-1',
        fechaPrediccion: '2026-07-14',
        lote: {
          _id: 'lote-1',
          nombre: 'Lote norte',
          capacidadDeCampo: 22,
          puntoMarchitez: 9,
        },
      },
      currentInputs(),
    );

    await expect(
      service.consultarPrediccionRiego({} as any, 'siembra-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        capacidadDeCampo: 31,
        puntoDeMarchitez: 14,
      }),
    );
    expect(prediccionRiegoService.getAgronomicInputsByLot).toHaveBeenCalledWith(
      'lote-1',
    );
  });

  it('conserva los campos legacy si el contrato esta vencido', async () => {
    const { service } = createService(
      {
        lote: {
          _id: 'lote-1',
          capacidadDeCampo: 24,
          puntoMarchitez: 10,
        },
      },
      currentInputs({ stale: true }),
    );

    await expect(
      service.consultarPrediccionRiego({} as any, 'siembra-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        capacidadDeCampo: 24,
        puntoDeMarchitez: 10,
      }),
    );
  });

  it('conserva el dato legacy disponible cuando el contrato es parcial', async () => {
    const { service } = createService(
      {
        lote: {
          _id: 'lote-1',
          capacidadDeCampo: 24,
          puntoMarchitez: 10,
        },
      },
      currentInputs({
        status: 'partial',
        fieldCapacityPercentage: 30,
        wiltingPointPercentage: undefined,
      }),
    );

    await expect(
      service.consultarPrediccionRiego({} as any, 'siembra-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        capacidadDeCampo: 30,
        puntoDeMarchitez: 10,
      }),
    );
  });

  it('no fabrica ceros cuando CC y PMP son desconocidos', async () => {
    const { service } = createService({
      lote: { _id: 'lote-1', nombre: 'Sin caracterizacion' },
    });

    const response = await service.consultarPrediccionRiego(
      {} as any,
      'siembra-1',
    );

    expect(response.capacidadDeCampo).toBeUndefined();
    expect(response.puntoDeMarchitez).toBeUndefined();
  });

  it('preserva el fallback legacy si falla la consulta interna', async () => {
    const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const { service, prediccionRiegoService } = createService({
      lote: {
        _id: 'lote-1',
        capacidadDeCampo: 0,
        puntoMarchitez: 0,
      },
    });
    prediccionRiegoService.getAgronomicInputsByLot.mockRejectedValueOnce(
      new Error('sdc-datos no disponible'),
    );

    await expect(
      service.consultarPrediccionRiego({} as any, 'siembra-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        capacidadDeCampo: 0,
        puntoDeMarchitez: 0,
      }),
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
