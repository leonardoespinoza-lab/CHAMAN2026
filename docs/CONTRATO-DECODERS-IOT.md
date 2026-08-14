# Contrato de decoders IoT

## Objetivo

Chaman interpreta cada payload LoRaWAN mediante un decoder versionado por familia de controlador. El nombre
configurado en ChirpStack sirve como identidad, pero no demuestra que sensores estan conectados. Una capacidad se
habilita cuando aparece su bloque en el payload o cuando existe una configuracion administrativa explicita.

El registro actual expone `milesight-uc501-uc511` version `1.0.0` para Milesight UC501/UC511. El catalogo se consulta
en `GET /lorawan/uplinks/decoders`.

## Salida obligatoria

Todo decoder implementa `IControllerPayloadDecoder` y devuelve:

- identidad (`decoderId`, version, fabricante y modelo);
- payload hexadecimal preservado;
- lecturas crudas con servicio, variable, unidad, canal/profundidad y calidad;
- valores compatibles con los reportes de Chaman;
- canales del ciclo y capacidades efectivamente observadas.

Una lectura invalida se conserva en la evidencia cruda con el motivo, pero se publica como `null` en reportes y
graficos. No se adivinan escalas ni unidades.

## Referencias racionales del perfil Sentek

| Variable | Regla de publicacion | Comparacion necesaria |
| --- | --- | --- |
| Humedad | Rechazar negativos y valores por encima del limite fisico de `100 % VWC`; `mm/10 cm` es numericamente equivalente para una capa de 10 cm | El rango agronomico real llega hasta saturacion y depende del suelo; comparar perfil y continuidad contra una instalacion Sentek validada |
| Temperatura | `-40..60 C` | Comparar con temperatura de suelo/ambiente de referencia y continuidad entre profundidades |
| Salinidad | Conservar como indice `VIC`, nunca rotular automaticamente como conductividad | Comparar tendencias a igual humedad; convertir a ECe solo con regresion del suelo y mediciones fisicas |
| Entrada analogica | Publicar corriente solo dentro de `4..20 mA` | Derivar Napa/Presion exclusivamente con calibracion instalada (`entrada`, `salida`, unidad y referencia) |

La regla `4..20 mA` corresponde al modo instalado en Chaman. El UC50x tambien admite `0..10 V`; un equipo configurado
en ese modo necesita declarar el tipo de senal y su unidad antes de publicar o calibrar valores.

Referencias primarias:

- Sentek Drill & Drop: https://sentektechnologies.com/products/soil-data-probes/drill-drop/
- Sentek Drill & Drop Probe Brochure: https://sentektechnologies.com/wp-content/uploads/2025/09/BTS-DD-Brochure.pdf
- Sentek Sensor and Probe FAQs: https://sentektechnologies.com/products/faqs/sensor-and-probe-faqs/
- Sentek Software and Analysis FAQs: https://sentektechnologies.com/products/faqs/software-and-analysis-faqs/
- Milesight UC50x Communication Protocol: https://resource.milesight.com/milesight/iot/document/uc50x-series-communication-protocol-en.pdf
- Milesight UC50x Datasheet: https://resource.milesight.com/milesight/iot/document/uc50x-series-datasheet-en.pdf

## Alta de un nuevo controlador

1. Crear un decoder que implemente el contrato y asignarle un ID y version unicos.
2. Registrar el decoder en `controller-decoder.registry.ts`.
3. Incorporar como fixtures al menos un payload oficial, uno real exitoso anonimizado, uno parcial y uno invalido.
4. Demostrar en tests cada canal, endianness, escala, unidad, signo y valor nulo documentado por el fabricante.
5. Definir validaciones racionales por magnitud. Si no existe una referencia universal, marcar `unverified` en lugar de inventar un rango.
6. Verificar que una identidad generica del controlador no cree sensores ni servicios.
7. Reprocesar primero un dispositivo controlado y comparar curvas/CSV contra el caso exitoso antes de promover a produccion.

## Geometria del medidor de napa

La instalacion actual se registra con tres magnitudes independientes:

- cable total: `10 m`;
- tramo exterior: `4 m`;
- profundidad vertical del sensor: `10 - 4 = 6 m` bajo el terreno.

El transductor entrega columna de agua sobre su diafragma. Chaman calcula
`profundidad de napa = 6 m - columna de agua` y grafica el resultado como profundidad bajo rasante. Una disminucion de
ese valor significa que la napa subio; un aumento significa que bajo.

La longitud del cable no determina `salidaMin` ni `salidaMax`: la escala fisica del transductor debe provenir de su
ficha o calibracion. Por ejemplo, el caso de campo de `9,24 mA` solo produce `3,275 m` de columna y `2,725 m` de
profundidad si la escala verificada del equipo es `4-20 mA = 0-10 m`.

## Cambio de version

Cualquier cambio de offsets, escala, unidad, asignacion de canales o calidad incrementa la version del decoder. Las
tramas guardan decoder y version para permitir auditoria y reproceso determinista.
