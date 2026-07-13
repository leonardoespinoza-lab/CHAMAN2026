import { Routes } from '@angular/router';
import { loginGuard } from './auxiliares/guards/login.guard';
import { roleGuard } from './auxiliares/guards/role.guard';

const adminOnly = { canActivate: [roleGuard], data: { niveles: ['Admin'] } };
const quimicaScope = { canActivate: [roleGuard], data: { niveles: ['Admin', 'Quimica'] } };
const distribuidorScope = { canActivate: [roleGuard], data: { niveles: ['Admin', 'Quimica', 'Distribuidor'] } };

const loadLogin = () => import('./login/login/login.component').then((m) => m.LoginComponent);
const loadNav = () => import('./main/nav/nav.component').then((m) => m.NavComponent);
const loadMapa = () => import('./main/modulo-productor/mapa/mapa.component').then((m) => m.MapaComponent);
const loadListadoLotes = () =>
  import('./main/modulo-productor/lotes/listado-lotes/listado-lotes.component').then((m) => m.ListadoLotesComponent);
const loadDetallesLote = () =>
  import('./main/modulo-productor/lotes/detalles-lote/detalles-lote.component').then((m) => m.DetallesLoteComponent);
const loadCrearEditarLote = () =>
  import('./main/modulo-productor/lotes/crear-editar-lote/crear-editar-lote.component').then(
    (m) => m.CrearEditarLoteComponent
  );
const loadCrearEditarFertilizacion = () =>
  import('./main/modulo-productor/lotes/crear-editar-fertilizacion/crear-editar-fertilizacion.component').then(
    (m) => m.CrearEditarFertilizacionComponent
  );
const loadCrearEditarFumigacion = () =>
  import('./main/modulo-productor/lotes/crear-editar-fumigacion/crear-editar-fumigacion.component').then(
    (m) => m.CrearEditarFumigacionComponent
  );
const loadCrearEditarCosecha = () =>
  import('./main/modulo-productor/lotes/crear-editar-cosecha/crear-editar-cosecha.component').then(
    (m) => m.CrearEditarCosechaComponent
  );
const loadCrearEditarSiembra = () =>
  import('./main/modulo-productor/lotes/crear-editar-siembra/crear-editar-siembra.component').then(
    (m) => m.CrearEditarSiembraComponent
  );
const loadListadoAlertas = () =>
  import('./main/modulo-productor/alertas/listado-alertas/listado-alertas.component').then(
    (m) => m.ListadoAlertasComponent
  );
const loadListadoEstablecimientos = () =>
  import('./main/modulo-productor/establecimientos/listado-establecimientos/listado-establecimientos.component').then(
    (m) => m.ListadoEstablecimientosComponent
  );
const loadCrearEditarEstablecimientos = () =>
  import('./main/modulo-productor/establecimientos/crear-editar-establecimientos/crear-editar-establecimientos.component').then(
    (m) => m.CrearEditarEstablecimientosComponent
  );
const loadDashboardDistribuidor = () =>
  import('./main/modulo-distribuidor/dashboard/dashboard.component').then((m) => m.DashboardDistribuidorComponent);
const loadListadoProductores = () =>
  import('./main/modulo-distribuidor/productores/listado-productores/listado-productores.component').then(
    (m) => m.ListadoProductoresComponent
  );
const loadCrearEditarProductores = () =>
  import('./main/modulo-distribuidor/productores/crear-editar-productores/crear-editar-productores.component').then(
    (m) => m.CrearEditarProductoresComponent
  );
const loadDashboardQuimica = () =>
  import('./main/modulo-quimica/dashboard/dashboard.component').then((m) => m.DashboardQuimicaComponent);
const loadListadoDistribuidores = () =>
  import('./main/modulo-quimica/distribuidores/listado-distribuidores/listado-distribuidores.component').then(
    (m) => m.ListadoDistribuidoresComponent
  );
const loadCrearEditarDistribuidores = () =>
  import('./main/modulo-quimica/distribuidores/crear-editar-distribuidores/crear-editar-distribuidores.component').then(
    (m) => m.CrearEditarDistribuidoresComponent
  );
const loadDashboardAdmin = () =>
  import('./main/modulo-admin/dashboard-admin/dashboard-admin.component').then((m) => m.DashboardAdminComponent);
const loadListadoTimeLapse = () =>
  import('./main/modulo-admin/time-lapse/listado-time-lapse/listado-time-lapse.component').then(
    (m) => m.ListadoTimeLapseComponent
  );
const loadListadoImagenesLote = () =>
  import('./main/modulo-admin/time-lapse/listado-imagenes-lote/listado-imagenes-lote.component').then(
    (m) => m.ListadoImagenesLoteComponent
  );
const loadAsignarCamaraLote = () =>
  import('./main/modulo-admin/time-lapse/asignar-camara-lote/asignar-camara-lote.component').then(
    (m) => m.AsignarCamaraLoteComponent
  );
