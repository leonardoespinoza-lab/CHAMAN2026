import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../auxiliares/shared.module';
import { HttpService } from '../../auxiliares/http/http.service';
import { DeletionRequest } from './privacidad.component';

@Component({
  selector: 'app-solicitudes-privacidad',
  imports: [SharedModule],
  template: `
    <main class="requests">
      <a routerLink="/cuenta/privacidad">Volver a Cuenta y privacidad</a>
      <h1>Solicitudes de eliminación</h1>
      <p>
        Atender diariamente. Esta bandeja no borra cuentas ni indica que ya fueron eliminadas. Revisar los plazos
        legales aplicables antes del plazo operativo máximo de 30 días.
      </p>
      <p-button label="Actualizar" [outlined]="true" [disabled]="loading" (onClick)="load(page)" />
      @if (loading) {
        <p role="status">Consultando…</p>
      }
      @if (error) {
        <p role="alert">{{ error }}</p>
      }
      @for (ticket of records; track ticket._id) {
        <article>
          <h2>Cuenta {{ ticket._id }}</h2>
          <p>Recibida: {{ ticket.requestedAt | date: 'dd/MM/yyyy HH:mm' }}</p>
          <p>
            Respuesta operativa hasta {{ ticket.respondBy | date: 'dd/MM/yyyy' }}; aplicar antes cualquier plazo legal
            menor.
          </p>
          <p>Pendiente de revisión. <a [routerLink]="['/usuarios/editar', ticket._id]">Consultar cuenta</a></p>
        </article>
      } @empty {
        @if (!loading && !error) {
          <p>No hay solicitudes en esta página.</p>
        }
      }
      <div class="pages">
        <p-button label="Anterior" [outlined]="true" [disabled]="loading || page === 0" (onClick)="load(page - 1)" />
        <p-button label="Siguiente" [outlined]="true" [disabled]="loading || !hasMore" (onClick)="load(page + 1)" />
      </div>
    </main>
  `,
  styles: [
    `
      .requests {
        max-width: 52rem;
        margin: 2rem auto;
        padding: 1rem;
      }
      article {
        margin-block: 1rem;
        padding: 1rem;
        background: var(--p-content-background, white);
        border: 1px solid var(--p-content-border-color, #d7e2e8);
        border-radius: 1rem;
      }
      h1 {
        font-size: 1.5rem;
      }
      h2 {
        font-size: 1rem;
        overflow-wrap: anywhere;
      }
      p {
        margin-block: 0.8rem;
      }
      a {
        text-decoration: underline;
      }
      .pages {
        display: flex;
        gap: 0.75rem;
      }
    `,
  ],
})
export class SolicitudesPrivacidadComponent implements OnInit {
  page = 0;
  records: DeletionRequest[] = [];
  hasMore = false;
  loading = false;
  error = '';
  constructor(private readonly http: HttpService) {}
  ngOnInit() {
    void this.load(0);
  }
  async load(page: number) {
    if (this.loading || page < 0) return;
    this.loading = true;
    this.error = '';
    try {
      const result = await this.http.get<{ records: DeletionRequest[]; hasMore: boolean }>(
        `/cuenta/privacidad/solicitudes?page=${page}`
      );
      this.records = result.records;
      this.hasMore = result.hasMore;
      this.page = page;
    } catch {
      this.records = [];
      this.hasMore = false;
      this.error = 'No pudimos consultar las solicitudes. Reintentá la consulta.';
    } finally {
      this.loading = false;
    }
  }
}
