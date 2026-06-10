import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { UsuarioService } from '../../../auxiliares/http/usuario.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../auxiliares/shared.module';

@Component({
  selector: 'app-cambiar-password',
  imports: [SharedModule],
  templateUrl: './cambiar-password.component.html',
  styleUrl: './cambiar-password.component.scss',
})
export class CambiarPasswordComponent implements OnInit {
  public loading = false;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;
  public nombre?: string;

  constructor(
    private translate: TranslateService,
    private service: UsuarioService,
    private helper: HelperService,
    private config: DynamicDialogConfig,
    private ref: DynamicDialogRef,
    private confirmationService: ConfirmationService
  ) {}

  // FORMULARIO
  private createForm(): void {
    this.form = new FormGroup({
      oldPassword: new FormControl('', Validators.required),
      newPassword: new FormControl('', [Validators.required]),
      newPassword2: new FormControl('', [Validators.required, this.matchValues('newPassword')]),
    });
  }

  // ACCIONES

  private getData() {
    const data: { oldPassword: string; newPassword: string; newPassword2?: string } = this.form?.value;
    delete data.newPassword2; // Remove the confirmation field
    return data;
  }

  public async guardar(): Promise<void> {
    this.confirmationService.confirm({
      target: event?.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea cambiar la contraseña?'),
      closable: true,
      closeOnEscape: true,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: this.translate.instant('Cancelar'),
        severity: 'secondary',
        outlined: true,
      },
      acceptButtonProps: {
        label: this.translate.instant('Aceptar'),
      },
      accept: async () => {
        this.loading = true;
        try {
          const data = this.getData();
          await this.service.cambiarPassword(data);
          // console.log('Cambiar contraseña:', data);
          this.helper.notifSuccess(this.translate.instant('Cambio de contraseña exitoso'));
          this.volver();
        } catch (err) {
          console.error(err);
          this.helper.notifError(err);
        }
        this.loading = false;
      },
    });
  }

  private matchValues(
    matchTo: string // name of the control to match with
  ): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const parent = control.parent;
      if (!parent) {
        return null;
      }

      const matchingControl = parent.get(matchTo);
      if (!matchingControl) {
        return null;
      }

      if (matchingControl.value !== control.value) {
        return { valuesDoNotMatch: true };
      }

      return null;
    };
  }

  public volver() {
    this.ref.close();
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.nombre = this.config.data?.nombre;
    this.createForm();
    this.loading = false;
  }
}
