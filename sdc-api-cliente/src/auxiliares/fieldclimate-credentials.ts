import crypto from 'crypto';
import { FIELDCLIMATE_CREDENTIALS_KEY } from '../env';

const PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const configuredKey =
    process.env.FIELDCLIMATE_CREDENTIALS_KEY || FIELDCLIMATE_CREDENTIALS_KEY;
  if (!configuredKey) {
    throw new Error('FIELDCLIMATE_CREDENTIALS_KEY no configurada');
  }
  return crypto.createHash('sha256').update(configuredKey, 'utf8').digest();
}

export function isProtectedFieldClimateCredential(value?: string): boolean {
  return !!value?.startsWith(PREFIX);
}

export function protectFieldClimateCredential(value: string): string {
  if (!value || isProtectedFieldClimateCredential(value)) {
    return value;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function revealFieldClimateCredential(value: string): string {
  if (!value || !isProtectedFieldClimateCredential(value)) {
    return value;
  }
  const parts = value.split(':');
  if (parts.length !== 5) {
    throw new Error('Credencial FieldClimate cifrada invalida');
  }
  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  const encrypted = Buffer.from(parts[4], 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}
