import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateReporteNDVI,
  IReporteNDVI,
  IReporteNDVIExterno,
} from 'modelos/src';

import { ReporteNDVIsService } from 'src/entidades/reporte-ndvis/service';
import { LotesService } from 'src/entidades/lote/service';

@Injectable()
export class EndpointsService {
  constructor(
    private reportesNdvis: ReporteNDVIsService,
    protected lotesService: LotesService,
  ) {}

  public async createReporte(body: IReporteNDVIExterno): Promise<IReporteNDVI> {
    const lote = await this.lotesService.getById(body.idLote);
    if (!lote) {
      throw new NotFoundException('Lote no encontrado');
    }

    const imagenes = (body?.imagenes ?? {}) as Record<string, string>;

    const reporteData: ICreateReporteNDVI = {
      idLote: body?.idLote,
      fechaDelReporte: body?.fecha,
      fechaDeLaImagen: body?.fechaImagen,
      idDepartamento: lote?.idDepartamento,
      idDistribuidor: lote?.idDistribuidor,
      idProductor: lote?.idProductor,
      idEstablecimiento: lote?.idEstablecimiento,
      idQuimica: lote?.idQuimica,
      ndviUrl: imagenes?.ndvi ?? body?.ndvi_url,
      ndviPromedio: body?.ndvi_promedio,
      indices: body?.indices,
      imagenes,
      metadataImagen: body?.metadata,
      coleccion: body?.coleccion,
    };

    // Buscar registro existente para el mismo lote y fecha de imagen (upsert)
    const filter = JSON.stringify({ idLote: body.idLote, fechaDeLaImagen: body.fechaImagen });
    const existentes = await this.reportesNdvis.get({ filter, limit: 1 });
    if (existentes?.datos?.length > 0) {
      const existente = existentes.datos[0];
      return await this.reportesNdvis.update(existente._id, reporteData);
    }

    return await this.reportesNdvis.create(reporteData);
  }
}
