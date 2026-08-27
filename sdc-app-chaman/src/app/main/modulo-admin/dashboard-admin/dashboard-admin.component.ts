import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IResumenRedAsesores } from 'modelos/src';
import { LoginService } from '../../../auxiliares/http/login.service';
import { UsuarioService } from '../../../auxiliares/http/usuario.service';
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
export class DashboardAdminComponent implements OnInit {
  public resumenAsesores?: IResumenRedAsesores;
  public cargandoAsesores = false;

  public readonly quickActions = [
    { label: 'Tenant', icon: 'pi pi-palette', route: '/tenants/crear' },
    { label: 'Usuario', icon: 'pi pi-user-plus', route: '/usuarios/crear' },
    { label: 'Asesor', icon: 'pi pi-briefcase', route: '/asesores/crear' },
    { label: 'Productor', icon: 'pi pi-id-card', route: '/productores/crear' },
    { label: 'Compañía', icon: 'pi pi-building', route: '/quimicas/crear' },
    { label: 'LoRaWAN', icon: 'pi pi-microchip', route: '/dispositivos/crear' },
    { label: 'FieldClimate', icon: 'pi pi-cloud', route: '/fieldclimate' },
    { label: 'Chamán-Meteo', icon: 'pi pi-sun', route: '/chaman-meteo' },
    { label: 'Algoritmos', icon: 'pi pi-sliders-h', route: '/algoritmos' },
    { label: 'IA Malezas', icon: 'pi pi-image', route: '/motor-ia-malezas' },
  ];

  public readonly cards: AdminServiceCard[] = [
    {
      title: 'Tenants',
      description: 'Espacios empresariales aislados con marca, administrador, modulos y limites propios.',
      icon: 'pi pi-palette',
      route: '/tenants',
      group: 'Plataforma',
      status: 'Configurable',
    },
    {
      title: 'Usuarios y permisos',
      description: 'Alta de administradores, compañías, distribuidores, productores y roles de acceso.',
      icon: 'pi pi-users',
      route: '/usuarios',
      group: 'Identidad',
      status: 'Operativo',
    },
    {
      title: 'Compañías',
      description: 'Organizaciones principales, relaciones comerciales y estructura superior.',
      icon: 'pi pi-building',
      route: '/quimicas',
      group: 'Estructura',
      status: 'Operativo',
    },
    {
      title: 'Distribuidores',
      description: 'Red comercial intermedia asociada a compañías y productores.',
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
      title: 'Asesores',
      description: 'Alta profesional, cartera administrada, usuarios, establecimientos, lotes y hectareas por asesor.',
      icon: 'pi pi-briefcase',
      route: '/asesores',
      group: 'Estructura',
      status: 'Operativo',
    },
    {
      title: 'Dispositivos LoRaWAN',
      description: 'Alta de sensores, DevEUI, gateway, asignacion a lotes y monitoreo de uplinks MQTT.',
      icon: 'pi pi-microchip',
      route: '/dispositivos',
      group: 'Sensores',
      status: 'Monitoreo',
    },
    {
      title: 'Centrales meteorologicas',
      description: 'Integracion FieldClimate, importacion de centrales y asignacion por establecimiento.',
      icon: 'pi pi-cloud',
      route: '/fieldclimate',
      group: 'Integraciones',
      status: 'Configurable',
    },
    {
      title: 'Chamán-Meteo',
      description:
        'Estado, cobertura y valores horarios y diarios de la fuente meteorológica propia basada en ERA5-Land.',
      icon: 'pi pi-sun',
      route: '/chaman-meteo',
      group: 'Integraciones',
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
      title: 'Algoritmos',
      description: 'Auditoria, pruebas, inputs y outputs de huella hidrica, riego, enfermedades y malezas.',
      icon: 'pi pi-sliders-h',
      route: '/algoritmos',
      group: 'Sistema',
      status: 'Configurable',
    },
    {
      title: 'Camaras',
      description: 'Camaras disponibles, lotes asociados e historico visual para seguimiento del cultivo.',
      icon: 'pi pi-camera',
      route: '/camaras',
      group: 'Monitoreo',
      status: 'Monitoreo',
    },
    {
      title: 'Motor IA Malezas',
      description: 'Carga experimental de imagenes, inferencia YOLO y auditoria de detecciones por lote o ensayo.',
      icon: 'pi pi-image',
      route: '/motor-ia-malezas',
      group: 'IA experimental',
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
      items: ['Open-Meteo', 'Chamán-Meteo', 'FieldClimate', 'EMQX / ChirpStack LoRaWAN', 'NDVI y satelite'],
    },
    {
      title: 'Datos',
      items: ['Usuarios', 'Establecimientos', 'Lotes', 'Siembras e historicos'],
    },
  ];

  constructor(
    private router: Router,
    public helper: HelperService,
    private loginService: LoginService,
    private usuarioService: UsuarioService
  ) {}

  public async ngOnInit(): Promise<void> {
    this.cargandoAsesores = true;
    try {
      this.resumenAsesores = await this.usuarioService.resumenRedAsesores();
    } catch (error) {
      console.warn('No se pudo cargar el resumen de asesores', error);
    } finally {
      this.cargandoAsesores = false;
    }
  }

  public go(route: string) {
    this.router.navigateByUrl(route);
  }

  public async logout() {
    try {
      await this.loginService.logout();
    } finally {
      await this.router.navigateByUrl('/auth');
    }
  }
}
