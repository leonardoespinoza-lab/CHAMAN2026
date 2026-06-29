export type TNivelCargaFitosanitaria =
  "sin_datos" | "bajo" | "medio" | "alto" | "critico";

export interface IFitosanitarioFactor {
  nombre: string;
  valor: number;
  peso: number;
  detalle: string;
}

export interface IFitosanitarioAplicacionResumen {
  fecha?: string;
  producto?: string;
  principioActivo?: string;
  tipo?: string;
  dosisLtHa?: number;
  concentracion?: number;
  persistencia?: number;
  koc?: number;
  aporte: number;
}

export interface IFitosanitarioRiesgoSanitario {
  enfermedad: string;
  resultado: number;
  nivel: TNivelCargaFitosanitaria;
  variables?: Record<string, number>;
}

export interface ICargaFitosanitaria {
  loteId?: string;
  siembraId?: string;
  fechaCalculo: string;
  cultivo?: string;
  variedad?: string;
  etapaActual?: string;
  score: number;
  nivel: TNivelCargaFitosanitaria;
  lectura: string;
  recomendacion: string;
  presionEnfermedades: number;
  cargaQuimica: number;
  recenciaAplicaciones: number;
  aplicacionesTotales: number;
  aplicacionesUltimos30Dias: number;
  enfermedadesMonitoreadas: number;
  factores: IFitosanitarioFactor[];
  aplicaciones: IFitosanitarioAplicacionResumen[];
  enfermedades: IFitosanitarioRiesgoSanitario[];
  metodologia: string[];
  advertencias: string[];
}
