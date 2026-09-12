/** Explicit local-only preview entry. Never imported by main.ts or app routes. */
import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { MyPreset } from '../../public/styles/theme';
import { API_SERVICES, ApiClientView } from 'modelos/src';
import { IntegracionesAdminComponent } from '../app/main/modulo-admin/integraciones/integraciones.component';
import { IntegrationAdminService } from '../app/auxiliares/http/integration-admin.service';

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local preview only');
const initial: ApiClientView = { id: 'appcorteva-demo', name: 'AppCorteva · Ejemplo local', advisorUserId: 'a'.repeat(24), permissionIndex: 0, environment: 'testing', enabled: false, expiresAt: '2026-10-12T23:59:00.000Z', scopes: API_SERVICES.map(s => s.scope), limits: { productores: 50, establecimientos: 50, lotes: 50 }, requestsPerMinute: 60, maxSowingAgeDays: 366, revision: 1, keys: [], audit: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const rows = [initial];
const fakeApi = {
  list: async () => ({ items: structuredClone(rows), truncated: false, environment: 'testing', registrySource: 'database', apiEnabled: false, baseUrl: 'https://testing-api-testing.up.railway.app/sdc-quimica-test/integraciones/v1', services: API_SERVICES }),
  operator: async (username: string) => ({ id: 'b'.repeat(24), username, permissions: [{ index: 0, nivel: 'Asesor', rol: 'Admin' }] }),
  create: async (data: any) => { const item = { ...structuredClone(initial), ...data, keys: [], revision: 1 }; rows.push(item); return structuredClone(item); },
  update: async (id: string, revision: number, settings: any) => { const item = rows.find(r => r.id === id)!; Object.assign(item, settings, { revision: revision + 1 }); return structuredClone(item); },
  key: async () => { throw { error: { message: 'La vista previa no emite claves. No tiene conexión con la API real.' } }; },
  usage: async () => ({ rows: [{ day: '2026-09-12', operation: 'GET siembras/:externalId/fenologia', requests: 126, success: 122, errors: 4, pending: 5, rateLimited: 4, unfinished: 0, durationMs: 12600 }, { day: '2026-09-12', operation: 'PUT lotes/:externalId', requests: 12, success: 12, errors: 0, pending: 0, rateLimited: 0, unfinished: 0, durationMs: 2400 }], lastRequestAt: '2026-09-12T16:00:00.000Z', retentionDays: 90 }),
};
void bootstrapApplication(IntegracionesAdminComponent, { providers: [provideRouter([]), providePrimeNG({ theme: { preset: MyPreset, options: { darkModeSelector: '.p-dark' } } }), { provide: IntegrationAdminService, useValue: fakeApi }] });
