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

export interface IEstablecimiento {
  _id?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  nombre?: string;
  ubicacion?: IUbicacion[];
  ubicacionAdministrativa?: DireccionV2;
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

type OmitirCreate = "_id" | "fechaCreacion";
export interface ICreateEstablecimiento
  extends Omit<Partial<IEstablecimiento>, OmitirCreate> {}

type OmitirUpdate = "_id" | "fechaCreacion";
export interface IUpdateEstablecimiento
  extends Omit<Partial<IEstablecimiento>, OmitirUpdate> {}
