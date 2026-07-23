import { v } from './version';
export const VERSION = v;
export const ENV: 'Local' | 'Test' | 'Production' = 'Production';

const runtime = (globalThis as any).__CHAMAN_CONFIG__ || {};
const hostname = String((globalThis as any).location?.hostname || '').toLowerCase();

// runtime-config.js es la fuente canonica. Los valores por hostname son una
// red de seguridad para sesiones que hayan conservado una version antigua del
// service worker: nunca deben terminar haciendo POST contra el servidor
// estatico de Angular y recibiendo index.html como si fuera JSON.
const fallback = hostname.includes('testing-web-testing-dc8e')
  ? {
      API: 'https://testing-api-testing.up.railway.app/sdc-quimica-test',
      WS: 'wss://testing-websocket-testing.up.railway.app/sdc-websocket-test',
    }
  : hostname === 'app.chamanagro.ar' || hostname.includes('chaman2026-production')
    ? {
        API: 'https://chaman-api-production.up.railway.app/sdc-quimica',
        WS: 'wss://chaman-websocket-production.up.railway.app/sdc-websocket',
      }
    : { API: '', WS: '' };

export const WS = runtime.WS || fallback.WS;
export const API = runtime.API || fallback.API;
export const TILES_URL = runtime.TILES_URL || (API ? `${API}/data` : '');
export const COOKIE_AUTH = runtime.COOKIE_AUTH === true || runtime.COOKIE_AUTH === 'true';
