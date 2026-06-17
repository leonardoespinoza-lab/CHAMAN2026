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

export interface IZonaGeografica {
  id?: string;
  tipo?: 'localidad' | 'departamento' | 'provincia' | 'direccion';
  label?: string;
  localidad?: string;
  departamento?: string;
  provincia?: string;
  municipio?: string;
  coordenadas?: ICoordenadas;
  fuente?: string;
}
