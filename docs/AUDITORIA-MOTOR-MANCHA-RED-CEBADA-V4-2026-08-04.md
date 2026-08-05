# Motor predictivo de Mancha en Red de cebada v4

Fecha de auditoria: 2026-08-04
Estado: candidato para Railway testing; no publicado en produccion.

## Decision agronomica

El valor anterior podia llegar a 100 porque acumulaba indefinidamente una
tasa diaria y nunca retiraba clima viejo. Ese numero no diferenciaba entre
presion ambiental reciente, infeccion probable y severidad observada.

La version 4 calcula **presion ambiental predictiva de infeccion** dentro de un
ciclo epidemiologico reciente. Un valor 100 representa el extremo de la escala
ambiental y varietal del modelo; no significa 100% de probabilidad de enfermedad
ni 100% de incidencia o severidad. La infeccion depende ademas de inoculo y la
confirmacion exige recorrida y sintomas.

La validacion con el lote real ANDREIA detecto y corrigio una segunda fuente de
inflacion: las noches humedas consecutivas no pueden tratarse como ensayos
independientes y multiplicarse hasta saturar cerca de 100. La agregacion v2
resume los 14 dias como un solo ciclo potencial.

## Evidencia utilizada

- Shaw MW (1986), *Effects of temperature and leaf wetness on Pyrenophora
  teres growing on barley cv. Sonja*, Plant Pathology 35:294-309.
  [DOI 10.1111/j.1365-3059.1986.tb02018.x](https://doi.org/10.1111/j.1365-3059.1986.tb02018.x).
  El anclaje cuantitativo usado por Chaman es aproximadamente 40% de las
  infecciones finales establecidas a 100 grados-hora despues del mojado.
- Petta y Lavilla (2023), estudio de temperatura y mojado foliar para mancha en
  red de cebada. [DOI 10.15517/am.v34i1.51028](https://doi.org/10.15517/am.v34i1.51028).
  Se usa como referencia regional el rango favorable de 15 a 25 C y mojados
  prolongados.
- INTA Marcos Juarez 2024 para el perfil sanitario varietal de ANDREIA y otras
  variedades. [Evaluacion sanitaria de cebada](https://www.argentina.gob.ar/sites/default/files/2025/03/inta_crcordoba_eeamarcosjuarez_donaire_g_evaluacion_cebc.pdf).
- AHDB, ciclo y manejo de Mancha en Red: el ciclo puede completarse en unos 14
  dias bajo condiciones favorables y el riesgo depende tambien de residuos,
  semilla, variedad y manejo. [Net blotch symptoms and management](https://ahdb.org.uk/knowledge-library/net-blotch-symptoms-and-management-in-barley).
- INTA Pergamino recomienda diagnostico e incidencia observada a campo antes de
  decidir manejo. [Trigo y cebada: enfermedades foliares](https://intainforma.inta.gob.ar/trigo-y-cebada-que-hacer-frente-a-las-enfermedades-foliares/).

## Entradas canonicas

El motor sanitario no consulta una fuente climatica paralela. Consume la serie
agrometeorologica normalizada de la siembra, cuya prioridad es:

1. sensor de campo asociado y disponible;
2. estacion meteorologica asociada;
3. Open-Meteo para completar la serie cuando no hay una fuente de campo valida.

Por cada dia se utilizan:

- horas totales de mojado foliar estimado;
- maximo de horas continuas de mojado;
- temperatura media durante el mojado;
- cobertura y banderas de calidad horaria;
- etapa fenologica canonica;
- multiplicador de susceptibilidad varietal trazable.

## Ecuacion versionada

Para cada episodio diario:

```text
gradosHora = horasMojadoContinuo * (temperaturaMojado - 2)
fraccionEstablecida = 1 - exp(ln(0,6) * gradosHora / 100)
riesgoEvento = 100 * fraccionEstablecida * factorTermico * factorVarietal
```

Reglas:

- menos de 3 horas continuas, temperatura menor o igual a 2 C o mayor o igual
  a 30 C: episodio no compatible;
- de 2 a 25 C la temperatura queda representada en grados-hora;
- de 25 a 30 C se aplica una penalizacion lineal hasta cero;
- el perfil varietal se limita al intervalo 0,05-1,20;
- la ventana de 14 dias se interpreta como un solo ciclo epidemiologico
  potencial; los dias no se multiplican como probabilidades independientes;
- la agregacion v2 pondera intensidad maxima (55%), intensidad media (25%),
  persistencia de dias favorables (15%) y recencia (5%);
- intensidad, persistencia y recencia conservan el multiplicador varietal;
- cada componente y la version de agregacion quedan guardados para auditoria.

La ventana de 14 dias es un supuesto operacional versionado para representar
presion reciente dentro del rango de latencia publicado. Debe recalibrarse con
registros de campo argentinos si la validacion demuestra otra persistencia.

## Compuertas de calidad y alerta

- Se exige al menos 75% de dias con evidencia horaria valida en la ventana.
- Los dias secos con cero horas de mojado cuentan como observaciones horarias
  validas; no se confunden con datos faltantes.
- Una aproximacion diaria se muestra como seguimiento provisional, se limita a
  49,9 y no puede emitir alertas automaticas.
- La fenologia proyectada permite screening, pero deja la salida provisional.
- La tarjeta muestra seguimiento desde 35/100.
- La alerta automatica exige 70/100, cobertura horaria minima, al menos un dia
  favorable, fenologia operativa y calidad suficiente.
- Una alerta viva se cierra por debajo de 70 con datos suficientes o al cerrar
  la ventana fenologica.

## Presentacion y auditoria

- Tarjeta: `Indice ambiental de infeccion`, no probabilidad, incidencia ni
  `severidad`.
- Detalle: dias favorables dentro del ciclo, intensidad maxima y media,
  persistencia, recencia, cobertura, horas continuas, temperatura durante
  mojado, grados-hora y perfil varietal.
- Informe PDF: conserva la escala sobre 100, documenta la evidencia y exige
  recorrida para confirmar sintomas.
- Las funciones del motor v3 permanecen disponibles para reproducibilidad de
  pruebas historicas, pero la ruta activa de Mancha en Red usa version 4.

## Verificacion automatizada

- referencia de 100 grados-hora = aproximadamente 40 para perfil susceptible;
- monotonicidad: un perfil resistente no supera a uno susceptible;
- un episodio fuera de la ventana de 14 dias deja de contribuir;
- dias secos horarios no degradan artificialmente la cobertura;
- 14 noches favorables no saturan el indice por repeticion matematica;
- 69,9 no alerta; 70 alerta solo con cobertura, calidad, fenologia y evidencia
  validas;
- salida provisional o cobertura insuficiente nunca alerta;
- tarjeta, backend e informe compilan con el contrato nuevo.
