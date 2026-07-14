import {
  IPerfilProfundidadSuelo,
  IUnidadSueloLote,
  TConfianzaInteligenciaSuelo,
  TTexturaSuelo,
} from 'modelos/src';

export interface IntaSoilProviderResult {
  units: IUnidadSueloLote[];
  coveragePercentage: number;
  directTexture?: TTexturaSuelo;
  directTextureOriginal?: string;
  confidence: TConfianzaInteligenciaSuelo;
  sourceVersions: Record<string, string>;
  warnings: string[];
  failedLayers: string[];
}

export interface SoilGridsProviderResult {
  profile: IPerfilProfundidadSuelo[];
  coveragePercentage: number;
  resolutionMeters: number;
  confidence: TConfianzaInteligenciaSuelo;
  sourceVersion: string;
  warnings: string[];
}
