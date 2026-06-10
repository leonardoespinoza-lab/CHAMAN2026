export interface ICoordenadas {
  lat: number;
  lng: number;
}

export interface DireccionV2 {
  calle?: string;
  entreCalles?: string;
  numero?: string;
  piso?: string;
  depto?: string;
  barrio?: string;
  localidad?: string;
  partido?: string;
  provincia?: string;
  direccion?: string;
  coordenadas?: ICoordenadas;
}
