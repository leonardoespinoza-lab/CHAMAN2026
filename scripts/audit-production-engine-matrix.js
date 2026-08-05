#!/usr/bin/env node

/**
 * Auditoria integral, estrictamente de solo lectura, de los motores activos en
 * produccion. No llama endpoints de recalculo ni modifica documentos.
 */

const { MongoClient } = require('../sdc-datos/node_modules/mongodb');
const {
  ENFERMEDADES_CANONICAS,
  evaluarSanidadAgregada,
} = require('../sdc-modelos/dist');

const DB_NAME = 'chaman';
const AGROMET_VERSION = 'agromet-1.5.0';
const WHEAT_VERSION = 5;
const PEA_VERSION = 2;
const PERENNIAL_CROPS = new Set(['Pecan', 'Manzano', 'Peral', 'Vid']);
const DEFINITIONS_BY_CROP = ENFERMEDADES_CANONICAS.reduce((acc, item) => {
  (acc[item.cultivo] ||= []).push(item);
  return acc;
}, {});
// Una matriz ejecutable incluye formulas operativas y screenings
// experimentales. Las enfermedades catalogadas sin modelo se informan como
// brecha cientifica, pero no se exigen como predicciones inventadas.
const EXPECTED_DISEASES = Object.fromEntries(
  Object.entries(DEFINITIONS_BY_CROP).map(([crop, items]) => [
    crop,
    new Set(items.filter((item) => item.motor !== 'sin_modelo').map((item) => item.id)),
  ]),
);
const DEFINITION_BY_ID = new Map(
  ENFERMEDADES_CANONICAS.map((item) => [item.id, item]),
);

const id = (value) => (value == null ? '' : String(value));
const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};
const day = (value) => (value ? String(value).slice(0, 10) : undefined);
const iso = (value) => {
  const date = value ? new Date(value) : undefined;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};
const daysOld = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time)
    ? Math.floor((Date.now() - time) / 86_400_000)
    : undefined;
};
const isMonotonic = (rows, getter) => {
  let previous;
  for (const row of rows) {
    const current = finite(getter(row));
    if (current === undefined) continue;
    if (previous !== undefined && current + 0.001 < previous) return false;
    previous = current;
  }
  return true;
};
const maxFinite = (values) => {
  const numbers = values.map(finite).filter((value) => value !== undefined);
  return numbers.length ? Math.max(...numbers) : undefined;
};

function severityPush(findings, severity, code, row, details) {
  findings.push({
    severity,
    code,
    idLote: row?.idLote,
    lote: row?.lote,
    cultivo: row?.cultivo,
    cliente: row?.cliente,
    ...details,
  });
}

async function latestBy(collection, match, key, dateField) {
  return collection
    .aggregate([
      { $match: match },
      { $sort: { [dateField]: -1, _id: -1 } },
      { $group: { _id: `$${key}`, document: { $first: '$$ROOT' } } },
    ])
    .toArray();
}

async function collectionExists(db, name) {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
}

