import { v } from './version';
export const VERSION = v;
export const ENV: 'Local' | 'Test' | 'Production' = 'Production';

const runtime = (globalThis as any).__CHAMAN_CONFIG__ || {};

export const GOOGLE_PROVIDER_ID = runtime.GOOGLE_PROVIDER_ID || '';

export const WS = runtime.WS || '';
export const API = runtime.API || '';
export const TILES_URL = runtime.TILES_URL || '';
