/** Metadatos comunes para retirar una entidad de la operacion sin destruirla. */
export interface IArchivado {
  archivado?: boolean;
  fechaArchivado?: string;
  archivadoPor?: string;
  motivoArchivado?: string;
}

export interface ISolicitudArchivado {
  archivadoPor?: string;
  motivoArchivado?: string;
}