const loadListadoQuimicas = () =>
  import('./main/modulo-admin/quimicas/listado-quimicas/listado-quimicas.component').then(
    (m) => m.ListadoQuimicasComponent
  );
const loadCrearEditarQuimicas = () =>
  import('./main/modulo-admin/quimicas/crear-editar-quimicas/crear-editar-quimicas.component').then(
    (m) => m.CrearEditarQuimicasComponent
  );
const loadListadoSemillas = () =>
  import('./main/modulo-admin/semillas/listado-semillas/listado-semillas.component').then(
    (m) => m.ListadoSemillasComponent
  );
const loadCrearEditarSemillas = () =>
  import('./main/modulo-admin/semillas/crear-editar-semillas/crear-editar-semillas.component').then(
    (m) => m.CrearEditarSemillasComponent
  );
const loadListadoLicencias = () =>
  import('./main/modulo-admin/licencias/listado-licencias/listado-licencias.component').then(
    (m) => m.ListadoLicenciasComponent
  );
const loadCrearEditarLicencias = () =>
  import('./main/modulo-admin/licencias/crear-editar-licencias/crear-editar-licencias.component').then(
    (m) => m.CrearEditarLicenciasComponent
  );
const loadListadoDispositivos = () =>
  import('./main/modulo-admin/dispositivos/listado-dispositivos/listado-dispositivos.component').then(
    (m) => m.ListadoDispositivosComponent
  );
const loadCrearEditarDispositivos = () =>
  import('./main/modulo-admin/dispositivos/crear-editar-dispositivos/crear-editar-dispositivos.component').then(
    (m) => m.CrearEditarDispositivosComponent
  );
const loadDetallesDispositivo = () =>
  import('./main/modulo-admin/dispositivos/detalles-dispositivo/detalles-dispositivo.component').then(
    (m) => m.DetallesDispositivoComponent
  );
const loadListadoFenologia = () =>
  import('./main/modulo-admin/fenologia/listado-fenologia/listado-fenologia.component').then(
    (m) => m.ListadoFenologiaComponent
  );
const loadCrearEditarFenologia = () =>
  import('./main/modulo-admin/fenologia/crear-editar-fenologia/crear-editar-fenologia.component').then(
    (m) => m.CrearEditarFenologiaComponent
  );
const loadAlgoritmos = () =>
  import('./main/modulo-admin/algoritmos/algoritmos.component').then((m) => m.AlgoritmosComponent);
const loadMotorIaMalezas = () =>
  import('./main/modulo-admin/motor-ia-malezas/motor-ia-malezas.component').then((m) => m.MotorIaMalezasComponent);
const loadFieldClimate = () =>
  import('./main/modulo-admin/fieldclimate-integracion/fieldclimate-integracion.component').then(
    (m) => m.FieldClimateIntegracionComponent
  );
const loadListadoUsuarios = () =>
  import('./main/usuarios/listado-usuarios/listado-usuarios.component').then((m) => m.ListadoUsuariosComponent);
const loadCrearEditarUsuarios = () =>
  import('./main/usuarios/crear-editar-usuarios/crear-editar-usuarios.component').then(
    (m) => m.CrearEditarUsuariosComponent
  );
const loadAplicacion = () => import('./main/aplicacion/aplicacion.component').then((m) => m.AplicacionComponent);
const loadKmz = () => import('./main/kmz/kmz.component').then((m) => m.KMZComponent);

