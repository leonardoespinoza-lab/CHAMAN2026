# CHAMAN2026 - Desarrollo local

Esta carpeta es la base de trabajo nueva. No depende del codigo que esta corriendo en produccion ni modifica GitHub.

## Servicios locales

- `sdc-datos`: `http://127.0.0.1:5000`
- `sdc-auth`: `http://127.0.0.1:5001`
- `sdc-api-cliente`: `http://127.0.0.1:5002`
- `sdc-api-predicciones`: `http://127.0.0.1:5007`
- `sdc-api-clima`: `http://127.0.0.1:5008/local`
- `sdc-api-lora`: `http://127.0.0.1:5012`
- `sdc-app-chaman`: `http://127.0.0.1:4200`

## Login local

- URL: `http://127.0.0.1:4200/auth`
- Usuario admin: `admin@chaman.local`
- Clave: `Chaman2026!`

Para recrear el admin local y el cliente OAuth:

```powershell
node C:\CHAMAN2026\scripts\seed-admin-local.js
```

Para cargar o actualizar datos maestros agronomicos locales:

```powershell
node C:\CHAMAN2026\scripts\seed-master-data-local.js
```

Ese script carga provincias, departamentos, enfermedades, cronos/fenologias y semillas de la campania 2025-2026 desde:

```text
C:\Users\lespinoza\Downloads\Variedades - Hibridos (5).xlsx
```

Para usar otra planilla:

```powershell
$env:CHAMAN_VARIETIES_XLSX="C:\ruta\Variedades.xlsx"
node C:\CHAMAN2026\scripts\seed-master-data-local.js
```

El script es idempotente: se puede correr mas de una vez sin duplicar registros.

Para levantar los servicios locales:

```powershell
C:\CHAMAN2026\scripts\start-local-services.ps1
```

## Orden de arranque

1. Levantar MongoDB local con base `chaman`.
2. Levantar `sdc-datos`.
3. Levantar `sdc-auth`.
4. Levantar `sdc-api-clima`.
5. Levantar `sdc-api-predicciones`.
6. Levantar `sdc-api-lora`.
7. Levantar `sdc-api-cliente`.
8. Levantar `sdc-app-chaman`.

## LoRaWAN local

`sdc-api-lora` escucha EMQX si existen estas variables en la terminal antes de iniciar:

```powershell
$env:LORAWAN_MQTT_ENABLED="true"
$env:LORAWAN_MQTT_URL="mqtts://v5160f66.ala.us-east-1.emqxsl.com:8883"
$env:LORAWAN_MQTT_USERNAME="<usuario-mqtt>"
$env:LORAWAN_MQTT_PASSWORD=$env:CHAMAN_MQTT_PASSWORD
$env:LORAWAN_MQTT_TOPIC="application/+/device/+/rx"
```

No guardar credenciales MQTT dentro del repositorio.

## Modelos compartidos

Todos los paquetes principales usan:

```text
modelos: file:../sdc-modelos
```

No se debe instalar `modelos` desde GitHub en esta carpeta.

## Enfermedades y fenologia

Cuando se crea o edita una siembra:

1. La API busca el crono/fenologia por cultivo, ciclo y departamento.
2. Guarda `idCrono` en la siembra.
3. Ejecuta el motor de prediccion de enfermedades.
4. Si la siembra ya esta dentro de una etapa fenologica que corresponde al cultivo, la prediccion queda cargada como `ultimaPrediccion`.

El detalle del lote tambien tiene una accion manual para recalcular enfermedades desde la tarjeta `Monitoreo de enfermedades`.
