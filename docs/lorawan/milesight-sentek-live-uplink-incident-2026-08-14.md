# Incidente de telemetria Milesight + Sentek - 2026-08-14

## Conclusion verificada

El Network Server recibe uplinks validos de los dos controladores, pero en los
eventos visibles recibe solo el bloque Milesight `08 db 0b`, correspondiente al
canal SDI-12 12. Ese bloque contiene las tres temperaturas finales del perfil.
No aparecen los canales 1-4 de humedad, 5-8 de salinidad, 9-11 de temperatura ni
el bloque analogico 4-20 mA.

Hay dos fallas independientes y comprobadas:

1. Los niveles actuales se pierden antes de Chaman: en cada ciclo el FCnt salta
   tres posiciones y el Network Server solo recibe la tercera trama, canal 12.
2. El decoder productivo `1.0.0` buscaba la firma analogica `05 02` en cualquier
   posicion del payload. El ACK de configuracion `fe 05 ...` del FCnt 164
   contenia esa secuencia internamente y fue confundido con telemetria. El
   decoder `1.2.0` recorre limites TLV, rechaza el ACK y no crea reportes sin
   mediciones numericas demostrables.

El decoder corregido no descarta niveles presentes y tampoco completa por
software niveles ausentes, porque eso falsearia la medicion.

La configuracion SDI-12 se considera correcta segun la confirmacion de campo.
La evidencia nueva apunta al transporte LoRaWAN: el FCnt de ambos UC501 avanza
de tres en tres y el gateway observa solo una de esas tres tramas nuevas por
ciclo. Una solicitud remota de datos confirmo el mismo patron: el UC501 genera
tres uplinks nuevos y el SG50/ChirpStack solo recibe el tercero. Los dos bloques
ausentes se pierden antes del decoder y antes de Chaman.

La causa de la perdida de las primeras dos tramas permanece del lado del enlace
UC501/gateway. La prueba propietaria demostro que el controlador aplica y
confirma una mascara enviada por downlink; el problema no es que Chaman o su
decoder omitan bloques recibidos.

## Evidencia directa del Network Server

| Controlador | DevEUI | FCnt observados | Payload recibido | Frecuencias observadas |
| --- | --- | --- | --- | --- |
| Arturo | `24E124454E358347` | 27, 30, 33 | `08db0b...` en los eventos de aplicacion | 917.8 y 917.2 MHz, entre otras del bloque 8-15 |
| Gilardoni | `24E124454E358520` | 141, 144, 147, 150, 153, 156 | `08db0b...` | 918.2, 917.0, 917.2, 918.0 y 916.8 MHz |

Ejemplos decodificados:

| Controlador | FCnt | Payload | Resultado demostrable |
| --- | ---: | --- | --- |
| Arturo | 30 | `08db0b302b31342e32333337372b31342e32323839312b31342e37323039330d0a000000000000` | canal 12; 14.23377, 14.22891 y 14.72093 C |
| Gilardoni | 150 | `08db0b302b31332e35373634332b31332e38323537342b31342e32383436310d0a000000000000` | canal 12; 13.57643, 13.82574 y 14.28461 C |

En LoRaWAN, las retransmisiones controladas por `NbTrans` conservan el mismo
FCnt. Por eso el salto estable de tres no se puede explicar como tres copias del
mismo frame: demuestra que hay dos frames nuevos no observados entre cada par
de frames recibidos.

## Prueba controlada de mascara LoRaWAN

El perfil activo de ChirpStack es `au915_1`, rotulado
`AU915 (channels 8-15 + 65) - Milesight SG50`. Milesight publica para el SG50
AU915 las ocho frecuencias 916.8 a 918.2 MHz, indices 8-15. El gateway no escucha
simultaneamente los 72 canales AU915.

