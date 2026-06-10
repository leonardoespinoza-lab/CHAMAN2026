# Audit Checklist

## Codigo

- [ ] Cada servicio tiene responsabilidad clara.
- [ ] No hay credenciales reales en codigo fuente.
- [ ] Los endpoints multi-tenant filtran por permiso.
- [ ] Las entidades principales tienen indices adecuados.
- [ ] Los logs son utiles y no exponen datos sensibles.
- [ ] Los scripts demo son idempotentes y claramente marcados.

## Datos

- [ ] Semillas/variedades versionadas por campania.
- [ ] Fenologias trazables por cultivo/ciclo/departamento.
- [ ] Fertilizantes y principios activos cargados desde fuente controlada.
- [ ] Sensores relacionados con productor/distribuidor/quimica.
- [ ] Estaciones climaticas priorizadas antes de fallback Open-Meteo.

## Deploy

- [ ] Variables por servicio documentadas.
- [ ] Servicios con health check.
- [ ] Build reproducible desde repo limpio.
- [ ] Mongo/Redis externos configurados.
- [ ] Frontend apunta a API publica del ambiente.
