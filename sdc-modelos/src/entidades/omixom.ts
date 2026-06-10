export interface OmixomStations {
  code?: number;
  title?: string;
  latitude?: string;
  longitude?: string;
  modules?: Module[];
}

export interface Module {
  id?: number;
  title?: string;
  type?: string;
  tipo?: string; // Temperatura, Humedad, etc para nosotros
}

export interface Sample {
  date?: string;
  station?: string;
  /// Esta unión es una mierda
  // Los valores son siempre en número
  [key: string]: string | number | undefined;
}
