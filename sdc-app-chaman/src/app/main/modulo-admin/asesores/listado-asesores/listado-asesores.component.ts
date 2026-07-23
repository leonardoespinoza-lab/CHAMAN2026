import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IResumenAdministrativoAsesor,
  IResumenRedAsesores,
} from 'modelos/src';
import { UsuarioService } from '../../../../auxiliares/http/usuario.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-asesores',
  imports: [SharedModule],
  templateUrl: './listado-asesores.component.html',
  styleUrl: './listado-asesores.component.scss',
})
export class ListadoAsesoresComponent implements OnInit {
  public loading = false;
  public resumen?: IResumenRedAsesores;
  public filtro = '';
  public estado: 'todos' | 'activos' | 'inactivos' | 'archivados' = 'todos';

  constructor(
    private usuarioService: UsuarioService,
    private params: ParamsService,
    private router: Router,
    private helper: HelperService,
  ) {}

  public get asesoresVisibles(): IResumenAdministrativoAsesor[] {
    const texto = this.normalizar(this.filtro);
    return (this.resumen?.asesores || []).filter((asesor) => {
      if (this.estado === 'todos' && asesor.archivado) return false;
      if (this.estado === 'activos' && (!asesor.activo || asesor.archivado)) return false;
      if (this.estado === 'inactivos' && (asesor.activo || asesor.archivado)) return false;
      if (this.estado === 'archivados' && !asesor.archivado) return false;
      if (!texto) return true;
      return [
        asesor.nombre,
        asesor.username,
        asesor.email,
        asesor.profesion,
        asesor.especialidad,
        asesor.matricula,
        asesor.direccion,
      ].some((valor) => this.normalizar(valor).includes(texto));
    });
  }

  public async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  public async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.resumen = await this.usuarioService.resumenRedAsesores();
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  public crear(): void {
    this.params.remove('editUsuario');
    void this.router.navigateByUrl('/asesores/crear');
  }

  public ver(asesor: IResumenAdministrativoAsesor): void {
    void this.router.navigate(['/asesores/ver', asesor.id]);
  }

  public volver(): void {
    void this.router.navigateByUrl('/dashboard-admin');
  }

  public iniciales(asesor: IResumenAdministrativoAsesor): string {
    return asesor.nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase())
      .join('') || 'AS';
  }

  public perfilProfesional(asesor: IResumenAdministrativoAsesor): string {
    return [asesor.profesion, asesor.especialidad].filter(Boolean).join(' · ') ||
      'Perfil profesional pendiente';
  }

  private normalizar(valor?: string): string {
    return (valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
