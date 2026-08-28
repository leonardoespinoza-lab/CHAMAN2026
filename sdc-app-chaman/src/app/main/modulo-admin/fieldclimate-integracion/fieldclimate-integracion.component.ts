import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IEstablecimiento, IEstacion } from 'modelos/src';
import {
  FieldClimateIntegracionService,
  FieldClimateStationPreview,
} from '../../../auxiliares/http/fieldclimate-integracion.service';
import { SharedModule } from '../../../auxiliares/shared.module';

@Component({
  selector: 'app-fieldclimate-integracion',
  imports: [SharedModule],
  templateUrl: './fieldclimate-integracion.component.html',
  styleUrl: './fieldclimate-integracion.component.scss',
})
export class FieldClimateIntegracionComponent implements OnInit {
  public credentials = {
    username: '',
    password: '',
  };

  public descubiertas: FieldClimateStationPreview[] = [];
  public centrales: IEstacion[] = [];
  public establecimientos: IEstablecimiento[] = [];
  public asignaciones: Record<string, string> = {};
  public loadingDiscovery = false;
  public loadingCentrales = false;
  public savingId: string | null = null;
  public message = '';
  public error = '';

  constructor(
    private service: FieldClimateIntegracionService,
    private router: Router
  ) {}

  async ngOnInit() {
    await Promise.all([this.cargarCentrales(), this.cargarEstablecimientos()]);
  }

  public volver() {
    this.router.navigateByUrl('/dashboard-admin');
  }

  public async descubrir() {
    this.error = '';
    this.message = '';
    this.loadingDiscovery = true;
    try {
      this.descubiertas = await this.service.descubrir(this.credentials);
      this.message = `${this.descubiertas.length} centrales encontradas en FieldClimate.`;
    } catch (error: any) {
      this.error = error?.error?.message || error?.message || 'No se pudo conectar con FieldClimate.';
    } finally {
      this.loadingDiscovery = false;
    }
  }

  public async importar(station: FieldClimateStationPreview) {
    if (this.centralImportada(station)) {
      this.error = 'Esta central ya existe en Chaman. Usa Actualizar acceso para renovar sus credenciales.';
      return;
    }
    this.error = '';
    this.message = '';
    this.savingId = station.idExterno;
    try {
      const central = await this.service.importar({
        ...this.credentials,
        stationId: station.idExterno,
      });
      this.message = `Central ${this.nombreCentral(central)} importada en Chaman.`;
      await this.cargarCentrales();
    } catch (error: any) {
      this.error = error?.error?.message || error?.message || 'No se pudo importar la central.';
    } finally {
      this.savingId = null;
    }
  }

  public async asignar(central: IEstacion) {
    const idEstablecimiento = this.asignaciones[central._id || ''];
    if (!central._id || !idEstablecimiento) {
      this.error = 'Selecciona un establecimiento para asignar la central.';
      return;
    }
    this.error = '';
    this.message = '';
    this.savingId = central._id;
    try {
      await this.service.asignar(central._id, idEstablecimiento);
      this.message = `Central ${this.nombreCentral(central)} asignada al establecimiento.`;
      await this.cargarCentrales();
    } catch (error: any) {
      this.error = error?.error?.message || error?.message || 'No se pudo asignar la central.';
    } finally {
      this.savingId = null;
    }
  }

  public async sincronizar(central: IEstacion) {
    if (!central._id) return;
    this.error = '';
    this.message = '';
    this.savingId = central._id;
    try {
      const actualizada = await this.service.sincronizar(central._id);
      this.message = actualizada.estado?.reportando
        ? `${this.nombreCentral(actualizada)} sincronizada y reportando.`
        : `${this.nombreCentral(actualizada)} sincronizada, pero sin una lectura reciente.`;
      await this.cargarCentrales();
    } catch (error: any) {
      this.error = error?.error?.message || error?.message || 'No se pudo sincronizar la central.';
      await this.cargarCentrales();
    } finally {
      this.savingId = null;
    }
  }

  public async actualizarAcceso(central: IEstacion) {
    if (!central._id) return;
    if (!this.credentials.username.trim() || !this.credentials.password) {
      this.error = 'Ingresa arriba el usuario y password nuevos de FieldClimate.';
      return;
    }
    this.error = '';
    this.message = '';
    this.savingId = central._id;
    try {
      const actualizada = await this.service.actualizarCredenciales(central._id, this.credentials);
      this.message = `Acceso de ${this.nombreCentral(
        actualizada
      )} actualizado sin cambiar su asignacion ni su historial.`;
      await this.cargarCentrales();
    } catch (error: any) {
      this.error = error?.error?.message || error?.message || 'No se pudo actualizar el acceso de la central.';
      await this.cargarCentrales();
    } finally {
      this.savingId = null;
    }
  }

  public centralImportada(station: FieldClimateStationPreview): boolean {
    const idExterno = String(station.idExterno || '')
      .trim()
      .toUpperCase();
    return this.centrales.some(
      (central) =>
        String(central.idExterno || '')
          .trim()
          .toUpperCase() === idExterno
    );
  }

  public nombreCentral(central: IEstacion | FieldClimateStationPreview): string {
    return (
      central?.name?.custom ||
      central?.name?.original ||
      central?.info?.device_name ||
      central?.idExterno ||
      'Central sin nombre'
    );
  }

  public ultimoDato(central: IEstacion | FieldClimateStationPreview): string {
    if ('estado' in central && central.estado?.ultimaLectura) {
      return central.estado.ultimaLectura;
    }
    return central?.dates?.last_communication || central?.dates?.max_date || '-';
  }

  public estadoCentral(central: IEstacion): string {
    switch (central.estado?.conexion) {
      case 'reportando':
        return 'Reportando';
      case 'demorada':
        return 'Lectura demorada';
      case 'sin_datos':
        return 'Sin datos recientes';
      case 'error_autenticacion':
        return 'Revisar acceso';
      case 'error':
        return 'Error de sincronizacion';
      default:
        return 'Pendiente de comprobar';
    }
  }

  public estadoClase(central: IEstacion): string {
    return central.estado?.conexion || 'pendiente';
  }

  public ultimoSync(central: IEstacion): string {
    return central.estado?.ultimoSync || '-';
  }

  public coords(central: IEstacion | FieldClimateStationPreview): string {
    const coordinates = central?.position?.geo?.coordinates;
    if (!coordinates?.length) {
      return '-';
    }
    return `${Number(coordinates[1]).toFixed(5)}, ${Number(coordinates[0]).toFixed(5)}`;
  }

  public establecimientoNombre(id?: string): string {
    return this.establecimientos.find((item) => item._id === id)?.nombre || 'Sin asignar';
  }

  public variables(central: IEstacion): string {
    return central.variablesDisponibles?.slice(0, 6).join(', ') || 'Variables pendientes de sincronizar';
  }

  private async cargarCentrales() {
    this.loadingCentrales = true;
    try {
      const res = await this.service.listarCentrales({ limit: 200 });
      this.centrales = res.datos || [];
      this.asignaciones = this.centrales.reduce(
        (acc, central) => {
          if (central._id) {
            acc[central._id] = central.idEstablecimiento || '';
          }
          return acc;
        },
        {} as Record<string, string>
      );
    } finally {
      this.loadingCentrales = false;
    }
  }

  private async cargarEstablecimientos() {
    const res = await this.service.listarEstablecimientos({ limit: 300 });
    this.establecimientos = res.datos || [];
  }
}
