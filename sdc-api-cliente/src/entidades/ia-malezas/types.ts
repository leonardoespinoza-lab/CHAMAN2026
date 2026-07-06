export type IaMalezaEstado = 'pendiente' | 'procesando' | 'completado' | 'error';

export interface IaMalezaDetection {
  class: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface IaMalezaAnalisis {
  _id?: string;
  ensayoId?: string;
  loteId?: string;
  loteNombre?: string;
  cultivo?: string;
  campania?: string;
  fecha?: string;
  tipoAnalisis?: string;
  estado?: IaMalezaEstado;
  originalFilename?: string;
  mimeType?: string;
  sizeBytes?: number;
  originalImagePath?: string;
  processedImagePath?: string;
  originalImageUrl?: string;
  processedImageUrl?: string;
  modelVersion?: string;
  detections?: IaMalezaDetection[];
  summary?: Record<string, any>;
  resultJson?: Record<string, any>;
  error?: string;
  analyzedAt?: Date;
  experimental?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WeedAiResponse {
  status: string;
  model_version: string;
  detections: IaMalezaDetection[];
  summary: Record<string, any>;
  processed_image_base64?: string;
}
