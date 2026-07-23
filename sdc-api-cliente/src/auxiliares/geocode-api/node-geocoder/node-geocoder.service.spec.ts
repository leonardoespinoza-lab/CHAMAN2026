import { NodeGeocodeService } from './node-geocoder.service';

describe('NodeGeocodeService - respaldo GeoRef', () => {
  const respuestaGeoref = {
    direcciones: [
      {
        nomenclatura: 'SAN MARTIN 1000, Capital, Cordoba',
        ubicacion: { lat: -31.416, lon: -64.183 },
      },
      {
        nomenclatura: 'SAN MARTIN 1000, Rosario, Santa Fe',
        ubicacion: { lat: -32.949, lon: -60.654 },
      },
    ],
  };

  it('usa GeoRef cuando Google Places responde con error y abre el circuito', async () => {
    const axios = {
      POST: jest.fn().mockRejectedValue(new Error('403')),
      GET: jest.fn().mockResolvedValue(respuestaGeoref),
    };
    const service = new NodeGeocodeService(axios as any);
    (service as any).googlePlacesDisponible = true;

    const primera = await service.getPredictions('San Martin 1000', 'ar', {
      lat: -31.42,
      lng: -64.18,
    });
    const segunda = await service.getPredictions('San Martin 1000', 'ar', {
      lat: -31.42,
      lng: -64.18,
    });

    expect(primera[0]).toContain('Capital');
    expect(segunda).toEqual(primera);
    expect(axios.POST).toHaveBeenCalledTimes(1);
    expect(axios.GET).toHaveBeenCalledTimes(2);
  });

  it('georreferencia una sugerencia con GeoRef sin devolver coordenadas cero', async () => {
    const axios = {
      POST: jest.fn(),
      GET: jest.fn().mockResolvedValue(respuestaGeoref),
    };
    const service = new NodeGeocodeService(axios as any);
    (service as any).googlePlacesDisponible = false;

    await expect(
      service.geocode('SAN MARTIN 1000, Capital, Cordoba'),
    ).resolves.toEqual({
      lat: -31.416,
      lng: -64.183,
    });
  });
});
