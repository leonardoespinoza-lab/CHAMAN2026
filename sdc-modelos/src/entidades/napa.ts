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
