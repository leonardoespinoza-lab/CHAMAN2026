# Migracion segura de metadatos de frio legacy

## Objetivo

La migracion `20260716-cold-metadata-normalization-v1` separa datos historicos de frio de los modelos canonicos de Chaman sin inventar equivalencias cientificas.

Los valores originales no se borran: quedan dentro de `legacy.frio.raw`, se respaldan en MongoDB y se exportan a un archivo JSON con checksum SHA-256 antes de cualquier escritura funcional.

El script trabaja sobre:

- `semillas.requerimientoFrio`;
- `dispositivos.frioAcumulado`.

No modifica observaciones meteorologicas horarias, resultados canonicos del motor agrometeorologico, siembras, lotes ni fenologia.

## Reglas de normalizacion

| Caso detectado | Tratamiento |
|---|---|
| `HFE = round(HF * 0,82)` y `CP = round(HF / 15)` | HFE y CP se retiran del bloque canonico, se conservan en `legacy.frio.raw`, el requisito queda `requiere_calibracion` y `modeloRector: sin_calibrar`. HF se conserva como referencia original, pero no queda validado. |
| Vid con `HF/HFE/CP = 0/0/0` | Los tres ceros dejan de interpretarse como un requisito real. La variedad queda `modeloRector: sin_calibrar` y `requiere_calibracion`; el triplete original permanece auditable. |
| HFE legacy con CP declarado que no coincide con una conversion mecanica | HFE pasa a legado. CP se conserva como valor declarado, no como valor validado; el estado queda `requiere_calibracion`. |
| Dispositivo con `CP = HFE / 28`, factor HFE o modelo simplificado | HFE, CP simplificado y factor pasan a legado. El dispositivo expone solo la vista previa `HF 0-7,2 C`, version `hf-field-preview-1.0.0`, estado `preview`. |
| Resultado horario identificado como Dynamic Model canonico | No se degrada a preview ni se elimina su CP canonico. |

La migracion no convierte:

- HF a HFE;
- HF a CP;
- HFE a CP;
- CP a HF o HFE.

Chill Portions solo puede provenir del Dynamic Model ejecutado sobre una serie horaria con cobertura informada. HFE se conserva exclusivamente para trazabilidad historica y no gobierna decisiones nuevas.

## Seguridad operativa

### Dry-run por defecto

Sin argumento, el script ejecuta `plan`. `plan` solamente lee y resume:

```powershell
$env:MONGO_URI='<mongo-testing>'
$env:DB_NAME='chaman_testing'
npm run migrate:cold-metadata:plan
```

El resultado incluye:

- documentos inspeccionados por coleccion;
- documentos candidatos;
- conteos por firma detectada;
- una muestra acotada de identificadores y contexto;
- `dryRun: true`, `writes: false`.

### Apply explicito

`apply` requiere una confirmacion exacta ligada al ID de migracion:

```powershell
$env:MONGO_URI='<mongo-testing>'
$env:DB_NAME='chaman_testing'
$env:CHAMAN_MIGRATION_CONFIRM='20260716-cold-metadata-normalization-v1:apply'
npm run migrate:cold-metadata:apply -- --backup-dir='C:\backups-chaman'
```

Antes de modificar datos:

1. guarda original y reemplazo previsto en `migration_backup_items` mediante `$setOnInsert`;
2. genera un JSON Extended BSON, que conserva tipos MongoDB;
3. calcula y guarda su checksum SHA-256;
4. comprueba que los campos no hayan cambiado desde el backup;
5. marca el manifiesto como `applying`;
6. aplica los reemplazos;
7. marca `migration_manifests` como `applied`.

Si el manifiesto ya esta `applied`, una nueva ejecucion responde `alreadyApplied` y no vuelve a escribir. Si una ejecucion se interrumpe, los backups persistidos permiten completar o revertir sin regenerar los originales.

El directorio local por defecto es `migration-backups/` y esta excluido de Git. En Railway se recomienda definir `CHAMAN_MIGRATION_BACKUP_DIR` sobre un volumen persistente y copiar el archivo fuera del servicio antes de promover.

## Rollback

Rollback con el backup persistido en MongoDB:

```powershell
$env:CHAMAN_MIGRATION_CONFIRM='20260716-cold-metadata-normalization-v1:rollback'
npm run migrate:cold-metadata:rollback
```

Rollback desde el JSON exportado:

```powershell
$env:CHAMAN_MIGRATION_CONFIRM='20260716-cold-metadata-normalization-v1:rollback'
npm run migrate:cold-metadata:rollback -- --backup='C:\backups-chaman\20260716-cold-metadata-normalization-v1-....json'
```

El archivo se rechaza si:

- pertenece a otra migracion;
- tiene un formato distinto;
- falta el arreglo de entradas;
- su checksum no coincide.

El rollback verifica que cada campo conserve el original o el reemplazo registrado. Si encuentra una edicion posterior, se detiene para no pisarla. `--force-conflicts` existe como ultima instancia y debe usarse solo despues de revisar cada conflicto.

## Validacion recomendada

1. Ejecutar tests locales:

```powershell
npm run test:cold-metadata-migration
node --check scripts/migrations/20260716-cold-metadata-normalization.js
```

2. Ejecutar `plan` en Testing y guardar el JSON de salida.
3. Revisar manualmente todas las filas `vid_zero_triplet_without_calibration`, las firmas mecanicas y los dispositivos Kleppe.
4. Ejecutar `apply` solo en Testing con backup sobre volumen persistente.
5. Comprobar en la aplicacion:
   - los dispositivos muestran HF como preview;
   - CP canonico proviene del motor horario;
   - ninguna variedad mecanica aparece validada;
   - Vid sin calibracion no muestra 0 como requisito cumplido;
   - la fuente prioriza sensor de campo, luego central y finalmente Open-Meteo.
6. Conservar el backup, ejecutar pruebas funcionales y recien despues repetir el mismo procedimiento en Produccion.

## Estado de ejecucion

La implementacion y sus tests se prepararon localmente. No se ejecuto `apply` ni `rollback` contra ninguna base de datos durante el desarrollo de este cambio.