export const routes: Routes = [
  { path: 'auth', loadComponent: loadLogin },
  {
    path: 'login',
    children: [
      { path: 'auth', loadComponent: loadLogin },
      { path: '', redirectTo: 'auth', pathMatch: 'full' },
    ],
  },
  {
    path: '',
    loadComponent: loadNav,
    canActivate: [loginGuard],
    children: [
      // *** Prductor *** //
      // Mapa
      { path: '', redirectTo: 'mapa', pathMatch: 'full' },
      { path: 'mapa', loadComponent: loadMapa },
      // Lotes
      { path: 'lotes', loadComponent: loadListadoLotes },
      { path: 'lotes/detalles/:id', loadComponent: loadDetallesLote },
      { path: 'lotes/editar/:id', loadComponent: loadCrearEditarLote },
      { path: 'lotes/crear', loadComponent: loadCrearEditarLote },
      { path: 'lotes/fertilizar/:id', loadComponent: loadCrearEditarFertilizacion },
      { path: 'lotes/fumigar/:id', loadComponent: loadCrearEditarFumigacion },
      { path: 'lotes/cosechar/:id', loadComponent: loadCrearEditarCosecha },
      { path: 'lotes/sembrar/:id', loadComponent: loadCrearEditarSiembra },
      // Alertas
      { path: 'alertas', loadComponent: loadListadoAlertas },
      // Establecimietos
      { path: 'establecimientos', loadComponent: loadListadoEstablecimientos },
      { path: 'establecimientos/editar/:id', loadComponent: loadCrearEditarEstablecimientos },
      { path: 'establecimientos/crear', loadComponent: loadCrearEditarEstablecimientos },
      // *** Prductor *** //

      // *** Distribuidor *** //
      // Productores
      { path: 'dashboard-distribuidor', loadComponent: loadDashboardDistribuidor, ...distribuidorScope },
      { path: 'productores', loadComponent: loadListadoProductores, ...distribuidorScope },
      { path: 'productores/editar/:id', loadComponent: loadCrearEditarProductores, ...distribuidorScope },
      { path: 'productores/crear', loadComponent: loadCrearEditarProductores, ...distribuidorScope },
      // *** Distribuidor *** //

      // *** Química *** //
      // Distribuidores
      { path: 'dashboard-quimica', loadComponent: loadDashboardQuimica, ...quimicaScope },
      { path: 'distribuidores', loadComponent: loadListadoDistribuidores, ...quimicaScope },
      { path: 'distribuidores/editar/:id', loadComponent: loadCrearEditarDistribuidores, ...quimicaScope },
      { path: 'distribuidores/crear', loadComponent: loadCrearEditarDistribuidores, ...quimicaScope },
      // *** Química *** //

      // *** Admin *** //
      { path: 'dashboard-admin', loadComponent: loadDashboardAdmin, ...adminOnly },
      // Camaras / Time-lapse
      { path: 'camaras', loadComponent: loadListadoTimeLapse, ...adminOnly },
      { path: 'camaras/fotos/:id', loadComponent: loadListadoImagenesLote, ...adminOnly },
      { path: 'camaras/asignar-camara', loadComponent: loadAsignarCamaraLote, ...adminOnly },
      { path: 'time-lapse', loadComponent: loadListadoTimeLapse, ...adminOnly },
      { path: 'time-lapse/fotos/:id', loadComponent: loadListadoImagenesLote, ...adminOnly },
      { path: 'time-lapse/asignar-camara', loadComponent: loadAsignarCamaraLote, ...adminOnly },
      // Químicas
      { path: 'quimicas', loadComponent: loadListadoQuimicas, ...adminOnly },
      { path: 'quimicas/editar/:id', loadComponent: loadCrearEditarQuimicas, ...adminOnly },
      { path: 'quimicas/crear', loadComponent: loadCrearEditarQuimicas, ...adminOnly },
      // Semillas
      { path: 'semillas', loadComponent: loadListadoSemillas, ...adminOnly },
      { path: 'semillas/editar/:id', loadComponent: loadCrearEditarSemillas, ...adminOnly },
      { path: 'semillas/crear', loadComponent: loadCrearEditarSemillas, ...adminOnly },
      // Licencias
      { path: 'licencias', loadComponent: loadListadoLicencias, ...adminOnly },
      { path: 'licencias/editar/:id', loadComponent: loadCrearEditarLicencias, ...adminOnly },
      { path: 'licencias/crear', loadComponent: loadCrearEditarLicencias, ...adminOnly },
      // Dispositivos
      { path: 'dispositivos', loadComponent: loadListadoDispositivos, ...adminOnly },
      { path: 'dispositivos/editar/:id', loadComponent: loadCrearEditarDispositivos, ...adminOnly },
      { path: 'dispositivos/crear', loadComponent: loadCrearEditarDispositivos, ...adminOnly },
      { path: 'dispositivos/detalles/:id', loadComponent: loadDetallesDispositivo, ...adminOnly },
      // Fenologia
      { path: 'fenologias', loadComponent: loadListadoFenologia, ...adminOnly },
      { path: 'fenologias/editar/:id', loadComponent: loadCrearEditarFenologia, ...adminOnly },
      { path: 'fenologias/crear', loadComponent: loadCrearEditarFenologia, ...adminOnly },
      // Algoritmos
      { path: 'algoritmos', loadComponent: loadAlgoritmos, ...adminOnly },
      { path: 'motor-ia-malezas', loadComponent: loadMotorIaMalezas, ...adminOnly },
      // FieldClimate
      { path: 'fieldclimate', loadComponent: loadFieldClimate, ...adminOnly },

      // *** Admin *** //

      // *** Compartidos *** //
      // Usuarios
      { path: 'usuarios', loadComponent: loadListadoUsuarios },
      { path: 'usuarios/editar/:id', loadComponent: loadCrearEditarUsuarios },
      { path: 'usuarios/crear', loadComponent: loadCrearEditarUsuarios },
      // Aplicación
      { path: 'aplicacion', loadComponent: loadAplicacion },
      // KMZ
      { path: 'kmz', loadComponent: loadKmz },
      // *** Compartidos *** //
    ],
  },
];
