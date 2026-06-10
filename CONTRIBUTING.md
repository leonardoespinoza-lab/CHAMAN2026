# Contributing

## Flujo de trabajo

1. Crear rama corta y descriptiva.
2. Mantener cambios acotados por servicio.
3. Actualizar documentacion si cambia una variable, endpoint, permiso o proceso.
4. Ejecutar build/test del servicio afectado.
5. Ejecutar auditoria de secretos antes de abrir PR.

## Convenciones

- TypeScript estricto donde el servicio lo permita.
- No mezclar refactors grandes con cambios funcionales.
- No duplicar modelos: `sdc-modelos` es la fuente compartida.
- Los cambios de permisos deben incluir prueba o verificacion por nivel: Admin, Quimica, Distribuidor, Productor, Establecimiento.
- Los datos demo deben tener prefijo claro y scripts idempotentes.

## Checklist de PR

- [ ] No hay secretos reales.
- [ ] El cambio respeta limites de servicio.
- [ ] Build local correcto.
- [ ] Variables nuevas documentadas en `deploy/railway`.
- [ ] Impacto multi-tenant revisado.
- [ ] No se toco codigo original fuera de `C:\CHAMAN2026`.
