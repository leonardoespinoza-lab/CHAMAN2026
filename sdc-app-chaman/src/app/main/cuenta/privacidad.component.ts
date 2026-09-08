import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../auxiliares/shared.module';
import { HttpService } from '../../auxiliares/http/http.service';
import { HelperService } from '../../auxiliares/servicios/helper';

export interface DeletionRequest {
  _id: string;
  requestedAt: string;
  respondBy: string;
  status: 'pending';
}

@Component({
  selector: 'app-privacidad-cuenta',
  imports: [SharedModule],
  template: `
    <main class="privacy-account">
      <h1>Cuenta y privacidad</h1>
      <p>
        <a href="https://chamanagro.ar/politica-privacidad" target="_blank" rel="noopener noreferrer"
          >Leer la política de privacidad</a
        >
      </p>
      <section class="privacy-panel" aria-labelledby="delete-title">
        <h2 id="delete-title">Eliminar mi cuenta</h2>
        <p>
          Podés iniciar aquí la eliminación permanente de tu cuenta y de los datos personales asociados. No necesitás
          enviar un correo para iniciar la solicitud.
        </p>
        <p>
          Chamán revisará tu solicitud y te comunicará el resultado al correo de tu cuenta en hasta 30 días, o antes si
          corresponde un plazo legal menor.
        </p>
        <p>
          La eliminación no se ejecuta al presionar este botón. Tu cuenta sigue disponible durante la revisión. Se
          eliminarán tus datos personales y contenido asociado, salvo conservación legal justificada. Antes de
          intervenir registros compartidos, revisaremos qué pertenece a otros usuarios y te informaremos qué debe
          conservarse y por qué.
        </p>
        <p>
          No confundas esta solicitud con cerrar sesión o cancelar una licencia: se solicita eliminar la cuenta
          completa.
        </p>
        @if (loading) {
          <p role="status">Consultando tu solicitud…</p>
        } @else if (ticket) {
          <div role="status">
            <h3>Solicitud recibida</h3>
            <p>Estado: pendiente de revisión. Tu cuenta todavía no se eliminó.</p>
            <p>
              Comprobante: <code>{{ ticket._id }}</code>
            </p>
            <p>
              Recibida: {{ ticket.requestedAt | date: 'dd/MM/yyyy HH:mm' }}. Respuesta prevista hasta
              {{ ticket.respondBy | date: 'dd/MM/yyyy' }}.
            </p>
            <p>Si existe un plazo legal menor, prevalece ese plazo.</p>
          </div>
        } @else if (loaded) {
          <form (ngSubmit)="submit()">
            <label for="delete-confirmation">Para confirmar, escribí <strong>ELIMINAR MI CUENTA</strong></label>
            <input
              id="delete-confirmation"
              name="confirmation"
              type="text"
              pInputText
              [(ngModel)]="confirmation"
              autocomplete="off"
              maxlength="18"
              [disabled]="sending"
            />
            <p-button
              type="submit"
              label="Solicitar eliminación de mi cuenta"
              severity="danger"
              [outlined]="true"
              [loading]="sending"
              [disabled]="confirmation !== 'ELIMINAR MI CUENTA' || sending"
            />
          </form>
        }
        @if (error) {
          <p role="alert">{{ error }}</p>
        }
        @if (!loading && !loaded) {
          <p-button label="Volver a consultar" [outlined]="true" (onClick)="load()" />
        }
        <p>
          Soporte adicional o problemas de acceso: <a href="mailto:info@chamanagro.ar">info&#64;chamanagro.ar</a>. No
          envíes tu contraseña.
        </p>
      </section>
      @if (isAdmin) {
        <section class="privacy-panel">
          <h2>Gestión de solicitudes</h2>
          <p>Acceso exclusivo de Administración Chamán.</p>
          <a routerLink="/cuenta/solicitudes-privacidad">Ver solicitudes de eliminación</a>
        </section>
      }
    </main>
  `,
  styles: [
    `
      .privacy-account {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 1rem;
      }
      .privacy-panel {
        background: var(--p-content-background, white);
        border: 1px solid var(--p-content-border-color, #d7e2e8);
        border-radius: 1rem;
        padding: 1.25rem;
        margin-block: 1rem;
      }
      h1 {
        font-size: 1.5rem;
      }
      h2 {
        font-size: 1.2rem;
      }
      h3 {
        font-size: 1.05rem;
      }
      p {
        margin-block: 0.8rem;
        line-height: 1.5;
      }
      a {
        text-decoration: underline;
      }
      form {
        display: grid;
        gap: 0.8rem;
      }
      input {
        width: 100%;
      }
      code {
        overflow-wrap: anywhere;
      }
      [role='alert'] {
        color: var(--p-red-700, #a32323);
      }
    `,
  ],
})
export class PrivacidadComponent implements OnInit {
  loading = false;
  loaded = false;
  sending = false;
  confirmation = '';
  error = '';
  ticket: DeletionRequest | null = null;
  constructor(
    private readonly http: HttpService,
    private readonly helper: HelperService
  ) {}
  get isAdmin() {
    return this.helper.permiso?.nivel === 'Admin' && this.helper.permiso?.rol === 'Admin';
  }
  ngOnInit() {
    void this.load();
  }
  async load() {
    this.loading = true;
    this.error = '';
    try {
      this.ticket = await this.http.get<DeletionRequest | null>('/cuenta/privacidad/eliminacion');
      this.loaded = true;
    } catch {
      this.loaded = false;
      this.error = 'No pudimos consultar tu solicitud. Intentá nuevamente; esta pantalla no confirmó ningún envío.';
    } finally {
      this.loading = false;
    }
  }
  async submit() {
    if (!this.loaded || this.ticket || this.sending || this.confirmation !== 'ELIMINAR MI CUENTA') return;
    this.sending = true;
    this.error = '';
    try {
      const ticket = await this.http.post<DeletionRequest>('/cuenta/privacidad/eliminacion', {
        confirmacion: this.confirmation,
      });
      if (!ticket?._id || ticket.status !== 'pending') throw new Error('Invalid receipt');
      this.ticket = ticket;
      this.confirmation = '';
    } catch {
      this.error =
        'No pudimos confirmar la recepción. Podés volver a intentar o consultar el estado; no se duplicará tu solicitud.';
    } finally {
      this.sending = false;
    }
  }
}
