import { timingSafeEqual } from 'crypto';
import { RequestHandler } from 'express';
import path from 'path';

export const FIELD_PHOTO_STORAGE_ROOT = 'CAMPO';
export const FIELD_PHOTO_MAX_BYTES = 12 * 1024 * 1024;

export interface OperationalTokenHeaders {
  authorization?: string;
  explicitToken?: string;
}

export interface FieldPhotoStoragePlan {
  targetDir: string;
  targetPath: string;
  relativePath: string;
  storedName: string;
}

export function extractOperationalToken(headers: OperationalTokenHeaders): string {
  const bearer = String(headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  return bearer || String(headers.explicitToken || '').trim();
}

export function operationalTokenMatches(candidate: string, expected: string): boolean {
  const supplied = Buffer.from(String(candidate || ''), 'utf8');
  const configured = Buffer.from(String(expected || ''), 'utf8');
  if (!supplied.length || !configured.length || supplied.length !== configured.length) {
    return false;
  }
  return timingSafeEqual(supplied, configured);
}

export function hasOperationalAccess(
  headers: OperationalTokenHeaders,
  expectedToken: string,
): boolean {
  return operationalTokenMatches(extractOperationalToken(headers), expectedToken);
}

function decodePath(rawPath: string): string {
  let decoded = String(rawPath || '').split(/[?#]/, 1)[0].replace(/\\/g, '/');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  const collapsed = decoded.replace(/\/+/g, '/');
  return path.posix.normalize(collapsed.startsWith('/') ? collapsed : `/${collapsed}`);
}

/**
 * Detects the private field-photo namespace both before and after the
 * middleware is mounted at /imagenes. Encoded or mixed-case CAMPO segments
 * are private too.
 */
export function isPrivateFieldPhotoPath(rawPath: string): boolean {
  const decoded = decodePath(rawPath);
  const segments = decoded.split('/').filter(Boolean);
  const imageRoot = segments[0]?.toLowerCase() === 'imagenes' ? 1 : 0;
  return segments[imageRoot]?.toLowerCase() === FIELD_PHOTO_STORAGE_ROOT.toLowerCase();
}

export function privateFieldPhotoAccess(
  expectedToken: string,
): RequestHandler {
  return (req, res, next) => {
    if (!isPrivateFieldPhotoPath(req.originalUrl || req.url || req.path)) {
      next();
      return;
    }

    if (
      hasOperationalAccess(
        {
          authorization: req.get('authorization') || '',
          explicitToken: req.get('x-timelapse-token') || '',
        },
        expectedToken,
      )
    ) {
      next();
      return;
    }

    // Do not reveal whether a predictable private path exists.
    res.status(404).json({ ok: false, message: 'Imagen no encontrada.' });
  };
}

export function sanitizeFieldPhotoSegment(
  value: string,
  fallback: string,
): string {
  const clean = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^\.+$/, '');
  return clean || fallback;
}

function imageSignatureMatches(bytes: Buffer, contentType: string): boolean {
  if (/jpeg/i.test(contentType)) {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (/png/i.test(contentType)) {
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (/webp/i.test(contentType)) {
    return (
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
}

export function assertValidFieldPhoto(
  bytes: Buffer,
  contentType: string,
): void {
  const normalizedType = String(contentType || '').split(';', 1)[0].trim();
  if (!/^image\/(jpeg|png|webp)$/i.test(normalizedType)) {
    throw new Error('Formato de imagen no admitido.');
  }
  if (!bytes?.length) {
    throw new Error('La imagen esta vacia.');
  }
  if (bytes.length > FIELD_PHOTO_MAX_BYTES) {
    throw new Error('La imagen supera el limite de 12 MB.');
  }
  if (!imageSignatureMatches(bytes, normalizedType)) {
    throw new Error('El contenido no coincide con una imagen valida.');
  }
}

function extensionFor(contentType: string, originalName: string): string {
  const byName = path.extname(originalName || '').toLowerCase();
  const allowedForType: Record<string, string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
  };
  const normalizedType = String(contentType || '').split(';', 1)[0].toLowerCase();
  return allowedForType[normalizedType]?.includes(byName)
    ? byName
    : normalizedType === 'image/png'
      ? '.png'
      : normalizedType === 'image/webp'
        ? '.webp'
        : '.jpg';
}

export function buildFieldPhotoStoragePlan(options: {
  baseDir: string;
  idLote: string;
  originalName: string;
  contentType: string;
  capturedAt: Date;
  nonce: string;
}): FieldPhotoStoragePlan {
  const baseDir = path.resolve(options.baseDir);
  const safeLote = sanitizeFieldPhotoSegment(options.idLote, 'sin-lote');
  const day = options.capturedAt.toISOString().slice(0, 10);
  const originalBase = path.basename(
    options.originalName || 'foto-campo',
    path.extname(options.originalName || ''),
  );
  const safeBase = sanitizeFieldPhotoSegment(originalBase, 'foto-campo');
  const safeNonce = sanitizeFieldPhotoSegment(options.nonce, 'foto');
  const storedName = `${safeNonce}-${safeBase}${extensionFor(
    options.contentType,
    options.originalName,
  )}`;
  const targetDir = path.resolve(
    baseDir,
    FIELD_PHOTO_STORAGE_ROOT,
    safeLote,
    day,
  );
  const targetPath = path.resolve(targetDir, storedName);
  const expectedPrefix = `${baseDir}${path.sep}`;

  if (
    !targetDir.startsWith(expectedPrefix) ||
    !targetPath.startsWith(`${targetDir}${path.sep}`)
  ) {
    throw new Error('La ruta de almacenamiento no es valida.');
  }

  return {
    targetDir,
    targetPath,
    relativePath: path.relative(baseDir, targetPath),
    storedName,
  };
}
