import { Routes } from '@angular/router';
import { loginGuard } from './auxiliares/guards/login.guard';
import { roleGuard } from './auxiliares/guards/role.guard';
import { LoginComponent } from './login/login/login.component';
import { AplicacionComponent } from './main/aplicacion/aplicacion.component';
import { KMZComponent } from './main/kmz/kmz.component';
import { CrearEditarDispositivosComponent } from './main/modulo-admin/dispositivos/crear-editar-dispositivos/crear-editar-dispositivos.component';
import { DashboardAdminComponent } from './main/modulo-admin/dashboard-admin/dashboard-admin.component';
import { DetallesDispositivoComponent } from './main/modulo-admin/dispositivos/detalles-dispositivo/detalles-dispositivo.component';
import { ListadoDispositivosComponent } from './main/modulo-admin/dispositivos/listado-dispositivos/listado-dispositivos.component';
import { CrearEditarLicenciasComponent } from './main/modulo-admin/licencias/crear-editar-licencias/crear-editar-licencias.component';
import { ListadoLicenciasComponent } from './main/modulo-admin/licencias/listado-licencias/listado-licencias.component';
import { CrearEditarQuimicasComponent } from './main/modulo-admin/quimicas/crear-editar-quimicas/crear-editar-quimicas.component';
import { ListadoQuimicasComponent } from './main/modulo-admin/quimicas/listado-quimicas/listado-quimicas.component';
import { CrearEditarSemillasComponent } from './main/modulo-admin/semillas/crear-editar-semillas/crear-editar-semillas.component';
import { ListadoSemillasComponent } from './main/modulo-admin/semillas/listado-semillas/listado-semillas.component';
import { AsignarCamaraLoteComponent } from './main/modulo-admin/time-lapse/asignar-camara-lote/asignar-camara-lote.component';
import { ListadoImagenesLoteComponent } from './main/modulo-admin/time-lapse/listado-imagenes-lote/listado-imagenes-lote.component';
import { ListadoTimeLapseComponent } from './main/modulo-admin/time-lapse/listado-time-lapse/listado-time-lapse.component';
import { DashboardDistribuidorComponent } from './main/modulo-distribuidor/dashboard/dashboard.component';
import { CrearEditarProductoresComponent } from './main/modulo-distribuidor/productores/crear-editar-productores/crear-editar-productores.component';
import { ListadoProductoresComponent } from './main/modulo-distribuidor/productores/listado-productores/listado-productores.component';
import { ListadoAlertasComponent } from './main/modulo-productor/alertas/listado-alertas/listado-alertas.component';
import { CrearEditarEstablecimientosComponent } from './main/modulo-productor/establecimientos/crear-editar-establecimientos/crear-editar-establecimientos.component';
import { ListadoEstablecimientosComponent } from './main/modulo-productor/establecimientos/listado-establecimientos/listado-establecimientos.component';
import { CrearEditarCosechaComponent } from './main/modulo-productor/lotes/crear-editar-cosecha/crear-editar-cosecha.component';
import { CrearEditarFertilizacionComponent } from './main/modulo-productor/lotes/crear-editar-fertilizacion/crear-editar-fertilizacion.component';
import { CrearEditarFumigacionComponent } from './main/modulo-productor/lotes/crear-editar-fumigacion/crear-editar-fumigacion.component';
import { CrearEditarLoteComponent } from './main/modulo-productor/lotes/crear-editar-lote/crear-editar-lote.component';
import { CrearEditarSiembraComponent } from './main/modulo-productor/lotes/crear-editar-siembra/crear-editar-siembra.component';
import { DetallesLoteComponent } from './main/modulo-productor/lotes/detalles-lote/detalles-lote.component';
import { ListadoLotesComponent } from './main/modulo-productor/lotes/listado-lotes/listado-lotes.component';
import { MapaComponent } from './main/modulo-productor/mapa/mapa.component';
import { DashboardQuimicaComponent } from './main/modulo-quimica/dashboard/dashboard.component';
import { CrearEditarDistribuidoresComponent } from './main/modulo-quimica/distribuidores/crear-editar-distribuidores/crear-editar-distribuidores.component';
import { ListadoDistribuidoresComponent } from './main/modulo-quimica/distribuidores/listado-distribuidores/listado-distribuidores.component';
import { NavComponent } from './main/nav/nav.component';
import { CrearEditarUsuariosComponent } from './main/usuarios/crear-editar-usuarios/crear-editar-usuarios.component';
import { ListadoUsuariosComponent } from './main/usuarios/listado-usuarios/listado-usuarios.component';
import { CrearEditarFenologiaComponent } from './main/modulo-admin/fenologia/crear-editar-fenologia/crear-editar-fenologia.component';
import { ListadoFenologiaComponent } from './main/modulo-admin/fenologia/listado-fenologia/listado-fenologia.component';
import { AlgoritmosComponent } from './main/modulo-admin/algoritmos/algoritmos.component';
import { FieldClimateIntegracionComponent } from './main/modulo-admin/fieldclimate-integracion/fieldclimate-integracion.component';
import { MotorIaMalezasComponent } from './main/modulo-admin/motor-ia-malezas/motor-ia-malezas.component';

const adminOnly = { canActivate: [roleGuard], data: { niveles: ['Admin'] } };
const quimicaScope = { canActivate: [roleGuard], data: { niveles: ['Admin', 'Quimica'] } };
const distribuidorScope = { canActivate: [roleGuard], data: { niveles: ['Admin', 'Quimica', 'Distribuidor'] } };

