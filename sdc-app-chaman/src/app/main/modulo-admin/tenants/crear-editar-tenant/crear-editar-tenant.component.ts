import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ICreateTenant,
  IModulosPermiso,
  ITenant,
  ModuloPermiso,
} from 'modelos/src';
import { TenantService } from '../../../../auxiliares/http/tenant.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-crear-editar-tenant',
  imports: [SharedModule],
  templateUrl: './crear-editar-tenant.component.html',
  styleUrl: './crear-editar-tenant.component.scss',
})
export class CrearEditarTenantComponent implements OnInit {
  tenant?: ITenant;
  loading = false;
  readonly passwordPolicyText =
    'Minimo 8 caracteres, una mayuscula, una minuscula y un numero. Sin espacios.';
  private readonly passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)\S{8,}$/;
  public get id(): string | null {
    return this.route.snapshot.paramMap.get('id');
  }
  readonly rootTypes = [
    { label: 'Compania', value: 'Quimica' },
    { label: 'Distribuidor', value: 'Distribuidor' },
    { label: 'Asesor', value: 'Asesor' },
  ];
  readonly modules: { key: ModuloPermiso; label: string }[] = [
    { key: 'Enfermedades', label: 'Enfermedades' },
    { key: 'Riego', label: 'Riego' },
    { key: 'HuellaHidrica', label: 'Huella hidrica' },
    { key: 'NDVI', label: 'Satelite e indices' },
    { key: 'Clima', label: 'Clima' },
    { key: 'EtapasFenologicas', label: 'Etapas fenologicas' },
    { key: 'Sensores', label: 'Sensores' },
    { key: 'Camaras', label: 'Camaras' },
    { key: 'Malezas', label: 'Malezas' },
    { key: 'FrioTermica', label: 'Frio y termica' },
    { key: 'Fertilizacion', label: 'Fertilizacion' },
    { key: 'Fumigacion', label: 'Fumigacion' },
    { key: 'Certificados', label: 'Informes y certificados' },
    { key: 'RegistroFotografico', label: 'Registro fotografico de campo' },
    { key: 'Visitas', label: 'Calendario de visitas' },
  ];

  form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    slug: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)] }),
    razonSocial: new FormControl(''),
    cuit: new FormControl(''),
    dominio: new FormControl(''),
    estado: new FormControl<'borrador' | 'activo'>('activo', { nonNullable: true }),
    entidadRaiz: new FormGroup({
      tipo: new FormControl<'Quimica' | 'Distribuidor' | 'Asesor'>('Quimica', { nonNullable: true }),
      idEntidad: new FormControl(''),
      nombre: new FormControl(''),
    }),
    branding: new FormGroup({
      nombreAplicacion: new FormControl(''),
      logo: new FormControl(''),
      colorPrimario: new FormControl('#0f8f83', { nonNullable: true }),
      colorSecundario: new FormControl('#20d8ca', { nonNullable: true }),
      colorFondo: new FormControl('#eef8f7', { nonNullable: true }),
      mostrarMarcaChaman: new FormControl(true, { nonNullable: true }),
    }),
    modulos: new FormGroup(
      this.modules.reduce((controls, module) => {
        controls[module.key] = new FormControl(
          ['Clima', 'EtapasFenologicas', 'NDVI'].includes(module.key),
          { nonNullable: true },
        );
        return controls;
      }, {} as Record<ModuloPermiso, FormControl<boolean>>),
    ),
    capacidades: new FormGroup({
      administrarCompanias: new FormControl(true, { nonNullable: true }),
      administrarDistribuidores: new FormControl(true, { nonNullable: true }),
      administrarAsesores: new FormControl(true, { nonNullable: true }),
      administrarProductores: new FormControl(true, { nonNullable: true }),
      gestionTerritorialAsesor: new FormControl(false, { nonNullable: true }),
    }),
    limites: new FormGroup({
      usuarios: new FormControl(20, { nonNullable: true, validators: [Validators.min(1)] }),
      companias: new FormControl(5, { nonNullable: true, validators: [Validators.min(0)] }),
      distribuidores: new FormControl(20, { nonNullable: true, validators: [Validators.min(0)] }),
      asesores: new FormControl(50, { nonNullable: true, validators: [Validators.min(0)] }),
      productores: new FormControl(200, { nonNullable: true, validators: [Validators.min(0)] }),
      establecimientos: new FormControl(200, { nonNullable: true, validators: [Validators.min(0)] }),
      lotes: new FormControl(1000, { nonNullable: true, validators: [Validators.min(0)] }),
      hectareas: new FormControl(100000, { nonNullable: true, validators: [Validators.min(0)] }),
    }),
    administrador: new FormGroup({
      nombre: new FormControl(''),
      email: new FormControl('', Validators.email),
      username: new FormControl(''),
      password: new FormControl(''),
    }),
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly service: TenantService,
    private readonly helper: HelperService,
  ) {}

  async ngOnInit(): Promise<void> {
    if (!this.id) {
      this.requireAdmin(true);
      return;
    }
    this.loading = true;
    try {
      this.tenant = await this.service.getById(this.id);
      this.form.patchValue({
        ...this.tenant,
        dominio: this.tenant.dominios?.[0] || '',
        entidadRaiz: this.tenant.entidadRaiz,
        branding: this.tenant.branding,
        modulos: this.tenant.modulos,
        capacidades: this.tenant.capacidades,
        limites: this.tenant.limites,
      } as any);
      this.requireAdmin(!this.tenant.provisionado);
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  onNameChange(): void {
    if (this.id || this.form.controls.slug.dirty) return;
    const slug = this.form.controls.nombre.value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    this.form.controls.slug.setValue(slug);
  }

  async onLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type) || file.size > 500 * 1024) {
      this.helper.notifWarn('Use PNG, JPEG, WebP o SVG de hasta 500 KB.');
      return;
    }
    const value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    this.form.controls.branding.controls.logo.setValue(value);
  }

  previewStyle(): Record<string, string> {
    const branding = this.form.controls.branding.getRawValue();
    return {
      '--preview-primary': branding.colorPrimario,
      '--preview-secondary': branding.colorSecundario,
      '--preview-background': branding.colorFondo,
    };
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.helper.notifWarn('Complete los campos obligatorios.');
      return;
    }
    this.loading = true;
    try {
      const raw = this.form.getRawValue();
      const payload: ICreateTenant = {
        nombre: raw.nombre,
        slug: raw.slug,
        razonSocial: raw.razonSocial || undefined,
        cuit: raw.cuit?.replace(/\D/g, '') || undefined,
        estado: raw.estado,
        dominios: raw.dominio ? [raw.dominio] : [],
        entidadRaiz: {
          tipo: raw.entidadRaiz.tipo,
          idEntidad: raw.entidadRaiz.idEntidad || undefined,
          nombre: raw.entidadRaiz.nombre || undefined,
        },
        branding: {
          nombreAplicacion: raw.branding.nombreAplicacion || undefined,
          logo: raw.branding.logo || undefined,
          colorPrimario: raw.branding.colorPrimario,
          colorSecundario: raw.branding.colorSecundario,
          colorFondo: raw.branding.colorFondo,
          mostrarMarcaChaman: raw.branding.mostrarMarcaChaman,
        },
        modulos: raw.modulos as IModulosPermiso,
        capacidades: raw.capacidades,
        limites: raw.limites,
        ...(!this.id
          ? {
              administrador: {
                nombre: raw.administrador.nombre || undefined,
                email: raw.administrador.email || undefined,
                username: raw.administrador.username || undefined,
                password: raw.administrador.password || undefined,
              },
            }
          : {}),
      };
      if (this.id) {
        await this.service.update(this.id, payload);
        if (!this.tenant?.provisionado) {
          await this.service.provision(this.id, {
            nombre: raw.administrador.nombre || undefined,
            email: raw.administrador.email || undefined,
            username: raw.administrador.username || undefined,
            password: raw.administrador.password || undefined,
          });
        }
      } else {
        await this.service.create(payload);
      }
      this.helper.notifSuccess(this.id ? 'Tenant actualizado' : 'Tenant y administrador creados');
      await this.router.navigateByUrl('/tenants');
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  back(): void {
    void this.router.navigateByUrl('/tenants');
  }

  private requireAdmin(required: boolean): void {
    const controls = this.form.controls.administrador.controls;
    controls.nombre.setValidators(required ? [Validators.required] : []);
    controls.username.setValidators(required ? [Validators.required] : []);
    controls.password.setValidators(
      required
        ? [
            Validators.required,
            Validators.minLength(8),
            Validators.pattern(this.passwordPattern),
          ]
        : [],
    );
    controls.nombre.updateValueAndValidity();
    controls.username.updateValueAndValidity();
    controls.password.updateValueAndValidity();
  }
}
