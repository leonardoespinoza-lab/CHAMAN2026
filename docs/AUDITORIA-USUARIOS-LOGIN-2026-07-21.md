# Auditoria funcional, visual y de seguridad: usuarios y login

Fecha de ejecucion: 21/22 de julio de 2026
Entorno de validacion: `testing` aislado
Alcance productivo de esta intervencion: correccion de visibilidad territorial del perfil Productor.

## Separacion de despliegues

- Produccion API: despliegue `099b68ca-c9e6-486a-9380-278f5d2153ec` exitoso.
- Produccion Web: despliegue `7246cb00-fef1-4564-b240-de710ad00d92` exitoso.
- Se verifico con un Productor real que `/usuarios/red/comercial` responde `403` y que el encabezado de red territorial no se renderiza.
- Las mejoras posteriores de usuarios, permisos y sesiones quedaron solamente en testing para aprobacion visual antes de promoverlas.

Despliegues finales de testing:

- Datos: `aa1c56fc-f730-4f1a-b8d4-73ccef4ce0ed` (`SUCCESS`).
- Auth: `341e583e-c968-46d9-8a1f-dcc19e3b3b95` (`SUCCESS`).
- API: `14157645-cec4-4306-b9c9-65063d656f2e` (`SUCCESS`).
- Web: `1da2764a-3d1f-4479-9426-e59331a63c94` (`SUCCESS`).

## Resultado funcional

| Flujo | Resultado |
|---|---|
| Login de usuario activo | `200` |
| Lectura del usuario propio | `200` |
| Creacion de usuario | Correcta, devuelve identificador |
| Username duplicado | Rechazado con `400` y mensaje controlado |
| Consulta y edicion | Correctas |
| Autoarchivo de la cuenta activa | Rechazado con `400` |
| Desactivacion | Correcta; el login posterior responde `401` |
| Reactivacion | Correcta; recupera el acceso |
| Archivo logico | Correcto, conserva metadata de auditoria |
| Login de usuario archivado | Rechazado con `401` |
| Productor con rol Lectura: perfil propio | `200` |
| Productor con rol Lectura: administracion de usuarios | Rechazado con `403` |
| Logout | Confirma revocacion y el token previo responde `401` |
| Rate limiting de login | Quinto intento invalido seguido por `429` |

Las cuentas tecnicas usadas para las pruebas quedaron inactivas, archivadas y sin sesiones vigentes en la base de testing.

## Correcciones incorporadas en testing

- Usuarios inactivos o archivados no pueden iniciar sesion por clave ni por identidad social.
- Login inexistente/inactivo/archivado devuelve `401` uniforme, sin filtrar la existencia de la cuenta.
- Logout envia un DTO minimo entre Auth y Datos; se elimino el fallo por campos internos de MongoDB y ahora revoca access y refresh token.
- Inactividad de cliente de 30 minutos y duracion absoluta de sesion de 8 horas; la actividad valida sincroniza la sesion con el servidor.
- Rate limiting sobre login y validacion de clave.
- Los cambios de identidad, clave, permisos, activacion o archivo revocan sesiones.
- Las rutas de gestion exigen nivel permitido y rol `Admin`.
- Un permiso conserva identidad y alcance al ser seleccionado; no se confunden dos permisos Asesor diferentes.
- Se bloquea la combinacion imposible `nivel Admin + rol Lectura/Escritura` tanto en backend como en formulario.
- El rol sin escritura se redirige a `/mapa`, evitando ciclos hacia paneles administrativos.
- El asesor puede consultar su propia cuenta para cambiar su clave, pero no salir de su cartera.
- El archivo de un asesor afecta solo recursos de su propiedad; no archiva recursos externos meramente asignados y conserva permisos externos de usuarios multialcance.
- El listado separa operativos, inactivos y archivados; muestra fecha/actor de archivo y deshabilita acciones incompatibles.

## Revision visual y accesibilidad

- Listado revisado en navegador real: jerarquia clara, filtros, busqueda, estado, alcance y acciones por fila.
- Formulario revisado en navegador real: campos Usuario y Contrasena correctamente etiquetados; tabs Basico, Permisos y Datos Personales navegables.
- Selectores de Rol y Nivel poseen nombres accesibles; el nivel Admin ofrece unicamente el rol Admin.
- Botones Editar y Archivar tienen nombre accesible; el icono de archivo se cambio a un glifo compatible.
- Los controles de cuenta ahora se anuncian como `Editar perfil` y `Cerrar sesion`; el icono de salida es valido.
- El cierre de sesion fue ejecutado desde la interfaz, confirmo la accion y regreso a `/auth`.

## Pruebas automaticas

- Base integral: 55 pruebas especificas aprobadas (API 32, Datos 5, Auth 7, Web 11).
- Rerun posterior a hallazgos: 15 pruebas del servicio de usuarios y 8 pruebas de formulario/guardas, todas aprobadas.
- Compilaciones completas aprobadas: API, Datos, Auth y Web.
- Bundle inicial Web de testing: 2,61 MB (aprox. 530 kB de transferencia). Persisten advertencias antiguas por dependencias CommonJS; no bloquean este modulo.

## Criterios de seguridad y riesgo residual

La implementacion sigue el principio de expiracion, revocacion y menor privilegio de las guias de OWASP y OAuth 2.0 Security Best Current Practice:

- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- https://www.rfc-editor.org/rfc/rfc9700.html

Riesgo arquitectonico pendiente: el SPA aun conserva tokens en almacenamiento del navegador. Los controles agregados reducen exposicion y aseguran expiracion/revocacion, pero la evolucion recomendada es un BFF con cookies `Secure`, `HttpOnly` y `SameSite`, con proteccion CSRF. Tambien conviene mover el rate limiting a Redis si Auth escala a multiples replicas. Ninguna de esas dos migraciones debe mezclarse con la promocion actual sin una fase de compatibilidad y pruebas propia.

## Dictamen

La correccion productiva solicitada esta verificada. El modulo de usuarios/login corregido queda como candidato aprobado tecnicamente en testing, no promovido a produccion, para revision visual del propietario antes del siguiente release.
