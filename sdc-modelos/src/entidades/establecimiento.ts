import { IUbicacion } from "../compartidos/ubicacion";
import { DireccionV2 } from "../compartidos/coordenadas";
import {
  IClimaEstacionMeteorologica,
  IPronosticoEstacionMeteorologica,
} from "./clima";
import { IDistribuidor } from "./distribuidor";
import { IEstacion } from "./estacion";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import {
  IUbicacionAdministrativaEstablecimiento,
  IUbicacionAdministrativaLegadaEstablecimiento,
} from "./ubicacion-lote";

export interface IEstablecimiento {
  _id?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  nombre?: string;
  ubicacion?: IUbicacion[];
  /** @deprecated Solo lectura. Se conserva para compatibilidad y auditoria. */
  ubicacionAdministrativa?: DireccionV2;
  ubicacionAdministrativaLegada?: IUbicacionAdministrativaLegadaEstablecimiento;
  ubicacionOficial?: IUbicacionAdministrativaEstablecimiento;
  idEstacionMeteorologica?: string;
  fuenteClimaPreferida?: "FieldClimate" | "Open-Meteo" | "Chaman";
  fechaCreacion?: string;
  prediccionClimatica?: {
    fecha?: string;
    pronosticos?: IPronosticoEstacionMeteorologica[];
  };
  climaActual?: {
    fecha?: string;
    clima?: IClimaEstacionMeteorologica;
  };
  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  estacionMeteorologica?: IEstacion;
}

type OmitirCreate =
  | "_id"
  | "fechaCreacion"
  | "ubicacionAdministrativa"
  | "ubicacionAdministrativaLegada"
  | "ubicacionOficial";
export interface ICreateEstablecimiento
  extends Omit<Partial<IEstablecimiento>, OmitirCreate> {}

type OmitirUpdate =
  | "_id"
  | "fechaCreacion"
  | "ubicacionAdministrativa"
  | "ubicacionAdministrativaLegada"
  | "ubicacionOficial";
export interface IUpdateEstablecimiento
  extends Omit<Partial<IEstablecimiento>, OmitirUpdate> {}
