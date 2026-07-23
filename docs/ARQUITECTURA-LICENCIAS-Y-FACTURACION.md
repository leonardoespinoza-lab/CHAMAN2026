# Arquitectura de licencias y futura facturacion

## Principios

1. **Autorizacion y licencia son controles distintos.** El permiso del usuario
   determina que entidades puede operar. La licencia solo limita prestaciones
   dentro de ese alcance y nunca puede ampliar permisos.
2. **El plan no pertenece a una entidad.** Es una definicion versionada y
   reutilizable del catalogo comercial.
3. **La asignacion es inmutable y auditable.** Vincula una version de plan con
   una Compania, Distribuidor, Productor, Establecimiento o Asesor, con inicio,
   vencimiento, estado, origen, motivo y usuario que realizo el cambio.
4. **El consumo se mide por separado.** La lectura administrativa informa
   usuarios, red comercial, establecimientos, lotes y hectareas. No se ejecuta
   en cada request y no decide autenticacion.
5. **Facturacion sera un consumidor, no la fuente de permisos.** Un proveedor
   de pagos podra referenciar cliente y suscripcion externos sin guardar datos
   de tarjeta en Chaman.

## Resolucion de licencia

La busqueda se realiza desde el alcance mas especifico al mas general:

- Compania: Compania -> plan por defecto.
- Distribuidor: Distribuidor -> Compania -> plan por defecto.
- Productor: Productor -> Distribuidor -> Compania -> plan por defecto.
- Establecimiento: Establecimiento -> Productor -> Distribuidor -> Compania -> plan por defecto.
- Asesor: Asesor -> Distribuidor asociado -> Compania -> plan por defecto.

El administrador global no queda restringido por un contrato comercial. Un
plan heredado evita duplicar asignaciones y divergir silenciosamente del
contrato superior.

## Estados y vigencia

Estados soportados: `programada`, `activa`, `gracia`, `suspendida`,
`cancelada`, `vencida` y `reemplazada`. Un cambio inmediato reemplaza la
asignacion anterior sin borrarla. Un cambio futuro conserva la vigente hasta
que llega `fechaInicio`.

Los planes usan `codigo + version` como identidad comercial estable y estados
`borrador`, `activo` o `archivado`. Un plan con historia no se elimina: se
archiva. Cambios de condiciones comerciales deben crearse como una nueva
version para no alterar contratos ya asignados.

## Preparacion para facturacion

La asignacion ya admite referencias externas de cliente y suscripcion. El
modulo de facturacion debera agregar:

- cuentas de facturacion y datos fiscales separados del usuario de acceso;
- precios, moneda, impuestos, ciclo y prorrateo versionados;
- eventos de uso inmutables con clave de idempotencia, fecha, metrica, cantidad
  y dimensiones de alcance;
- cierre de periodo y factura como documentos contables independientes;
- ajustes y notas de credito que no reescriban eventos historicos;
- webhooks verificados y reconciliacion con el proveedor de pagos;
- auditoria de quien cambio plan, vigencia, precio o estado de cobro.

La lectura de consumo actual es operativa y no debe convertirse directamente
en un cargo. La facturacion por uso requiere eventos persistidos e idempotentes.

## Referencias de diseno

- OWASP Authorization Cheat Sheet: minimo privilegio, denegar por defecto y
  validar autorizacion en cada request.
- Stripe usage-based billing: catalogo, medicion, facturacion y monitoreo como
  responsabilidades separadas; eventos con identificador idempotente.
- OpenMeter entitlements: cliente, feature, entitlement y grants separados; la
  suscripcion conecta plan, cliente y medidores.

## Compatibilidad

Los campos historicos `maxdDistribuidores` y `maxdHectareas` se conservan como
alias transitorios. El modelo canonico usa `maxDistribuidores` y
`maxHectareas`. Los registros legacy sin estado continúan operando como activos
hasta su migracion, y los limites legacy permanecen informativos para evitar
bloqueos inesperados en clientes existentes.