async function main() {
  const url =
    process.env.MONGO_PUBLIC_URL || process.env.MONGO_URL || process.env.MONGO_URI;
  if (!url) throw new Error('Falta la URL de MongoDB.');
  if (
    String(process.env.RAILWAY_ENVIRONMENT_NAME || '').toLowerCase() !== 'production'
  ) {
    throw new Error('Auditoria rechazada: requiere el entorno Railway production.');
  }

  const client = new MongoClient(url, { serverSelectionTimeoutMS: 20_000 });
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    if (db.databaseName !== DB_NAME) throw new Error('Base productiva inesperada.');

    const lots = await db
      .collection('lotes')
      .find({ idSiembra: { $exists: true, $ne: null } })
      .toArray();
    const sowingIds = lots.map((lot) => lot.idSiembra);
    const lotIds = lots.map((lot) => lot._id);
    const sowings = await db
      .collection('siembras')
      .find({ _id: { $in: sowingIds } })
      .toArray();
    const seeds = await db
      .collection('semillas')
      .find({ _id: { $in: sowings.map((item) => item.idSemilla) } })
      .toArray();
    const establishments = await db
      .collection('establecimientos')
      .find({ _id: { $in: lots.map((lot) => lot.idEstablecimiento).filter(Boolean) } })
      .toArray();
    const producerCollection = (await collectionExists(db, 'productors'))
      ? 'productors'
      : 'productores';
    const producers = await db
      .collection(producerCollection)
      .find({ _id: { $in: lots.map((lot) => lot.idProductor).filter(Boolean) } })
      .toArray();
    const devices = await db
      .collection('dispositivos')
      .find({ idLote: { $in: lotIds } })
      .toArray();

    const manifests = await db
      .collection('indicadores_agrometeorologicos_generaciones')
      .find({ idSiembra: { $in: sowingIds }, versionCalculo: AGROMET_VERSION })
      .toArray();
    const generationPairs = manifests
      .filter((item) => item.generacionActiva && item.generacionActiva !== 'legacy')
      .map((item) => ({
        idSiembra: item.idSiembra,
        versionCalculo: AGROMET_VERSION,
        generacionCalculo: item.generacionActiva,
      }));
    const currentAgromet = generationPairs.length
      ? await db
          .collection('indicadores_agrometeorologicos_generados')
          .find({ $or: generationPairs })
          .sort({ fecha: 1 })
          .toArray()
      : [];

    const [latestPredictions, latestIrrigation, latestNdvi] = await Promise.all([
      latestBy(
        db.collection('prediccions'),
        { idSiembra: { $in: sowingIds } },
        'idSiembra',
        'fecha',
      ),
      latestBy(
        db.collection('prediccionriegos'),
        { idSiembra: { $in: sowingIds } },
        'idSiembra',
        'fechaPrediccion',
      ),
      latestBy(
        db.collection('reportendvis'),
        { idLote: { $in: lotIds } },
        'idLote',
        'fechaDeLaImagen',
      ),
    ]);

    const byId = (items) => new Map(items.map((item) => [id(item._id), item]));
    const sowingById = byId(sowings);
    const seedById = byId(seeds);
    const establishmentById = byId(establishments);
    const producerById = byId(producers);
    const manifestBySowing = new Map(manifests.map((item) => [id(item.idSiembra), item]));
    const predictionBySowing = new Map(
      latestPredictions.map((item) => [id(item._id), item.document]),
    );
    const irrigationBySowing = new Map(
      latestIrrigation.map((item) => [id(item._id), item.document]),
    );
    const ndviByLot = new Map(latestNdvi.map((item) => [id(item._id), item.document]));
    const devicesByLot = new Map();
    for (const device of devices) {
      const key = id(device.idLote);
      if (!devicesByLot.has(key)) devicesByLot.set(key, []);
      devicesByLot.get(key).push(device);
    }
    const agrometBySowing = new Map();
    for (const indicator of currentAgromet) {
      const key = id(indicator.idSiembra);
      if (!agrometBySowing.has(key)) agrometBySowing.set(key, []);
      agrometBySowing.get(key).push(indicator);
    }

    const rows = lots.map((lot) => {
      const sowing = sowingById.get(id(lot.idSiembra));
      const seed = sowing && seedById.get(id(sowing.idSemilla));
      const crop = seed?.cultivo || 'SIN_SEMILLA';
      const prediction = predictionBySowing.get(id(sowing?._id));
      const diseases = Array.isArray(prediction?.enfermedades)
        ? prediction.enfermedades
        : [];
      const agromet = (agrometBySowing.get(id(sowing?._id)) || []).sort((a, b) =>
        String(a.fecha).localeCompare(String(b.fecha)),
      );
      const observed = agromet.filter((item) => !item.esPronostico);
      const forecast = agromet.filter((item) => item.esPronostico);
      const latestObserved = observed.at(-1);
      const latestForecast = forecast.at(-1);
      const lotDevices = devicesByLot.get(id(lot._id)) || [];
      const temperatureDevices = lotDevices.filter((device) => {
        const sensors = (device.sensores || []).map((sensor) =>
          String(sensor).toLowerCase(),
        );
        const type = String(device.tipo || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        return (
          type.includes('estacion meteorologica') &&
          sensors.some((sensor) => sensor.includes('temperatura'))
        );
      });
      const maxFieldCoverage = maxFinite(agromet.map((item) => item.coberturaCampoPct));
      const sensorNames = Array.from(
        new Set(agromet.flatMap((item) => item.nombresSensoresTemperaturaCampo || [])),
      );
      const latestCold = [...observed]
        .reverse()
        .find(
          (item) =>
            finite(item.metricas?.chillingHoursAccumulated) !== undefined ||
            finite(item.metricas?.chillPortionsAccumulated) !== undefined,
        );
      const producer = producerById.get(id(lot.idProductor));
      const establishment = establishmentById.get(id(lot.idEstablecimiento));
      const expected = EXPECTED_DISEASES[crop];
      const definitions = DEFINITIONS_BY_CROP[crop] || [];
      const diseaseIds = new Set(diseases.map((item) => item.idEnfermedad).filter(Boolean));
      const versions = Array.from(
        new Set(diseases.map((item) => Number(item.modelo?.version)).filter(Number.isFinite)),
      );
      const diseaseRangeOk = diseases.every((item) => {
        const value = finite(item.resultado);
        return value === undefined || (value >= 0 && value <= 100);
      });
      const irrigation = irrigationBySowing.get(id(sowing?._id));
      const ndvi = ndviByLot.get(id(lot._id));
      const sanitaryEvaluation = evaluarSanidadAgregada(
        diseases,
        crop,
        iso(prediction?.fecha),
      );
      const saturated = diseases
        .filter((item) => finite(item.resultado) !== undefined && finite(item.resultado) >= 99.5)
        .map((item) => ({
          id: item.idEnfermedad,
          resultado: finite(item.resultado),
          version: finite(item.modelo?.version),
          validacion: item.modelo?.validacion,
          estado: item.estado,
        }));
      return {
        idLote: id(lot._id),
        lote: lot.nombre || 'Lote sin nombre',
        idSiembra: id(sowing?._id),
        cliente: producer?.nombre || producer?.razonSocial || id(lot.idProductor),
        establecimiento: establishment?.nombre || id(lot.idEstablecimiento),
        cultivo: crop,
        variedad: seed?.variedad,
        fechaSiembra: day(sowing?.fechaSiembra),
        integridad: {
          siembra: Boolean(sowing),
          semilla: Boolean(seed),
          crono: Boolean(sowing?.idCrono),
          tenantConsistente: Boolean(
            sowing &&
              ['idQuimica', 'idDistribuidor', 'idProductor', 'idEstablecimiento'].every(
                (field) => !lot[field] || !sowing[field] || id(lot[field]) === id(sowing[field]),
              ),
          ),
        },
        sanidad: {
          aplica: Boolean(expected?.size),
          cantidad: diseases.length,
          matrizCompleta:
            !expected?.size ||
            [...expected].every((diseaseId) => diseaseIds.has(diseaseId)),
          esperadasEjecutables: expected?.size || 0,
          catalogo: {
            total: definitions.length,
            operativas: definitions.filter((item) => item.motor === 'operativo').length,
            experimentales: definitions.filter((item) => item.motor === 'experimental').length,
            sinModelo: definitions.filter((item) => item.motor === 'sin_modelo').length,
          },
          versiones: versions,
          fecha: day(prediction?.fecha),
          rangoResultadosValido: diseaseRangeOk,
          semaforoCanonico: sanitaryEvaluation.semaforo,
          lecturasOperativas: sanitaryEvaluation.operativas.length,
          alertables: sanitaryEvaluation.alertables.length,
          alertableIds: sanitaryEvaluation.alertables.map((item) => item.idEnfermedad),
          maximoOperativo: sanitaryEvaluation.maximo,
          saturadas: saturated,
          validaciones: diseases.reduce((acc, item) => {
            const key = item.modelo?.validacion || 'sin_validacion';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          modelos: diseases.map((item) => ({
            id: item.idEnfermedad,
            resultado: finite(item.resultado),
            estado: item.estado,
            version: finite(item.modelo?.version),
            validacion: item.modelo?.validacion,
            motorCatalogo: DEFINITION_BY_ID.get(item.idEnfermedad)?.motor,
          })),
          estados: diseases.reduce((acc, item) => {
            const key = item.estado || 'sin_estado';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
        },
        agromet: {
          manifiesto: Boolean(manifestBySowing.get(id(sowing?._id))),
          filas: agromet.length,
          observadas: observed.length,
          pronostico: forecast.length,
          ultimaObservada: day(latestObserved?.fecha),
          antiguedadDias: daysOld(latestObserved?.fecha),
          ultimaPronosticada: day(latestForecast?.fecha),
          version: latestObserved?.versionCalculo,
          fuente: latestObserved?.fuente,
          fuentePorVariable: latestObserved?.fuentePorVariable,
          completitudPct: finite(latestObserved?.completitudPct),
          gdd: finite(latestObserved?.metricas?.gddAccumulated),
          gddMonotono: isMonotonic(observed, (item) => item.metricas?.gddAccumulated),
        },
        frio: {
          aplica: PERENNIAL_CROPS.has(crop),
          inicioTemporada: latestCold?.inicioVentanaFrio,
          fechaCierre: day(latestCold?.fecha),
          hf: finite(latestCold?.metricas?.chillingHoursAccumulated),
          cp: finite(latestCold?.metricas?.chillPortionsAccumulated),
          hfMonotono: isMonotonic(observed, (item) => item.metricas?.chillingHoursAccumulated),
          cpMonotono: isMonotonic(observed, (item) => item.metricas?.chillPortionsAccumulated),
          dispositivos: temperatureDevices.map(
            (item) => item.nombre || item.deveui || id(item._id),
          ),
          coberturaCampoMaxPct: maxFieldCoverage,
          sensoresCampo: sensorNames,
        },
        fenologia: {
          etapa: latestObserved?.etapaFenologica,
          fuente: latestObserved?.fuenteEtapaFenologica,
          confianza: latestObserved?.confianzaEtapaFenologica,
          registrosCampo: Array.isArray(sowing?.registrosFenologicos)
            ? sowing.registrosFenologicos.length
            : 0,
        },
        riego: {
          disponible: Boolean(irrigation),
          fecha: day(irrigation?.fechaPrediccion),
          antiguedadDias: daysOld(irrigation?.fechaPrediccion),
        },
        satelite: {
          disponible: Boolean(ndvi),
          fecha: day(ndvi?.fechaDeLaImagen),
          antiguedadDias: daysOld(ndvi?.fechaDeLaImagen),
          ndvi: finite(ndvi?.ndviPromedio ?? ndvi?.ndvi),
        },
      };
    });

    const findings = [];
    for (const row of rows) {
      if (!row.integridad.siembra || !row.integridad.semilla || !row.integridad.tenantConsistente) {
        severityPush(findings, 'critical', 'integridad_lote_siembra', row, {
          estado: row.integridad,
        });
      }
      if (!row.integridad.crono && !row.fenologia.etapa) {
        severityPush(findings, 'high', 'siembra_sin_cronograma', row);
      }
      if (!row.agromet.manifiesto || !row.agromet.observadas) {
        severityPush(findings, 'critical', 'serie_agrometeorologica_ausente', row);
      } else {
        if (row.agromet.version !== AGROMET_VERSION) {
          severityPush(findings, 'critical', 'version_agromet_obsoleta', row, {
            version: row.agromet.version,
          });
        }
        if (
          !row.agromet.gddMonotono ||
          (!row.frio.aplica &&
            (row.agromet.gdd === undefined || row.agromet.gdd < 0)) ||
          (row.frio.aplica && row.agromet.gdd !== undefined && row.agromet.gdd < 0)
        ) {
          severityPush(findings, 'critical', 'gdd_inconsistente', row, {
            gdd: row.agromet.gdd,
            monotono: row.agromet.gddMonotono,
          });
        }
        if ((row.agromet.antiguedadDias ?? 99) > 2) {
          severityPush(findings, 'high', 'serie_agromet_desactualizada', row, {
            ultimaObservada: row.agromet.ultimaObservada,
          });
        }
        if ((row.agromet.completitudPct ?? 0) < 80) {
          severityPush(findings, 'high', 'completitud_meteorologica_baja', row, {
            completitudPct: row.agromet.completitudPct,
          });
        }
      }
      if (row.sanidad.aplica) {
        if (!row.sanidad.matrizCompleta || !row.sanidad.cantidad) {
          severityPush(findings, 'critical', 'matriz_sanitaria_incompleta', row, {
            cantidad: row.sanidad.cantidad,
          });
        }
        if (!row.sanidad.rangoResultadosValido) {
          severityPush(findings, 'critical', 'resultado_sanitario_fuera_de_rango', row);
        }
        if (row.cultivo === 'Trigo' && !row.sanidad.versiones.every((item) => item === WHEAT_VERSION)) {
          severityPush(findings, 'critical', 'trigo_no_v5', row, {
            versiones: row.sanidad.versiones,
          });
        }
        if (row.cultivo === 'Arveja' && !row.sanidad.versiones.every((item) => item === PEA_VERSION)) {
          severityPush(findings, 'high', 'arveja_version_obsoleta', row, {
            versiones: row.sanidad.versiones,
          });
        }
      }
      for (const model of row.sanidad.modelos) {
        if (model.estado === 'calculado' && !model.validacion) {
          severityPush(findings, 'high', 'modelo_sanitario_sin_validacion_explicita', row, {
            enfermedad: model.id,
            version: model.version,
          });
        }
        if (model.motorCatalogo === 'sin_modelo' && model.estado === 'calculado') {
          severityPush(findings, 'critical', 'calculo_sanitario_sin_modelo_canonico', row, {
            enfermedad: model.id,
            version: model.version,
          });
        }
      }
      for (const saturated of row.sanidad.saturadas) {
        const alertable = row.sanidad.alertableIds.includes(saturated.id);
        severityPush(
          findings,
          alertable ? 'high' : 'medium',
          alertable
            ? 'indice_sanitario_operativo_saturado'
            : 'screening_sanitario_saturado_no_alertable',
          row,
          { enfermedad: saturated.id, ...saturated },
        );
      }
      if (row.sanidad.semaforoCanonico === 'rojo' && row.sanidad.alertables === 0) {
        severityPush(findings, 'critical', 'semaforo_rojo_sin_contrato_alertable', row);
      }
      if (row.frio.aplica) {
        if (row.frio.hf === undefined || row.frio.cp === undefined || !row.frio.inicioTemporada) {
          severityPush(findings, 'critical', 'frio_perenne_incompleto', row, {
            hf: row.frio.hf,
            cp: row.frio.cp,
            inicioTemporada: row.frio.inicioTemporada,
          });
        }
        if (!row.frio.hfMonotono || !row.frio.cpMonotono) {
          severityPush(findings, 'critical', 'acumulacion_frio_no_monotona', row, {
            hfMonotono: row.frio.hfMonotono,
            cpMonotono: row.frio.cpMonotono,
          });
        }
        if (row.frio.dispositivos.length && !(row.frio.coberturaCampoMaxPct > 0)) {
          severityPush(findings, 'high', 'sensor_lora_sin_aporte_canonico', row, {
            dispositivos: row.frio.dispositivos,
          });
        }
      }
    }

    const duplicatePredictions = await db
      .collection('prediccions')
      .aggregate([
        { $match: { idSiembra: { $in: sowingIds } } },
        { $group: { _id: { idSiembra: '$idSiembra', fecha: '$fecha' }, total: { $sum: 1 } } },
        { $match: { total: { $gt: 1 } } },
        { $count: 'total' },
      ])
      .next();

    const byClient = {};
    const byCrop = {};
    for (const row of rows) {
      byClient[row.cliente] = (byClient[row.cliente] || 0) + 1;
      const crop = (byCrop[row.cultivo] ||= {
        lotes: 0,
        sanidadCompleta: 0,
        sanidadOperativa: 0,
        alertasCanonicas: 0,
        screeningsProvisionales: 0,
        indicesSaturados: 0,
        agrometActual: 0,
        frioCompleto: 0,
        riegoDisponible: 0,
        sateliteDisponible: 0,
        fuentesAgromet: {},
      });
      crop.lotes += 1;
      if (!row.sanidad.aplica || row.sanidad.matrizCompleta) crop.sanidadCompleta += 1;
      if (row.sanidad.lecturasOperativas > 0) crop.sanidadOperativa += 1;
      crop.alertasCanonicas += row.sanidad.alertables;
      crop.screeningsProvisionales +=
        row.sanidad.validaciones.operativo_provisional || 0;
      crop.indicesSaturados += row.sanidad.saturadas.length;
      if ((row.agromet.antiguedadDias ?? 99) <= 2 && row.agromet.version === AGROMET_VERSION) {
        crop.agrometActual += 1;
      }
      if (!row.frio.aplica || (row.frio.hf !== undefined && row.frio.cp !== undefined)) {
        crop.frioCompleto += 1;
      }
      if (row.riego.disponible) crop.riegoDisponible += 1;
      if (row.satelite.disponible) crop.sateliteDisponible += 1;
      const weatherSource = row.agromet.fuente || 'sin_fuente';
      crop.fuentesAgromet[weatherSource] =
        (crop.fuentesAgromet[weatherSource] || 0) + 1;
    }

    const severityCounts = findings.reduce((acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    }, {});
    const summaryOnly = process.argv.includes('--summary');
    const result = {
      generatedAt: new Date().toISOString(),
      database: DB_NAME,
      readOnly: true,
      summary: {
        activeLots: rows.length,
        activeSowings: sowings.length,
        currentAgrometGenerations: manifests.length,
        devicesAssigned: devices.length,
        duplicatePredictionKeys: duplicatePredictions?.total || 0,
        findings: severityCounts,
      },
      byClient,
      byCrop,
      sanitaryCatalog: Object.fromEntries(
        Object.entries(DEFINITIONS_BY_CROP).map(([crop, items]) => [
          crop,
          {
            total: items.length,
            operativos: items.filter((item) => item.motor === 'operativo').length,
            experimentales: items.filter((item) => item.motor === 'experimental').length,
            sinModelo: items.filter((item) => item.motor === 'sin_modelo').length,
          },
        ]),
      ),
      fieldSensorCoverage: rows
        .filter(
          (row) =>
            row.frio.dispositivos.length ||
            (row.frio.coberturaCampoMaxPct || 0) > 0 ||
            row.frio.sensoresCampo.length,
        )
        .map((row) => ({
          idLote: row.idLote,
          lote: row.lote,
          cliente: row.cliente,
          cultivo: row.cultivo,
          dispositivos: row.frio.dispositivos,
          coberturaCampoMaxPct: row.frio.coberturaCampoMaxPct,
          sensoresCampo: row.frio.sensoresCampo,
          fuenteDiariaActual: row.agromet.fuente,
          fuentePorVariableActual: row.agromet.fuentePorVariable,
        })),
      findings,
      ...(!summaryOnly ? { rows } : {}),
    };
    console.log(JSON.stringify(result, null, 2));
    if (process.argv.includes('--strict') && (severityCounts.critical || severityCounts.high)) {
      process.exitCode = 2;
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
