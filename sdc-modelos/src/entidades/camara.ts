import { IFoto } from "./foto";
import { ILote } from "./lote";

export type TOrigenCamara = "hik-connect" | "ftp";

export interface ICamara {
  serialCamara: string;
  nombre?: string;
  modelo?: string;
  categoria?: string;
  canal?: number;
  online?: boolean;
  area?: string;
  fuente?: TOrigenCamara;
  lotes?: ILote[];
  ultimaFoto?: IFoto;
  totalFotos?: number;
  raw?: Record<string, unknown>;
}

export interface IAsignarCamaraLotes {
  idsLote: string[];
  reemplazar?: boolean;
}
