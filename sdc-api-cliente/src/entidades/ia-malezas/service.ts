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
      const processedPath = await this.saveProcessedImage(id, response);

      return await this.repository.update(id, {
        estado: 'completado',
        modelVersion: response.model_version,
        detections: response.detections || [],
        summary: response.summary || {},
        resultJson: response as any,
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

      const fallback = this.mockResult();
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
}
