import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IQueryParam } from 'modelos/src';
import { extname, isAbsolute, join, relative, resolve } from 'path';
import { promises as fs } from 'fs';
import {
  API_WEED_AI,
  WEED_AI_DISABLE_FALLBACK,
  WEED_AI_STORAGE_DIR,
  WEED_AI_TIMEOUT_MS,
} from '../../env';
import { IaMalezasRepository } from './repository';
import { IaMalezaAnalisis, IaMalezaDetection, WeedAiResponse } from './types';

const IMAGE_LIMIT_BYTES = 12 * 1024 * 1024;

const CLASS_KNOWLEDGE: Record<
  string,
  {
    label: string;
    group: string;
    agronomicNote: string;
    recommendation: string;
    severity: IaMalezaDetection['severity'];
  }
> = {
  cultivo: {
    label: 'Cultivo',
    group: 'Cobertura util',
    agronomicNote:
      'El modelo identifica tejido vegetal compatible con cultivo; sirve para separar cultivo de maleza y suelo.',
    recommendation:
      'Usar como referencia de cobertura. No implica intervencion por malezas.',
    severity: 'informativo',
  },
  suelo: {
    label: 'Suelo visible',
    group: 'Contexto',
    agronomicNote:
      'Suelo visible indica baja cobertura o sectores abiertos donde puede emerger maleza si hay humedad y temperatura.',
    recommendation:
      'Cruzar con emergencia hidrotermal, humedad superficial y recorrida de borde.',
    severity: 'bajo',
  },
  maleza_generica: {
    label: 'Maleza generica',
    group: 'Maleza no clasificada',
    agronomicNote:
      'Deteccion vegetal compatible con maleza, sin certeza suficiente para asignar especie.',
    recommendation:
      'Solicitar foto mas cercana o confirmacion de campo antes de decidir tratamiento.',
    severity: 'medio',
  },
  amaranthus: {
    label: 'Amaranthus / yuyo colorado',
    group: 'Latifoliada anual',
    agronomicNote:
      'Maleza muy competitiva en estadios tempranos; puede crecer rapido con temperatura y humedad favorables.',
    recommendation:
      'Priorizar confirmacion temprana, densidad por metro y estrategia segun cultivo y residualidad disponible.',
    severity: 'alto',
  },
  rama_negra: {
    label: 'Rama negra / Conyza',
    group: 'Latifoliada de dificil control',
    agronomicNote:
      'Cuando avanza de roseta a elongacion pierde sensibilidad y aumenta el costo de control.',
    recommendation:
      'Confirmar estadio y tamaño. Evitar decisiones tardias si se detecta foco activo.',
    severity: 'alto',
  },
  eleusine: {
    label: 'Eleusine / pata de gallina',
    group: 'Graminea anual',
    agronomicNote:
      'Graminea de emergencia escalonada; compite fuerte con cultivos estivales y bordes compactados.',
    recommendation:
      'Validar foco, cobertura y estado del cultivo; cruzar con historial de escapes.',
    severity: 'medio',
  },
};

@Injectable()
export class IaMalezasService {
  private readonly logger = new Logger(IaMalezasService.name);
  private readonly storageDir = resolve(WEED_AI_STORAGE_DIR);

  constructor(private repository: IaMalezasRepository) {}

  async getById(id: string): Promise<IaMalezaAnalisis> {
    return await this.repository.getById(id);
  }

  async get(query: IQueryParam) {
    return await this.repository.get(query);
  }

