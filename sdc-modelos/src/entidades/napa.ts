export type CalidadReferenciaNapas = 'alta' | 'media' | 'baja' | 'sin_datos';

export interface INapaPozoReferencia {
  id: string;
  nombre?: string;
  provincia?: string;
  departamento?: string;
  cuenca?: string;
  uso?: string;
  fecha?: string;
  profundidadM?: number;
  nivelEstaticoM?: number;
  nivelDinamicoM?: number;
  caudalMedio?: number;
  lat: number;
  lng: number;
  distanciaKm: number;
  fuente?: string;
  tieneNivel: boolean;
}

export interface INapaReferenciaLote {
  fuente: string;
  fechaConsulta: string;
  cobertura: {
    radioKm: number;
    totalPozos: number;
    pozosConNivel: number;
    distanciaMasCercanaKm?: number;
    distanciaMasCercanaConNivelKm?: number;
    calidad: CalidadReferenciaNapas;
    lectura: string;
  };
  estadisticas?: {
    nivelEstaticoPromedioM?: number;
    nivelEstaticoMedianaM?: number;
    nivelEstaticoMinM?: number;
    nivelEstaticoMaxM?: number;
    profundidadPromedioM?: number;
    fechaMasReciente?: string;
  };
  pozos: INapaPozoReferencia[];
  trazas: string[];
}

export type TipoFuenteSeguimientoNapa =
  "sensor_lote" | "sensor_cercano" | "sias";

export interface IOrigenSensorNapa {
  fuente: "Milesight/LoRaWAN";
  servicio: "nivel-napa";
  lote: string;
  fabricante?: string;
  modelo?: string;
  fCnt?: number;
  decoderId?: string;
  decoderVersion?: string;
  conversionModel?: "lineal-4-20ma-v1";
}

interface ISeguimientoNapaBase {
  tipo: TipoFuenteSeguimientoNapa;
  fechaConsulta: string;
  mensaje: string;
}

interface ISeguimientoNapaSensorBase extends ISeguimientoNapaBase {
  tipo: "sensor_lote" | "sensor_cercano";
  nivelM: number;
  unidad: "m";
  referencia: "nivel_terreno";
  fechaMedicion: string;
  fechaRecepcion?: string;
  frescura: "actual" | "demorada";
  edadMinutos: number;
  columnaAguaM?: number;
  profundidadInstalacionM?: number;
  origen: IOrigenSensorNapa;
}

export interface ISeguimientoNapaSensorLote extends ISeguimientoNapaSensorBase {
  tipo: "sensor_lote";
  distanciaKm: 0;
}

export interface ISeguimientoNapaSensorCercano extends ISeguimientoNapaSensorBase {
  tipo: "sensor_cercano";
  distanciaKm: number;
}

/**
 * Resumen territorial deliberadamente sin coordenadas ni inventario de pozos.
 * El detalle público completo continúa disponible en INapaReferenciaLote.
 */
export interface ISeguimientoNapaSias extends ISeguimientoNapaBase {
  tipo: "sias";
  nivelM?: number;
  unidad: "m";
  referencia: "nivel_terreno";
  fechaMedicion?: string;
  frescura: "territorial" | "sin_datos";
  fuente: "SIAS/COHIFE";
  cobertura: INapaReferenciaLote["cobertura"];
  estadisticas?: INapaReferenciaLote["estadisticas"];
}

/**
 * Fuente principal que debe mostrar la tarjeta. Nunca contiene DevEUI,
 * payload LoRaWAN ni coordenadas del sensor usado como referencia.
 */
export type INapaSeguimientoLote =
  | ISeguimientoNapaSensorLote
  | ISeguimientoNapaSensorCercano
  | ISeguimientoNapaSias;
