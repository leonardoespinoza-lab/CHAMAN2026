import { Component, HostListener, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { LoginService } from '../../auxiliares/http/login.service';
import {
  permisoPrincipal,
  rutaInicioPermiso,
} from '../../auxiliares/seguridad/access-policy';
import { HelperService } from '../../auxiliares/servicios/helper';
import { SharedModule } from '../../auxiliares/shared.module';
import { VERSION } from '../../environments/environment';

@Component({
  selector: 'app-login',
  imports: [SharedModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnDestroy {
  public loading = false;
  public form = this.createForm();
  public version = VERSION;
  private user$?: Subscription;

  constructor(
    private loginService: LoginService,
    private router: Router,
    public helper: HelperService
  ) {}

  private createForm() {
    return new FormGroup({
      username: new FormControl<string>('', Validators.required),
      password: new FormControl<string>('', Validators.required),
      remember: new FormControl<boolean>(false),
    });
  }

  public async onSubmit() {
    this.loading = true;
    try {
      const username = this.form.get('username')?.value as string;
      const password = this.form.get('password')?.value as string;
      const remember = this.form.get('remember')?.value as boolean;
      await this.loginService.login(username, password, remember);
      this.router.navigateByUrl(this.getRutaInicial());
    } catch (error) {
      this.helper.notifError(this.mensajeLoginError(error));
    }
    this.loading = false;
  }

  private mensajeLoginError(error: any): string {
    const status = error?.status;
    const rawMessage = error?.error?.message || error?.message || '';
    const message = Array.isArray(rawMessage) ? rawMessage.join('. ') : String(rawMessage);

    if (status === 0) {
      return 'No se pudo conectar con CHAMAN. Revise la conexion e intente nuevamente.';
    }
    if (status === 401) {
      return message || 'Usuario o contrasena incorrectos. Verifique mayusculas y minusculas.';
    }
    if (status === 503) {
      return 'El servicio de autenticacion no esta disponible. Reintente en unos minutos.';
    }
    if (status >= 500) {
      return 'No pudimos iniciar sesion por un problema del servidor. Reintente en unos minutos.';
    }
    return message || 'No pudimos iniciar sesion. Revise usuario y contrasena.';
  }
  
  @HostListener('document:keyup.enter', ['$event'])
  handleEnterKey(event: KeyboardEvent) {
    if (!this.form.valid) {
      return;
    }
    this.onSubmit();
  }

  private getRutaInicial(): string {
    const permisos = this.helper.user?.permisos || [];
    const permiso = permisoPrincipal(permisos);
    const indice = permiso ? permisos.indexOf(permiso) : -1;

    if (permiso) {
      this.helper.setPermiso(permiso);
      this.helper.setNumeroPermiso(Math.max(indice, 0));
    }

    return rutaInicioPermiso(permiso);
  }

  async ngOnDestroy() {
    this.user$?.unsubscribe();
  }
}