  async upload(files: any[], body: Record<string, any>) {
    if (!files?.length) {
      throw new BadRequestException('Cargue al menos una imagen');
    }
    await fs.mkdir(this.storageDir, { recursive: true });

    const uploaded: IaMalezaAnalisis[] = [];
    for (const file of files) {
      this.validateImage(file);
      const created = await this.repository.create({
        ensayoId: body.ensayoId || body.ensayo_id || '',
        loteId: body.loteId || body.lote_id || '',
        loteNombre: body.loteNombre || '',
        cultivo: body.cultivo || '',
        campania: body.campania || body.campaña || '',
        fecha: body.fecha || '',
        tipoAnalisis: body.tipoAnalisis || 'deteccion_malezas',
        estado: 'pendiente',
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sourceType: 'upload',
        experimental: true,
      });

      const id = created._id;
      const ext = this.safeExtension(file.originalname, file.mimetype);
      const originalPath = join(this.storageDir, `${id}-original${ext}`);
      await fs.writeFile(originalPath, file.buffer);
      const updated = await this.repository.update(id, {
        originalImagePath: originalPath,
        originalImageUrl: `/ia-malezas/${id}/imagen/original`,
      });
      uploaded.push(updated);
    }
    return uploaded;
  }

  async importFoto(body: Record<string, any>) {
    const fotoId = body.fotoId || body.idFoto || body.sourcePhotoId;
    if (!fotoId) {
      throw new BadRequestException('Foto de camara requerida');
    }
    const foto = await this.repository.getFotoById(fotoId);
    if (!foto?._id || !foto.url) {
      throw new NotFoundException('Foto de camara no encontrada');
    }
    await fs.mkdir(this.storageDir, { recursive: true });

    const imageBuffer = await this.fetchImageBuffer(foto.url);
    if (imageBuffer.byteLength > IMAGE_LIMIT_BYTES) {
      throw new BadRequestException('La imagen supera el limite de 12 MB');
    }

    const created = await this.repository.create({
      ensayoId: body.ensayoId || '',
      loteId: body.loteId || foto.idLote || '',
      loteNombre: body.loteNombre || foto.lote?.nombre || '',
      cultivo: body.cultivo || '',
      campania: body.campania || '',
      fecha: body.fecha || this.fechaDesdeFoto(foto.fechaCreacion),
      tipoAnalisis: body.tipoAnalisis || 'deteccion_malezas',
      estado: 'pendiente',
      originalFilename: foto.nombreOriginal || `${foto.serialCamara || 'camara'}-${foto._id}.jpg`,
      mimeType: this.mimeDesdeUrl(foto.url),
      sizeBytes: imageBuffer.byteLength,
      sourceType: 'chaman_camera',
      sourcePhotoId: foto._id,
      cameraSerial: foto.serialCamara,
      cameraUrl: foto.url,
      experimental: true,
    });

    const originalPath = join(this.storageDir, `${created._id}-original${this.extensionDesdeUrl(foto.url)}`);
    await fs.writeFile(originalPath, imageBuffer);
    return await this.repository.update(created._id, {
      originalImagePath: originalPath,
      originalImageUrl: `/ia-malezas/${created._id}/imagen/original`,
    });
  }

  async analyze(id: string): Promise<IaMalezaAnalisis> {
    const record = await this.repository.getById(id);
    if (!record?._id) throw new NotFoundException('Analisis no encontrado');
    if (!record.originalImagePath) {
      throw new BadRequestException('El analisis no tiene imagen original');
    }

    await this.repository.update(id, { estado: 'procesando', error: '' });

    try {
      const imageBuffer = await fs.readFile(this.resolveInsideStorage(record.originalImagePath));
      const response = await this.callWeedAi(record, imageBuffer);
      const enriched = this.enrichResponse(record, response);
      const processedPath = await this.saveProcessedImage(id, enriched);

      return await this.repository.update(id, {
        estado: 'completado',
        modelVersion: enriched.model_version,
        detections: enriched.detections || [],
        summary: enriched.summary || {},
        resultJson: enriched as any,
        processedImagePath: processedPath || record.originalImagePath,
        processedImageUrl: `/ia-malezas/${id}/imagen/procesada`,
        analyzedAt: new Date(),
        error: '',
        experimental: true,
      });
    } catch (error) {
      const message = error?.message || 'Error al analizar imagen';
      this.logger.warn(`IA malezas ${id}: ${message}`);
      if (WEED_AI_DISABLE_FALLBACK) {
        await this.repository.update(id, { estado: 'error', error: message });
        throw new InternalServerErrorException(message);
      }

      const fallback = this.enrichResponse(record, this.mockResult());
      return await this.repository.update(id, {
        estado: 'completado',
        modelVersion: fallback.model_version,
        detections: fallback.detections,
        summary: fallback.summary,
        resultJson: {
          ...fallback,
          warning: `Fallback local por falla del microservicio: ${message}`,
        },
        processedImagePath: record.originalImagePath,
        processedImageUrl: `/ia-malezas/${id}/imagen/procesada`,
        analyzedAt: new Date(),
        error: '',
        experimental: true,
      });
    }
  }

