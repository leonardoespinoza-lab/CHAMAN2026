import { ICoordenadas, IEstacion } from 'modelos/src';

export class HelperService {
  static filtroToObject(filtro: string) {
    let filter: any;
    try {
      filter = JSON.parse(filtro);
    } catch (error) {
      filter = {};
    }
    return filter;
  }

  static getCentro(coordenadas?: ICoordenadas[]): ICoordenadas {
    if (coordenadas?.length) {
      const newPolygon: ICoordenadas[] = JSON.parse(
        JSON.stringify(coordenadas),
      );
      const longitudes = newPolygon.map((i) => i.lat);
      const latitudes = newPolygon.map((i) => i.lng);
      latitudes.sort((a, b) => a - b);
      longitudes.sort((a, b) => a - b);
      const lowX = latitudes[0];
      const highX = latitudes[latitudes.length - 1];
      const lowy = longitudes[0];
      const highy = longitudes[latitudes.length - 1];
      const centerX = lowX + (highX - lowX) / 2;
      const centerY = lowy + (highy - lowy) / 2;
      const center: ICoordenadas = {
        lng: centerX,
        lat: centerY,
      };
      return center;
    }
    return { lng: 0, lat: 0 };
  }

  static calcularArea(poligono: ICoordenadas[]): number {
    const R = 6378137; // Radio de la Tierra en metros (esfera WGS84)
    let area = 0;

    if (poligono.length < 3) return 0; // No es un polígono válido

    for (let i = 0; i < poligono.length; i++) {
      const j = (i + 1) % poligono.length;

      const xi = (poligono[i].lng * Math.PI) / 180;
      const yi = (poligono[i].lat * Math.PI) / 180;

      const xj = (poligono[j].lng * Math.PI) / 180;
      const yj = (poligono[j].lat * Math.PI) / 180;

      // Shoelace formula adapted for spherical coordinates
      area += xi * (2 + Math.sin(yi) + Math.sin(yj)) * (xj - xi);
    }

    area = (area * R * R) / 2;

    // Convertir de metros cuadrados a hectáreas (1 hectárea = 10,000 m²)
    return Math.abs(area / 10000);
  }

  static generarPoligono10Hectareas(
    centro: ICoordenadas,
    lados = 4,
  ): ICoordenadas[] {
    const R = 6378137; // Radio de la Tierra en metros (esfera WGS84)
    const areaHectareas = 10;
    const areaMetrosCuadrados = areaHectareas * 10000; // 10 hectáreas = 100,000 m²

    // Calcular el radio necesario para cubrir 10 hectáreas
    const radio = Math.sqrt(areaMetrosCuadrados / Math.PI);

    // Lista para almacenar los vértices del polígono
    const vertices: ICoordenadas[] = [];

    // Convertir el radio en metros a grados de latitud/longitud
    const radioLat = (radio / R) * (180 / Math.PI); // En grados de latitud
    const radioLng =
      (radio / (R * Math.cos((centro.lat * Math.PI) / 180))) * (180 / Math.PI); // En grados de longitud, ajustado por la latitud

    // Generar los vértices del polígono regular
    for (let i = 0; i < lados; i++) {
      const angulo = (2 * Math.PI * i) / lados; // Ángulo en radianes para cada vértice
      const vertice: ICoordenadas = {
        lat: centro.lat + radioLat * Math.cos(angulo),
        lng: centro.lng + radioLng * Math.sin(angulo),
      };
      vertices.push(vertice);
    }

    return vertices;
  }

  static distanciaEnMetros(punto1: ICoordenadas, punto2: ICoordenadas) {
    if (+punto1?.lat && +punto1?.lng && +punto2?.lat && +punto2?.lng) {
      const R = 6371e3; // metres
      const φ1 = punto1.lat * (Math.PI / 180); // φ, λ in radians
      const φ2 = punto2.lat * (Math.PI / 180);
      const Δφ = (punto2.lat - punto1.lat) * (Math.PI / 180);
      const Δλ = (punto2.lng - punto1.lng) * (Math.PI / 180);

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const d = R * c; // in metres
      return d;
    }
    return 0;
  }

  static distanciaEstacionEnMetros(punto: ICoordenadas, estacion: IEstacion) {
    const coordEstacion: ICoordenadas = {
      lng: estacion.position.geo.coordinates[0],
      lat: estacion.position.geo.coordinates[1],
    };
    return Math.trunc(this.distanciaEnMetros(punto, coordEstacion));
  }

  static generarCoordenadasAleatoriasArgentina(): ICoordenadas {
    // Definir los límites geográficos para las provincias
    const provincias = [
      {
        nombre: 'Córdoba',
        latMin: -33.5,
        latMax: -30.0,
        lngMin: -65.0,
        lngMax: -63.0,
      },
      {
        nombre: 'Santa Fe',
        latMin: -34.5,
        latMax: -28.0,
        lngMin: -62.0,
        lngMax: -58.0,
      },
      {
        nombre: 'Buenos Aires',
        latMin: -41.0,
        latMax: -34.0,
        lngMin: -63.0,
        lngMax: -57.0,
      },
      {
        nombre: 'La Pampa',
        latMin: -39.0,
        latMax: -35.0,
        lngMin: -67.5,
        lngMax: -63.0,
      },
    ];

    // Elegir una provincia aleatoria
    const provincia = provincias[Math.floor(Math.random() * provincias.length)];

    // Generar una latitud y longitud aleatoria dentro de los límites de la provincia seleccionada
    const lat =
      Math.random() * (provincia.latMax - provincia.latMin) + provincia.latMin;
    const lng =
      Math.random() * (provincia.lngMax - provincia.lngMin) + provincia.lngMin;

    return { lat, lng };
  }
}
