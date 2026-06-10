import { Injectable } from '@nestjs/common';
import { API_OMIXON, OMIXON_KEY } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { OmixomStations, Sample } from 'modelos/src';

export interface Token {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  expires_at: number;
}

@Injectable()
export class OmixomRepository {
  constructor(private axios: AxiosService) {}

  async getEstaciones() {
    const url = `/stations`;
    return await this.axios.GET<OmixomStations[]>(`${API_OMIXON}${url}`, {
      headers: {
        Authorization: `Token ${OMIXON_KEY}`,
      },
    });
  }

  async getMuestrasPorRangoEIdsEstaciones(
    ids: number[],
    date_from: string,
    date_to?: string,
    limit?: number,
  ) {
    // {
    //     "stations": { // Caso campo stations​
    //         "30276": { // Limitación de muestras (Método 1)
    //             // Notar el -03:00. Esto es para indicar UTC-3 (Horario Argentino):​
    //             "date_from": "2024-01-01T10:30-03:00",
    //             "date_to": "2024-01-07T23:59-03:00",
    //             "modules": []
    //         }
    //     }
    // }
    const url = `/private_samples_range`;
    const stations = {};
    ids.forEach((id) => {
      stations[id] = {
        date_from: date_from,
        module: [],
      };
      if (date_to) {
        stations[id].date_to = date_to;
      }
      if (limit) {
        stations[id].limit = limit;
      }
    });
    const body = {
      stations,
    };
    return await this.axios.POST<Sample[]>(`${API_OMIXON}${url}`, body, {
      headers: {
        Authorization: `Token ${OMIXON_KEY}`,
      },
    });
  }
  async getTodasLasMuestras(
    date_from: string,
    date_to?: string,
    limit?: number,
  ) {
    // {
    //   // Caso sin campo stations con limitación de muestras (Método 2)​
    //   "date_from": "2024-01-01T10:30-03:00",​
    //   "limit": 3,​
    // }
    const url = `/private_samples_range`;
    const body = {
      date_from,
    };
    if (date_to) {
      body[date_to] = date_to;
    }
    if (limit) {
      body[limit] = limit;
    }
    return await this.axios.POST<Sample[]>(`${API_OMIXON}${url}`, body, {
      headers: {
        Authorization: `Token ${OMIXON_KEY}`,
      },
    });
  }

  async getUltimaMuestraPorIdEstaciones(ids: number[]) {
    // {​
    //   "stations": { // Caso campo stations​
    //   "8910": {​
    //   "modules": []​
    //   }​
    //   }​
    // }
    const url = '/private_last_measure';
    const stations = {};
    ids.forEach((id) => {
      stations[id] = {
        modules: [],
      };
    });
    const body = {
      stations,
    };
    return await this.axios.POST<Sample[]>(`${API_OMIXON}${url}`, body, {
      headers: {
        Authorization: `Token ${OMIXON_KEY}`,
      },
    });
  }

  async getUltimasMuestras() {
    const url = '/private_last_measure';
    const body = {};
    return await this.axios.POST<Sample[]>(`${API_OMIXON}${url}`, body, {
      headers: {
        Authorization: `Token ${OMIXON_KEY}`,
      },
    });
  }
}

// EJEMPLO getAssets
// [
//   {
//       "code": 30276,
//       "title": "General Roca AgriculturaCba",
//       "latitude": "-32.7470020000",
//       "longitude": "-61.9127530000",
//       "modules": [
//           {
//               "id": 8164,
//               "title": "Alerta de heladas",
//               "type": "Alertas de Heladas y Agroapp"
//           },
//           {
//               "id": 10706,
//               "title": "BUI",
//               "type": "BUI"
//           },
//           {
//               "id": 6443,
//               "title": "Batería",
//               "type": "Nivel de Batería"
//           },
//           {
//               "id": 10704,
//               "title": "DC",
//               "type": "DC"
//           },
//           {
//               "id": 10703,
//               "title": "DMC",
//               "type": "DMC"
//           },
//           {
//               "id": 19134,
//               "title": "Delta T",
//               "type": "Delta T"
//           },
//           {
//               "id": 19135,
//               "title": "Delta T - Recomendación",
//               "type": "Delta T - Recomendación"
//           },
//           {
//               "id": 6441,
//               "title": "Dirección de Viento",
//               "type": "Dirección de Viento"
//           },
//           {
//               "id": 15545,
//               "title": "Evapotranspiración",
//               "type": "Evapotranspiración"
//           },
//           {
//               "id": 10702,
//               "title": "FFMC",
//               "type": "FFMC"
//           },
//           {
//               "id": 8165,
//               "title": "Fase Lunar, Amanecer y Ocaso",
//               "type": "Fase Lunar, Amanecer y Ocaso"
//           },
//           {
//               "id": 6442,
//               "title": "Humedad",
//               "type": "Humedad"
//           },
//           {
//               "id": 10705,
//               "title": "ISI",
//               "type": "ISI"
//           },
//           {
//               "id": 12654,
//               "title": "ITH",
//               "type": "ITH"
//           },
//           {
//               "id": 10701,
//               "title": "Indice de peligro de incendios",
//               "type": "Indice de peligro de incendios"
//           },
//           {
//               "id": 6445,
//               "title": "Nivel de Napa Freática",
//               "type": "Nivel de agua subterranea"
//           },
//           {
//               "id": 9097,
//               "title": "Panel Solar",
//               "type": "Panel Solar"
//           },
//           {
//               "id": 6446,
//               "title": "Presión",
//               "type": "Presión"
//           },
//           {
//               "id": 6447,
//               "title": "Punto de rocío",
//               "type": "Punto de rocío"
//           },
//           {
//               "id": 6448,
//               "title": "Radiación Solar",
//               "type": "Radiación Solar"
//           },
//           {
//               "id": 6444,
//               "title": "Registro de lluvia",
//               "type": "Registro de lluvia"
//           },
//           {
//               "id": 6449,
//               "title": "Ráfaga de Viento",
//               "type": "Rafaga de Viento"
//           },
//           {
//               "id": 6450,
//               "title": "Señal",
//               "type": "Señal GPRS"
//           },
//           {
//               "id": 6451,
//               "title": "Temperatura",
//               "type": "Temperatura"
//           },
//           {
//               "id": 6452,
//               "title": "Temperatura de suelo",
//               "type": "Temperatura de suelo"
//           },
//           {
//               "id": 6453,
//               "title": "Velocidad de Viento",
//               "type": "Velocidad de Viento"
//           }
//       ]
//   }
// ]

// Ejmplo getMuestrasPorRangoPorEstaciones y getTodasLasMuestras
// [
//   {
//     date: '2024-01-05T10:30:00-03:00',
//     station: '30276',
//     '6441': 270.0,
//     '6442': 65.43767549749725,
//     '6443': 13.102031250000001,
//     '6444': 0.0,
//     '6445': -592.2417582417582,
//     '6446': 1003.75,
//     '6447': 21.7,
//     '6448': 535.3846153846154,
//     '6449': 17.260214400000002,
//     '6450': 17.0,
//     '6451': 28.822182883652786,
//     '6452': 23.6,
//     '6453': 9.7767648,
//     '9097': 18.500625,
//     '12654': 78.96034138124955,
//   },
// ];