export const routes: Routes = [
  { path: 'auth', component: LoginComponent },
  {
    path: 'login',
    children: [
      { path: 'auth', component: LoginComponent },
      { path: '', redirectTo: 'auth', pathMatch: 'full' },
    ],
  },
  {
    path: '',
    component: NavComponent,
    canActivate: [loginGuard],
    children: [
      // *** Prductor *** //
      // Mapa
      { path: '', redirectTo: 'mapa', pathMatch: 'full' },
      { path: 'mapa', component: MapaComponent },
      // Lotes
      { path: 'lotes', component: ListadoLotesComponent },
      { path: 'lotes/detalles/:id', component: DetallesLoteComponent },
      { path: 'lotes/editar/:id', component: CrearEditarLoteComponent },
      { path: 'lotes/crear', component: CrearEditarLoteComponent },
      { path: 'lotes/fertilizar/:id', component: CrearEditarFertilizacionComponent },
      { path: 'lotes/fumigar/:id', component: CrearEditarFumigacionComponent },
      { path: 'lotes/cosechar/:id', component: CrearEditarCosechaComponent },
      { path: 'lotes/sembrar/:id', component: CrearEditarSiembraComponent },
      // Alertas
      { path: 'alertas', component: ListadoAlertasComponent },
      // Establecimietos
      { path: 'establecimientos', component: ListadoEstablecimientosComponent },
      { path: 'establecimientos/editar/:id', component: CrearEditarEstablecimientosComponent },
      { path: 'establecimientos/crear', component: CrearEditarEstablecimientosComponent },
      // *** Prductor *** //

      // *** Distribuidor *** //
      // Productores
      { path: 'dashboard-distribuidor', component: DashboardDistribuidorComponent, ...distribuidorScope },
      { path: 'productores', component: ListadoProductoresComponent, ...distribuidorScope },
      { path: 'productores/editar/:id', component: CrearEditarProductoresComponent, ...distribuidorScope },
      { path: 'productores/crear', component: CrearEditarProductoresComponent, ...distribuidorScope },
      // *** Distribuidor *** //

      // *** Química *** //
      // Distribuidores
      { path: 'dashboard-quimica', component: DashboardQuimicaComponent, ...quimicaScope },
      { path: 'distribuidores', component: ListadoDistribuidoresComponent, ...quimicaScope },
      { path: 'distribuidores/editar/:id', component: CrearEditarDistribuidoresComponent, ...quimicaScope },
      { path: 'distribuidores/crear', component: CrearEditarDistribuidoresComponent, ...quimicaScope },
      // *** Química *** //

      // *** Admin *** //
      { path: 'dashboard-admin', component: DashboardAdminComponent, ...adminOnly },
      // Camaras / Time-lapse
      { path: 'camaras', component: ListadoTimeLapseComponent, ...adminOnly },
      { path: 'camaras/fotos/:id', component: ListadoImagenesLoteComponent, ...adminOnly },
      { path: 'camaras/asignar-camara', component: AsignarCamaraLoteComponent, ...adminOnly },
      { path: 'time-lapse', component: ListadoTimeLapseComponent, ...adminOnly },
      { path: 'time-lapse/fotos/:id', component: ListadoImagenesLoteComponent, ...adminOnly },
      { path: 'time-lapse/asignar-camara', component: AsignarCamaraLoteComponent, ...adminOnly },
      // Químicas
      { path: 'quimicas', component: ListadoQuimicasComponent, ...adminOnly },
      { path: 'quimicas/editar/:id', component: CrearEditarQuimicasComponent, ...adminOnly },
      { path: 'quimicas/crear', component: CrearEditarQuimicasComponent, ...adminOnly },
      // Semillas
      { path: 'semillas', component: ListadoSemillasComponent, ...adminOnly },
      { path: 'semillas/editar/:id', component: CrearEditarSemillasComponent, ...adminOnly },
      { path: 'semillas/crear', component: CrearEditarSemillasComponent, ...adminOnly },
      // Licencias
      { path: 'licencias', component: ListadoLicenciasComponent, ...adminOnly },
      { path: 'licencias/editar/:id', component: CrearEditarLicenciasComponent, ...adminOnly },
      { path: 'licencias/crear', component: CrearEditarLicenciasComponent, ...adminOnly },
      // Dispositivos
      { path: 'dispositivos', component: ListadoDispositivosComponent, ...adminOnly },
      { path: 'dispositivos/editar/:id', component: CrearEditarDispositivosComponent, ...adminOnly },
      { path: 'dispositivos/crear', component: CrearEditarDispositivosComponent, ...adminOnly },
      { path: 'dispositivos/detalles/:id', component: DetallesDispositivoComponent, ...adminOnly },
      // Fenologia
      { path: 'fenologias', component: ListadoFenologiaComponent, ...adminOnly },
      { path: 'fenologias/editar/:id', component: CrearEditarFenologiaComponent, ...adminOnly },
      { path: 'fenologias/crear', component: CrearEditarFenologiaComponent, ...adminOnly },
      // Algoritmos
      { path: 'algoritmos', component: AlgoritmosComponent, ...adminOnly },
      { path: 'motor-ia-malezas', component: MotorIaMalezasComponent, ...adminOnly },
      // FieldClimate
      { path: 'fieldclimate', component: FieldClimateIntegracionComponent, ...adminOnly },

      // *** Admin *** //

      // *** Compartidos *** //
      // Usuarios
      { path: 'usuarios', component: ListadoUsuariosComponent },
      { path: 'usuarios/editar/:id', component: CrearEditarUsuariosComponent },
      { path: 'usuarios/crear', component: CrearEditarUsuariosComponent },
      // Aplicación
      { path: 'aplicacion', component: AplicacionComponent },
      // KMZ
      { path: 'kmz', component: KMZComponent },
      // *** Compartidos *** //
    ],
  },
];