Ampliar el UC501 a `8-71` no es la correccion: hace que transmita por frecuencias
fuera de las ocho entradas del gateway y aumenta la perdida.
La mascara efectiva del controlador debe quedar alineada con 8-15 (y el canal
de 500 kHz 65 que corresponde a la sub-banda). El perfil oficial
`region_au915_1.toml` de ChirpStack habilita exactamente 8-15 y 65.

ChirpStack envia despues de cada uplink un `LinkADRReq` con:

- `ChMask`: canales 8-15 habilitados y 0-7 deshabilitados.
- `ChMaskCntl`: 0.
- `DR`: 5.
- `NbTrans`: variable segun ADR (1 en Arturo; se observo 3 en Gilardoni).

Se hizo una prueba solamente sobre Gilardoni, sin tocar Arturo:

- se envio la mascara propietaria Milesight `8-71` y el equipo la confirmo con
  `fe0501ff00fe0502fffffe0503fffffe0504fffffe050500ff` (FCnt 160);
- despues de solicitar datos, los FCnt 161 y 162 no aparecieron y el 163 solo
  se recibio cuando ya estaba pendiente la restauracion;
- se restauro `8-15` y el equipo confirmo
  `fe0501ff00fe05020000fe05030000fe05040000fe05050000` (FCnt 164);
- la cola de downlinks quedo vacia y no se modificaron historicos.

La prueba descarta `8-71`: es soportado por el firmware, pero empeora la
visibilidad con el gateway configurado para la sub-banda `8-15 + 65`.

## Prueba remota no destructiva

Se encolo en Gilardoni el comando oficial Milesight `ff28ff` en FPort 85,
"Get Current Data". Este comando no cambia SDI-12, frecuencias ni historicos;
solo solicita una recoleccion con la configuracion vigente.

Resultado observado:

- ChirpStack transmitio el downlink a las 14:36:46. El mismo paquete incluyo el
  comando de aplicacion `ff28ff` y un `LinkADRReq` en `FOpts`.
- El UC501 respondio 67 segundos despues, por lo que el gateway, RX1/RX2 y el
  camino de downlink de aplicacion funcionan.
- El FCnt salto de 153 a 156: se generaron tres uplinks nuevos.
- ChirpStack recibio otra vez solamente el tercero, en 916.8 MHz, con el payload
  `08db0b302b31332e35393832372b31332e38343736392b31342e33323636360d0a000000000000`.
  Decodifica canal 12: 13.59827, 13.84769 y 14.32666 C.
- El uplink de respuesta tuvo `f_opts_len=0`: el UC501 ejecuto `ff28ff`, pero no
  devolvio `LinkADRAns` para el comando MAC que viajo en el mismo downlink.

Esta prueba elimina al decoder de Chaman como origen de los niveles ausentes y
confirma que el problema esta en la seleccion/persistencia de canales LoRaWAN
del UC501 o en su implementacion MAC/firmware.

No elimina la falla independiente del decoder productivo al interpretar ACKs;
esa falla se reproduce con el FCnt 164 y queda corregida en la version `1.2.0`.

## Interpretacion byte por byte

- `08 db`: dato SDI-12 en el protocolo Milesight UC50x v3.
- `0b`: identificador crudo zero-based; canal 12 de ToolBox.
- Los 36 bytes siguientes son texto ASCII. Ejemplo:
  `0+14.23377+14.22891+14.72093\r\n`.
- El decoder oficial Milesight recorre multiples bloques `ID + TYPE + DATA` en
  un mismo payload; el decoder de Chaman conserva esa misma estructura.
- `05 e2` o `06 e2`, solamente al inicio de un bloque TLV, identifica la entrada
  analogica y cuatro Float16 little-endian: actual, minimo, maximo y promedio.
- `fe 05 ...` es una respuesta de configuracion y no telemetria analogica.

## Caso de exito completo conservado

El barrido Gilardoni FCnt 439-441 del 25 de junio contiene los canales `0..11`
y el analogico en tres tramas consecutivas. Es el fixture de regresion del
decoder `1.2.0`:

| Magnitud | Cantidad | Valores observados |
| --- | ---: | --- |
| Humedad | 12 | 24,60010 a 39,96140 % VWC |
| Salinidad | 12 | 1281,664 a 1673,752 VIC |
| Temperatura | 12 | 9,894289 a 15,35467 C |
| Entrada analogica | 1 | 9,195 mA |
| Napa derivada | 1 | 3,247 m de columna; 2,753 m bajo terreno |

Las pruebas automatizadas exigen que esos valores se reproduzcan exactamente,
que los 12 niveles usen las profundidades configuradas del dispositivo y que
el ACK de rollback produzca cero mediciones.

## Comparacion con casos de exito y rangos racionales

| Magnitud | Caso observado correcto | Validacion aplicada | Estado vivo |
| --- | --- | --- | --- |
| Humedad VWC | 12 valores del barrido exitoso entre 24.60010 % y 39.96140 % | rango fisico 0-100 %; sin escalado inventado | no recibida |
| Temperatura | 13.57643 a 14.72093 C en los dos controladores | rango publicado -40 a 60 C; coherencia entre niveles | valida, pero solo niveles 10-12 |
| Salinidad | 1281.664-1673.752 VIC en el barrido exitoso | VIC se conserva como tendencia; no se convierte a EC sin calibracion | no recibida |
| Napa 4-20 mA | 9.195 mA => 3.247 m de columna => 2.753 m bajo terreno | `profundidad = 6 m - columna`; entrada valida entre 4 y 20 mA | bloque analogico no recibido |

La coherencia termica demuestra que los tres valores recibidos son plausibles.
No demuestra que el perfil completo ni la napa esten llegando.

## Proximas verificaciones, sin borrar produccion

1. Identificar en el proximo uplink de informacion, backup de ToolBox o visita
   tecnica la revision exacta de hardware y firmware de cada UC501.
2. Confirmar con Milesight por que faltan dos de las tres tramas y revisar la
   interaccion entre ADR, firmware UC501 y la sub-banda `8-15 + 65`.
3. Revisar en el SG50 la configuracion real de Packet Forwarder/Basic Station
   para `au915_1`.
4. Si hay acceso remoto al gateway Milesight, comparar sus ocho frecuencias con
   916.8-918.2 MHz; no ampliar el nodo a 8-71.
5. Conservar todas las tramas e historicos. Chaman completara curvas solo cuando
   lleguen mediciones reales.

## Fuentes primarias

- Milesight, UC50x Series User Guide:
  https://resource.milesight.com/milesight/iot/document/uc50x-series-user-guide-en.pdf
- Milesight, UC50x Series Communication Protocol:
  https://resource.milesight.com/milesight/iot/document/uc50x-series-communication-protocol-en.pdf
- Milesight, decoder oficial UC501:
  https://github.com/Milesight-IoT/SensorDecoders/tree/main/uc-series/uc501
- Milesight, configuracion AU915 del SG50:
  https://support.milesight-iot.com/support/solutions/articles/73000514068-how-to-change-lora-frequency-plan-in-milesight-gateway
- Milesight, firmware y release notes UC501/UC502 por revision de hardware:
  https://www.milesight.com/support/resources/firmware
- ChirpStack, perfil oficial `au915_1` (8-15 + 65):
  https://github.com/chirpstack/chirpstack/blob/master/chirpstack/configuration/region_au915_1.toml
- ChirpStack, configuracion de canales:
  https://www.chirpstack.io/docs/chirpstack/features/channel-configuration.html
- LoRa Alliance, LoRaWAN L2 1.0.4:
  https://lora-alliance.org/wp-content/uploads/2021/11/LoRaWAN-Link-Layer-Specification-v1.0.4.pdf
- LoRa Alliance, Regional Parameters RP002-1.0.3 (mascaras AU915):
  https://lora-alliance.org/wp-content/uploads/2021/05/RP-2-1.0.3.pdf
