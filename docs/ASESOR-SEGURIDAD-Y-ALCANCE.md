# Nivel ASESOR: alcance, seguridad y datos profesionales

## Objetivo

El nivel `Asesor` representa a un gestor profesional de una red de productores. Su funcionamiento comercial equivale al de un distribuidor: puede crear y administrar productores y usuarios de nivel `Productor`, y puede observar todo lo que ocurre aguas abajo. Los establecimientos, lotes y campanas los generan los usuarios productores; el Asesor no los crea, edita ni elimina directamente.

## Modelo de alcance

- `idAsesor`: identidad canonica derivada del usuario autenticado; nunca se confia en un valor enviado por el navegador.
- `idProductores[]`: cartera efectiva derivada de los productores cuyo `idAsesorPropietario` coincide con el asesor autenticado.
- `idEstablecimientos[]`: alcance de supervision derivado de los productores de la cartera. Se conservan asignaciones historicas explicitas por compatibilidad.
- `idDistribuidor`: patrocinador comercial opcional; no define por si solo la cartera del asesor.
- `ubicacionProfesional`: direccion georreferenciada y radio de influencia entre 1 y 1.000 km.
- `datosProfesionales`: profesion, especialidad, matricula, consejo/colegio y foto.

Los identificadores enviados por el navegador no se consideran autoridad. En cada solicitud, la API deriva la identidad del Asesor, consulta sus productores y expande el alcance hacia establecimientos y lotes. Los establecimientos creados posteriormente por un usuario Productor heredan la relacion con el Asesor a traves de su productor.

## Matriz operativa

| Recurso | Lectura | Escritura directa del Asesor | Regla de alcance |
| --- | --- | --- | --- |
| Productores | Si | Si | Solo productores cuyo propietario es el Asesor autenticado |
| Usuarios | Si | Si | Solo usuarios de nivel `Productor` pertenecientes a su cartera |
| Establecimientos | Si | No | Los crea y mantiene el usuario Productor |
| Lotes y campanas | Si | No | Los crea y mantiene Productor/Establecimiento |
| Clima, estaciones y sensores | Si | Solo operaciones que tambien admite Distribuidor | Recursos aguas abajo de la cartera |
| Alertas, predicciones y NDVI | Si | Solo acciones de supervision/recalculo equivalentes a Distribuidor | La API deriva siembra, lote y establecimiento canonicos |
| Informes | Si | Generacion de informes | Solo lotes autorizados |

Para administrar productores y usuarios, el Asesor necesita rol `Admin` o `Escritura` segun el recurso; la administracion de usuarios exige rol `Admin`.

## Limites aplicados en dos capas

- El frontend no ofrece rutas ni acciones de alta/edicion de establecimientos, lotes, siembras o cosechas al Asesor.
- Los controladores de la API no autorizan al nivel `Asesor` en esas operaciones.
- Los servicios de dominio vuelven a rechazar esas mutaciones como defensa adicional, incluso si se intentara invocar un endpoint de forma manual.
- Al crear o editar productores, el backend ignora cualquier propietario, distribuidor o compania enviado para ampliar alcance y conserva la jerarquia efectiva.

## Sesiones y credenciales

- El hash de la contrasena se excluye por defecto de las consultas y solo se selecciona expresamente durante el login.
- Cambiar usuario, contrasena, estado o permisos revoca todas las sesiones activas del usuario afectado.
- La identidad efectiva agrega automaticamente productores y recursos aguas abajo.
- HTTP y WebSocket consumen la misma identidad y el mismo alcance derivados en backend.

## Foto profesional

- Formatos aceptados: PNG, JPEG y WebP.
- Tamano maximo decodificado: 1 MB.
- La API valida tipo declarado y firma binaria.
- La lista de usuarios excluye la imagen para evitar respuestas pesadas.
- El certificado PDF del lote incorpora identidad profesional y foto del emisor cuando estan disponibles.

## Criterios de regresion obligatorios

Antes de promover cambios que afecten permisos se debe verificar:

1. Un Asesor ve exclusivamente sus productores y toda la red aguas abajo.
2. Puede crear, editar y eliminar productores propios con una licencia efectiva.
3. Puede crear y administrar solamente usuarios de nivel `Productor` dentro de su cartera.
4. No puede crear, editar ni eliminar establecimientos, lotes, siembras o cosechas.
5. Un usuario Productor de la cartera puede crear establecimientos y lotes normalmente.
6. Los recursos creados por el Productor aparecen automaticamente en la supervision del Asesor.
7. HTTP y WebSocket producen el mismo alcance.
8. La modificacion de permisos o credenciales revoca la sesion anterior.
9. Los informes no fallan si el perfil profesional o la foto estan incompletos.
