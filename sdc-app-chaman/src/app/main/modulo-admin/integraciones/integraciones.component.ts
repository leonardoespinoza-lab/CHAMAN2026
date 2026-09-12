import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  API_SERVICES,
  API_SERVICE_CATALOG,
  API_SERVICE_GROUPS,
  API_PENDING_SERVICES,
  ApiPendingServiceCode,
  ApiClientView,
  ApiRegistration,
  ApiScope,
  ApiSettings,
  ApiUsageReport,
} from 'modelos/src';
import { SharedModule } from '../../../auxiliares/shared.module';
import {
  IntegrationAdminList,
  IntegrationAdminService,
  IntegrationOperator,
} from '../../../auxiliares/http/integration-admin.service';
import { integrationInstructions } from './instructions';

@Component({
  selector: 'app-integraciones-admin',
  imports: [SharedModule],
  templateUrl: './integraciones.component.html',
  styleUrl: './integraciones.component.scss',
})
export class IntegracionesAdminComponent implements OnInit, OnDestroy {
  data?: IntegrationAdminList;
  selected?: ApiClientView;
  editing = false;
  busy = false;
  error = '';
  message = '';
  search = '';
  username = '';
  operator?: IntegrationOperator;
  services = API_SERVICES;
  get serviceCatalog() {
    return this.data?.serviceCatalog || API_SERVICE_CATALOG;
  }
  serviceSearch = '';
  get serviceGroups() {
    const search = this.serviceSearch.trim().toLocaleLowerCase('es');
    return API_SERVICE_GROUPS.map((nombre) => ({
      nombre,
      items: this.serviceCatalog.filter(
        (s) => s.grupo === nombre && (!search || `${s.nombre} ${s.salida}`.toLocaleLowerCase('es').includes(search))
      ),
    })).filter((g) => g.items.length > 0);
  }
  servicePermissions(code: string) {
    return this.services.filter((s) => s.scope.split(':')[0] === code);
  }
  requested(code: string) {
    return (this.form.requestedServices || []).some((s) => s === code);
  }
  requestService(code: string, checked: boolean) {
    if (
      !this.data?.serviceCatalog?.some((s) => s.codigo === code && s.estado === 'pendiente') ||
      !API_PENDING_SERVICES.some((s) => s.codigo === code)
    )
      return;
    const value = code as ApiPendingServiceCode;
    this.form.requestedServices = checked
      ? [...(this.form.requestedServices || []).filter((s) => s !== value), value]
      : (this.form.requestedServices || []).filter((s) => s !== value);
  }
  expiry = '';
  secret = '';
  usage?: ApiUsageReport;
  days = 30;
  instructions = '';
  form: ApiRegistration = this.defaults();
  constructor(private readonly api: IntegrationAdminService) {}
  defaults(): ApiRegistration {
    return {
      id: '',
      name: '',
      advisorUserId: '',
      permissionIndex: 0,
      enabled: false,
      expiresAt: '',
      scopes: API_SERVICES.map((s) => s.scope),
      limits: { productores: 50, establecimientos: 50, lotes: 50 },
      requestsPerMinute: 60,
      maxSowingAgeDays: 366,
    };
  }
  ngOnInit() {
    void this.load();
  }
  ngOnDestroy() {
    this.secret = '';
  }
  private async run(action: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      await action();
    } catch (e: any) {
      this.error =
        e?.status === 404
          ? 'El panel todavía no está habilitado en este entorno. No se modificó ninguna configuración.'
          : String(
              e?.error?.message || 'No se pudo completar la operación. Recargá y revisá el estado antes de repetir.'
            );
    } finally {
      this.busy = false;
    }
  }
  load() {
    return this.run(async () => {
      this.data = await this.api.list();
    });
  }
  get filtered() {
    const s = this.search.toLowerCase();
    return (this.data?.items || []).filter((c) => `${c.name} ${c.id}`.toLowerCase().includes(s));
  }
  status(c: ApiClientView) {
    if (Date.parse(c.expiresAt) <= Date.now()) return 'Vencida';
    if (!c.enabled) return 'Deshabilitada';
    if (!c.keys.some((k) => Date.parse(k.expiresAt) > Date.now())) return 'Sin clave vigente';
    return this.data?.apiEnabled && this.data.registrySource === 'database'
      ? 'Habilitada'
      : 'Pendiente de habilitación técnica';
  }
  start(client?: ApiClientView) {
    this.selected = client;
    this.editing = true;
    this.secret = '';
    this.usage = undefined;
    this.instructions = '';
    this.serviceSearch = '';
    this.error = '';
    this.message = '';
    this.username = '';
    this.operator = undefined;
    this.form = client
      ? {
          id: client.id,
          name: client.name,
          advisorUserId: client.advisorUserId,
          permissionIndex: client.permissionIndex,
          enabled: client.enabled,
          expiresAt: client.expiresAt,
          scopes: [...client.scopes],
          ...(client.requestedServices !== undefined ? { requestedServices: [...client.requestedServices] } : {}),
          limits: { ...client.limits },
          requestsPerMinute: client.requestsPerMinute,
          maxSowingAgeDays: client.maxSowingAgeDays,
        }
      : this.defaults();
    this.expiry = client ? this.localDate(client.expiresAt) : '';
  }
  private localDate(iso: string) {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  findOperator() {
    return this.run(async () => {
      this.operator = undefined;
      this.form.advisorUserId = '';
      const found = await this.api.operator(this.username.trim());
      this.operator = found;
      this.form.advisorUserId = found.id;
      this.form.permissionIndex = found.permissions[0].index;
    });
  }
  toggle(scope: ApiScope, checked: boolean) {
    this.form.scopes = checked
      ? [...this.form.scopes.filter((s) => s !== scope), scope]
      : this.form.scopes.filter((s) => s !== scope);
  }
  save() {
    return this.run(async () => {
      if (!this.expiry || !Number.isFinite(new Date(this.expiry).getTime()))
        throw { error: { message: 'Definí el vencimiento de esta integración.' } };
      // The date control shows minutes. Preserve the stored precision unless
      // the administrator actually edits the expiration date/time.
      this.form.expiresAt =
        this.selected && this.expiry === this.localDate(this.selected.expiresAt)
          ? this.selected.expiresAt
          : new Date(this.expiry).toISOString();
      const { id, advisorUserId, permissionIndex, ...settings } = this.form;
      const saved = this.selected
        ? await this.api.update(id, this.selected.revision, settings as ApiSettings)
        : await this.api.create(this.form);
      this.data = await this.api.list();
      this.start(saved);
      this.message =
        'Configuración guardada. Los servicios solicitados pendientes no habilitan acceso ni generan cobros. No se cambiaron licencias ni datos de campos.';
    });
  }
  issueKey() {
    if (
      !this.selected ||
      !window.confirm(
        '¿Generar una nueva clave? Se mostrará una sola vez. Las claves anteriores seguirán vigentes hasta que las revoques.'
      )
    )
      return;
    return this.run(async () => {
      const r = await this.api.key(this.selected!.id, this.selected!.revision);
      this.start(r.client);
      this.secret = r.credential;
      this.data = await this.api.list();
    });
  }
  revokeKey(id: string) {
    if (!this.selected || !window.confirm('¿Revocar esta clave? Los sistemas que la usen dejarán de acceder.')) return;
    return this.run(async () => {
      const r = await this.api.revoke(this.selected!.id, id, this.selected!.revision);
      this.start(r);
      this.data = await this.api.list();
      this.message = 'Clave revocada.';
    });
  }
  showUsage() {
    return this.selected
      ? this.run(async () => {
          this.usage = undefined;
          this.usage = await this.api.usage(this.selected!.id, this.days);
        })
      : Promise.resolve();
  }
  total(field: 'requests' | 'success' | 'errors' | 'unfinished' | 'pending' | 'rateLimited') {
    return this.usage?.rows.reduce((n, r) => n + r[field], 0) || 0;
  }
  showInstructions() {
    if (this.selected && this.data)
      this.instructions = integrationInstructions(
        this.selected,
        this.data.baseUrl,
        this.data.apiEnabled && this.data.registrySource === 'database'
      );
  }
  print() {
    const win = window.open('', '_blank', 'width=850,height=800');
    if (!win) {
      this.error = 'Permití abrir la ventana de impresión.';
      return;
    }
    win.opener = null;
    win.document.title = 'Chamán · Instructivo API';
    const style = win.document.createElement('style');
    style.textContent =
      'body{margin:32px;font:12px/1.6 system-ui;color:#142d37}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit} @page{size:A4;margin:18mm}';
    win.document.head.appendChild(style);
    const pre = win.document.createElement('pre');
    pre.textContent = this.instructions;
    win.document.body.appendChild(pre);
    win.focus();
    win.print();
  }
}