  async delete(id: string): Promise<IaMalezaAnalisis> {
    return await this.repository.delete(id);
  }

  async health() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEED_AI_TIMEOUT_MS);
      const response = await fetch(`${API_WEED_AI}/health`, {
        method: 'GET',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      return {
        status: 'degraded',
        mode: 'backend-fallback',
        model_version: 'weed-yolo-fallback-v0.1',
        detail: error?.message || 'Microservicio IA no disponible',
      };
    }
  }

  async imagePath(id: string, tipo: 'original' | 'procesada'): Promise<string> {
    const record = await this.repository.getById(id);
    if (!record?._id) throw new NotFoundException('Analisis no encontrado');
    const selected =
      tipo === 'procesada'
        ? record.processedImagePath || record.originalImagePath
        : record.originalImagePath;
    if (!selected) throw new NotFoundException('Imagen no encontrada');
    return this.resolveInsideStorage(selected);
  }

  private validateImage(file: any) {
    if (!file?.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Solo se permiten imagenes');
    }
    if (file.size > IMAGE_LIMIT_BYTES) {
      throw new BadRequestException('La imagen supera el limite de 12 MB');
    }
  }

  private safeExtension(name: string, mimeType: string) {
    const ext = (extname(name || '') || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext;
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '.jpg';
  }

  private resolveInsideStorage(filePath: string) {
    const resolved = resolve(filePath);
    const diff = relative(this.storageDir, resolved);
    if (diff.startsWith('..') || isAbsolute(diff)) {
      throw new BadRequestException('Ruta de imagen invalida');
    }
    return resolved;
  }

  private async callWeedAi(
    record: IaMalezaAnalisis,
    imageBuffer: Buffer,
  ): Promise<WeedAiResponse> {
    const form = new FormData();
    const imageArrayBuffer = imageBuffer.buffer.slice(
      imageBuffer.byteOffset,
      imageBuffer.byteOffset + imageBuffer.byteLength,
    ) as ArrayBuffer;
    form.append(
      'image',
      new Blob([imageArrayBuffer], { type: record.mimeType || 'image/jpeg' }),
      record.originalFilename || 'imagen.jpg',
    );
    form.append('lote_id', record.loteId || '');
    form.append('ensayo_id', record.ensayoId || '');
    form.append('cultivo', record.cultivo || '');
    form.append('fecha', record.fecha || '');
    form.append('campania', record.campania || '');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEED_AI_TIMEOUT_MS);
    const response = await fetch(`${API_WEED_AI}/weed-detection/analyze`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      throw new Error(`Microservicio IA respondio HTTP ${response.status}`);
    }
    return (await response.json()) as WeedAiResponse;
  }

  private async saveProcessedImage(id: string, response: WeedAiResponse) {
    if (!response.processed_image_base64) return '';
    const processedPath = join(this.storageDir, `${id}-procesada.jpg`);
    await fs.writeFile(
      processedPath,
      Buffer.from(response.processed_image_base64, 'base64'),
    );
    return processedPath;
  }

  private mockResult(): WeedAiResponse {
    const detection: IaMalezaDetection = {
      class: 'maleza_generica',
      confidence: 0.58,
      bbox: { x1: 120, y1: 80, x2: 260, y2: 310 },
    };
    return {
      status: 'ok',
      model_version: 'weed-yolo-fallback-v0.1',
      detections: [detection],
      summary: {
        total_detections: 1,
        weed_detected: true,
        classes_detected: ['maleza_generica'],
        max_confidence: detection.confidence,
      },
    };
  }

  private enrichResponse(
    record: IaMalezaAnalisis,
    response: WeedAiResponse,
  ): WeedAiResponse {
    const detections = (response.detections || []).map((detection) => {
      const key = this.normalizarClase(detection.class);
      const knowledge = CLASS_KNOWLEDGE[key] || CLASS_KNOWLEDGE.maleza_generica;
      return {
        ...detection,
        class: key,
        label: knowledge.label,
        group: knowledge.group,
        agronomicNote: knowledge.agronomicNote,
        recommendation: knowledge.recommendation,
        severity: knowledge.severity,
      };
    });
    const classesDetected = Array.from(new Set(detections.map((item) => item.class)));
    const species = classesDetected
      .filter((value) => !['cultivo', 'suelo'].includes(value))
      .map((value) => CLASS_KNOWLEDGE[value]?.label || value);
    const maxConfidence = Math.max(
      ...detections.map((item) => Number(item.confidence || 0)),
      0,
    );
    return {
      ...response,
      detections,
      summary: {
        ...(response.summary || {}),
        total_detections: detections.length,
        weed_detected: species.length > 0,
        classes_detected: classesDetected,
        species_detected: species,
        max_confidence: Number(maxConfidence.toFixed(4)),
        lectura_agronomica: this.lecturaAgronomica(record, detections),
        accion_sugerida: this.accionSugerida(detections),
        calidad_visual:
          maxConfidence >= 0.75
            ? 'alta'
            : maxConfidence >= 0.55
              ? 'media'
              : 'baja',
      },
    };
  }

  private lecturaAgronomica(
    record: IaMalezaAnalisis,
    detections: IaMalezaDetection[],
  ): string {
    if (!detections.length) {
      return 'Sin detecciones visibles. Repetir con buena iluminacion y encuadre cercano si el lote tiene sospecha de nacimiento.';
    }
    const weeds = detections.filter(
      (item) => !['cultivo', 'suelo'].includes(item.class),
    );
    if (!weeds.length) {
      return `${record.cultivo || 'Cultivo'}: la imagen no muestra malezas clasificadas; usar como evidencia visual de cobertura y suelo.`;
    }
    const main = weeds.sort((a, b) => b.confidence - a.confidence)[0];
    return `${record.cultivo || 'Lote'}: deteccion principal ${main.label || main.class} con ${Math.round(
      main.confidence * 100,
    )}% de confianza. Confirmar con recorrida antes de tomar una decision quimica.`;
  }

  private accionSugerida(detections: IaMalezaDetection[]): string {
    const high = detections.find((item) => item.severity === 'alto');
    if (high) return high.recommendation || 'Priorizar confirmacion de campo.';
    const medium = detections.find((item) => item.severity === 'medio');
    if (medium) return medium.recommendation || 'Confirmar foco y densidad.';
    return 'Mantener monitoreo visual y cruzar con prediccion hidrotermal.';
  }

  private normalizarClase(value: string): string {
    return String(value || 'maleza_generica')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  private async fetchImageBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException(`No se pudo leer la imagen de camara (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private fechaDesdeFoto(fecha?: string): string {
    if (!fecha) return new Date().toISOString().slice(0, 10);
    return new Date(fecha).toISOString().slice(0, 10);
  }

  private extensionDesdeUrl(url: string): string {
    const clean = url.split('?')[0].toLowerCase();
    if (clean.endsWith('.png')) return '.png';
    if (clean.endsWith('.webp')) return '.webp';
    return '.jpg';
  }

  private mimeDesdeUrl(url: string): string {
    const ext = this.extensionDesdeUrl(url);
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return 'image/jpeg';
  }
}
