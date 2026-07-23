# CHAMAN multi-tenant - piloto controlado

Fecha: 22 de julio de 2026

## Objetivo de esta fase

Incorporar un plano de control para crear espacios empresariales con identidad, administrador, funciones y limites propios, sin reasignar ni mezclar informacion productiva existente.

Esta fase se publica exclusivamente en testing. No habilita todavia la escritura de companias, distribuidores, asesores, productores, establecimientos o lotes dentro del tenant. Esas entidades requieren una migracion explicita con `tenantId` canonico y validacion de aislamiento en cada repositorio.

## Frontera de seguridad

- `Tenant` es una entidad canonica, no un atributo visual del usuario.
- Cada permiso de nivel `Tenant` contiene un `idTenant` derivado de la sesion.
- Un administrador tenant solo puede listar, crear, ver y modificar usuarios con el mismo `idTenant`.
- Un administrador tenant solo puede editar su identidad visual y dominios. Estado, modulos, capacidades y limites quedan reservados a CHAMAN Admin.
- El archivado conserva trazabilidad y no borra fisicamente el tenant.
- La creacion del administrador es recuperable: un fallo de usuario duplicado deja el tenant en borrador y permite reintentar el aprovisionamiento.
- Esta fase no usa un filtro enviado por el navegador para decidir el tenant.

## Modelo

`Tenant`

- Identidad: nombre, slug, razon social, CUIT y dominios.
- Branding: nombre de aplicacion, logo y colores.
- Gobierno: companias, distribuidores, asesores, productores y capacidad territorial de asesores.
- Servicios: modulos habilitados.
- Limites: usuarios, estructura, lotes y hectareas.
- Raiz: referencia opcional a Compania, Distribuidor o Asesor.
- Provisionamiento: administrador inicial, estado y ultimo error.

## Flujo del piloto

1. CHAMAN Admin crea el tenant.
2. Datos persiste la frontera organizacional.
3. API crea un usuario administrador con permiso `Tenant` e `idTenant` canonico.
4. El usuario inicia sesion y entra a un dashboard con su identidad visual.
5. La gestion de usuarios se filtra obligatoriamente por `idTenant`.

## Proxima fase: datos operativos

Antes de habilitar las capacidades territoriales se debe:

1. agregar `tenantId` a compania, distribuidor, asesor, productor, establecimiento, lote, siembra, dispositivo, estacion, alerta, prediccion e informe;
2. crear indices compuestos con `tenantId` para nombres y claves unicas;
3. derivar `tenantId` exclusivamente de la sesion en altas y actualizaciones;
4. aplicar filtros de tenant en repositorios, workers, WebSocket, MQTT, reportes, archivos y caches;
5. migrar datos actuales a un tenant CHAMAN canonico con conteos de control y rollback;
6. ejecutar pruebas negativas entre dos tenants en todos los recursos;
7. recien entonces habilitar jerarquia y gestion territorial.

## Criterios para produccion

- Cero lecturas o escrituras cruzadas en la matriz de pruebas.
- Caches, colas y archivos particionados por tenant.
- Dominios y certificados verificados.
- Auditoria de altas, cambios, suspensiones y archivados.
- Plan de rollback probado.
- Backups y restauracion ensayados por tenant o por conjunto consistente.

## Referencias de diseno

- Microsoft Azure Architecture Center, enfoques y modelos de tenancy.
- AWS Well-Architected SaaS Lens, identidad e isolation mindset.
- OWASP Authorization Cheat Sheet, minimo privilegio y validacion en cada solicitud.
