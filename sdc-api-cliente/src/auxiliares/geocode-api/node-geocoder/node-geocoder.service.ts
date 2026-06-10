import { Injectable, Logger } from '@nestjs/common';
import { ICoordenadas, DireccionV2 } from 'modelos/src';
import NodeGeocoder, { Options } from 'node-geocoder';
import { AxiosService } from 'src/auxiliares/axios/axios.service';
import { MAPS_KEY } from 'src/env';

const options: Options = {
  provider: 'google',
  apiKey: MAPS_KEY, // for Mapquest, OpenCage, Google Premier
  formatter: null, // 'gpx', 'string', ...
};

@Injectable()
export class NodeGeocodeService {
  constructor(private axios: AxiosService) {}

  public async reverse(coordenadas: ICoordenadas): Promise<DireccionV2> {
    try {
      const geoCoder = NodeGeocoder(options);
      const response: NodeGeocoder.Entry[] = await geoCoder.reverse({
        lat: coordenadas.lat,
        lon: coordenadas.lng,
      });
      const direccion: DireccionV2 = {
        provincia: response[0].administrativeLevels?.level1long,
        partido: response[0].administrativeLevels?.level2long,
        localidad: response[0].city,
        // Barrio no viene, pero se podría completar después con las comunas o algo de eso
        barrio: response[0].city,
        calle: response[0].streetName,
        numero: response[0].streetNumber,
        direccion: response[0].formattedAddress,
        coordenadas,
      };
      return direccion;
    } catch (error) {
      Logger.error(error, 'NodeGeocodeService');
      return undefined;
    }
  }

  public async geocode(direccion: string): Promise<ICoordenadas> {
    try {
      const geoCoder = NodeGeocoder(options);
      const response = await geoCoder.geocode(direccion);
      return { lat: response[0].latitude, lng: response[0].longitude };
    } catch (error) {
      Logger.error(error, 'NodeGeocodeService');
      return { lat: 0, lng: 0 };
    }
  }

  public async getPredictions(
    text: string,
    pais = 'ar',
    coordenadas?: ICoordenadas,
  ) {
    if (!text) return [];
    text = text.trim();
    text = text.split('á').join('a');
    text = text.split('é').join('e');
    text = text.split('í').join('i');
    text = text.split('ó').join('o');
    text = text.split('ú').join('u');
    text = text.split('ñ').join('n');

    text = text.replace(/[^a-zA-Z0-9\s]/g, '');

    // Nueva Places API - Text Search (New)
    const requestBody: any = {
      textQuery: text,
      regionCode: pais.toUpperCase(),
      maxResultCount: 10,
    };

    // Agregar locationRestriction solo si hay coordenadas
    if (coordenadas) {
      requestBody.locationBias = {
        circle: {
          center: {
            latitude: coordenadas.lat,
            longitude: coordenadas.lng,
          },
          radius: 50000.0, // 50km en metros (máximo permitido)
        },
      };
    }

    try {
      const result = await this.axios.POST<{
        places: Array<{
          formattedAddress: string;
          displayName?: {
            text: string;
          };
        }>;
      }>('https://places.googleapis.com/v1/places:searchText', requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': MAPS_KEY,
          'X-Goog-FieldMask': 'places.formattedAddress,places.displayName',
        },
      });

      const resp: string[] = [];
      for (const place of result.places || []) {
        resp.push(place.formattedAddress);
      }
      return resp;
    } catch (error) {
      Logger.error('Error en getPredictions:', error, 'NodeGeocodeService');
      return [];
    }
  }
}
