import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateReporteNDVI,
  IMetadata,
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
    const metadataImagen = this.validarMetadataSatelital(body, lote);

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
      metadataImagen,
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

  private validarMetadataSatelital(body: IReporteNDVIExterno, lote: any): IMetadata | undefined {
    const metadata = body?.metadata;
    const imagenes = (body?.imagenes ?? {}) as Record<string, string>;
    const tieneImagenRaster = Boolean(body?.ndvi_url || Object.keys(imagenes).length);
    if (!tieneImagenRaster) {
      return metadata;
    }

    const bboxImagen = this.bboxGeojson(metadata?.geojson);
    const bboxLote = this.bboxGeojson(lote?.ubicacion?.geojson);
    if (!bboxImagen || !bboxLote) {
      throw new BadRequestException('Metadata satelital incompleta: falta geometria de imagen o lote');
    }

    const loteArea = this.bboxArea(bboxLote);
    const imageArea = this.bboxArea(bboxImagen);
    const overlap = this.bboxIntersectionArea(bboxImagen, bboxLote);
    if (loteArea <= 0 || imageArea <= 0 || overlap <= 0) {
      throw new BadRequestException('Metadata satelital no coincide con el lote');
    }

    const overlapRatio = overlap / loteArea;
    const areaRatio = imageArea / loteArea;
    if (overlapRatio < 0.55 || areaRatio < 0.25 || areaRatio > 4) {
      throw new BadRequestException('Metadata satelital fuera del marco esperado del lote');
    }

    return {
      ...metadata,
      loteId: body.idLote,
      geometryCheck: {
        status: 'ok',
        overlapRatio: Math.round(overlapRatio * 10000) / 10000,
        areaRatio: Math.round(areaRatio * 10000) / 10000,
      },
    } as IMetadata;
  }

  private bboxGeojson(geojson: any): [number, number, number, number] | undefined {
    const coords = this.extraerCoordenadas(geojson?.coordinates);
    if (!coords.length) {
      return undefined;
    }
    const xs = coords.map((coord) => coord[0]).filter((value) => Number.isFinite(value));
    const ys = coords.map((coord) => coord[1]).filter((value) => Number.isFinite(value));
    if (!xs.length || !ys.length) {
      return undefined;
    }
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  private extraerCoordenadas(value: any): Array<[number, number]> {
    if (!Array.isArray(value)) {
      return [];
    }
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      return [[Number(value[0]), Number(value[1])]];
    }
    return value.flatMap((item) => this.extraerCoordenadas(item));
  }

  private bboxArea(bbox: [number, number, number, number]): number {
    return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
  }

  private bboxIntersectionArea(a: [number, number, number, number], b: [number, number, number, number]): number {
    const width = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
    const height = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    return width * height;
  }
}
