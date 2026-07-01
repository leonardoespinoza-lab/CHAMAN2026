import { v } from './version';
export const VERSION = v;
export const ENV: 'Local' | 'Test' | 'Production' = 'Local';

const runtime = (globalThis as any).__CHAMAN_CONFIG__ || {};

// Apis locales para CHAMAN2026
export const WS = runtime.WS || 'ws://127.0.0.1:5006';
export const API = runtime.API || 'http://127.0.0.1:5002';
export const TILES_URL = runtime.TILES_URL || 'http://127.0.0.1:5002/data';
