import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../auxiliares/shared.module';

interface AdminServiceCard {
  title: string;
  description: string;
  icon: string;
  route: string;
  group: string;
  status: 'Operativo' | 'Configurable' | 'Monitoreo';
}

@Component({
  selector: 'app-dashboard-admin',
  imports: [SharedModule],
  templateUrl: './dashboard-admin.component.html',
  styleUrl: './dashboard-admin.component.scss',
})
export class DashboardAdminComponent {
  public readonly quickActions = [
    { label: 'Usuario', icon: 'pi pi-user-plus', route: '/usuarios/crear' },
    { label: 'Productor', icon: 'pi pi-id-card', route: '/productores/crear' },
    { label: 'Quimica', icon: 'pi pi-building', route: '/quimicas/crear' },
    { label: 'Dispositivo', icon: 'pi pi-microchip', route: '/dispositivos/crear' },
  ];

  public readonly cards: AdminServiceCard[] = [
    {
      title: 'Usuarios y permisos',
      description: 'Alta de administradores, productores, distribuidores, quimicas y roles de acceso.',
      icon: 'pi pi-users',
      route: '/usuarios',
      group: 'Identidad',
      status: 'Operativo',
    },
    {
      title: 'Quimicas',
      description: 'Organizaciones principales, relaciones comerciales y estructura superior.',
      icon: 'pi pi-building',
      route: '/quimicas',
      group: 'Estructura',
      status: 'Operativo',
    },
    {
      title: 'Distribuidores',
      description: 'Red comercial intermedia asociada a quimicas y productores.',
      icon: 'pi pi-sitemap',
      route: '/distribuidores',
      group: 'Estructura',
      status: 'Operativo',
    },
    {
      title: 'Productores',
      description: 'Usuarios finales que cargan establecimientos, lotes y siembras.',
      icon: 'pi pi-id-card',
      route: '/productores',
      group: 'Estructura',
      status: 'Operativo',
    },
    {
      title: 'Dispositivos',
      description: 'Sensores LoRaWAN, lanzas Sentek, bateria, ultimo reporte y asignaciones.',
      icon: 'pi pi-microchip',
      route: '/dispositivos',
      group: 'Sensores',
      status: 'Monitoreo',
    },
    {
      title: 'Fenologia',
      description: 'Base fenologica por cultivo, ciclo y departamento para disparar servicios por siembra.',
      icon: 'pi pi-calendar-clock',
      route: '/fenologias',
      group: 'Agronomia',
      status: 'Configurable',
    },
    {
      title: 'Cultivos y semillas',
      description: 'Variedades, hibridos, ciclos y resistencias usadas por las predicciones.',
      icon: 'pi pi-seedling',
      route: '/semillas',
      group: 'Agronomia',
      status: 'Configurable',
    },
    {
      title: 'Licencias',
      description: 'Habilitaciones por entidad y control de acceso a servicios comerciales.',
      icon: 'pi pi-key',
      route: '/licencias',
      group: 'Sistema',
      status: 'Configurable',
    },
    {
      title: 'Time-lapse',
      description: 'Camaras, lotes asociados e historico visual para seguimiento del cultivo.',
      icon: 'pi pi-camera',
      route: '/time-lapse',
      group: 'Monitoreo',
      status: 'Monitoreo',
    },
  ];

  public readonly serviceGroups = [
    {
      title: 'Predicciones',
      items: ['Enfermedades por cultivo', 'Riego y humedad de suelo', 'Huella hidrica', 'Alertas por umbrales'],
    },
    {
      title: 'Integraciones',
      items: ['FieldClimate', 'ChirpStack LoRaWAN', 'NDVI', 'Websocket y notificaciones'],
    },
    {
      title: 'Datos',
      items: ['Usuarios', 'Establecimientos', 'Lotes', 'Siembras e historicos'],
    },
  ];

  constructor(
    private router: Router,
    public helper: HelperService,
  ) {}

  public go(route: string) {
    this.router.navigateByUrl(route);
  }

  public logout() {
    this.helper.removeToken();
    this.router.navigateByUrl('/auth');
  }
}
