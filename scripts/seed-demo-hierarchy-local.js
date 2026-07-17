const path = require('path');

const { MongoClient, ObjectId } = require(path.join(
  __dirname,
  '..',
  'sdc-datos',
  'node_modules',
  'mongodb',
));
const bcrypt = require(path.join(
  __dirname,
  '..',
  'sdc-auth',
  'node_modules',
  'bcrypt',
));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chaman';
const PASSWORD = process.env.DEMO_PASSWORD;
const PREFIX = 'Demo CHAMAN 2026';
const TODAY = new Date('2026-06-10T12:00:00-03:00');

if (!PASSWORD || PASSWORD.length < 12) {
  throw new Error(
    'DEMO_PASSWORD es obligatoria y debe tener al menos 12 caracteres.',
  );
}

function isoDate(daysOffset = 0) {
  const date = new Date(TODAY);
  date.setDate(date.getDate() + daysOffset);
  return date;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function point(lng, lat) {
  return { type: 'Point', coordinates: [lng, lat] };
}

function squarePolygon(lat, lng, size = 0.012) {
  const coords = [
    [lng - size, lat - size],
    [lng + size, lat - size],
    [lng + size, lat + size],
    [lng - size, lat + size],
    [lng - size, lat - size],
  ];
  return {
    poligono: coords.map(([lngValue, latValue]) => ({ lat: latValue, lng: lngValue })),
    geojson: { type: 'Polygon', coordinates: [coords] },
    centro: { lat, lng },
    superficie: Math.round((size * 2100) ** 2) / 100,
  };
}

function makeClimate(lat, lng, index) {
  const pronosticos = Array.from({ length: 7 }, (_, day) => {
    const fecha = isoDate(day);
    const lluvia = Math.max(0, Number((day % 3 === 1 ? 4.8 + index * 0.2 : day === 4 ? 1.6 : 0.3).toFixed(1)));
    const tempAvg = Number((13.5 + day * 0.6 + (index % 5) * 0.25).toFixed(1));
    const humedadAvg = Math.min(98, 73 + ((index + day) % 6) * 4);
    return {
      fecha: fecha.toISOString(),
      fuente: 'Open-Meteo',
      ubicacion: { lat, lng },
      temperatura: {
        min: Number((tempAvg - 4.3).toFixed(1)),
        avg: tempAvg,
        max: Number((tempAvg + 5.1).toFixed(1)),
      },
      humedad: {
        min: Math.max(45, humedadAvg - 18),
        avg: humedadAvg,
        max: Math.min(99, humedadAvg + 14),
      },
      velocidadViento: {
        avg: Number((9 + day * 0.8 + (index % 4)).toFixed(1)),
        max: Number((17 + day * 1.2 + (index % 5)).toFixed(1)),
      },
      lluvia,
      probabilidadLluvia: Math.min(96, Math.round(35 + lluvia * 10 + day * 3)),
      et0: Number((2.1 + day * 0.18 + (index % 3) * 0.12).toFixed(2)),
      nubosidad: Math.min(98, 45 + day * 7),
    };
  });

  return {
    prediccionClimatica: {
      fecha: TODAY.toISOString(),
      pronosticos,
    },
    climaActual: {
      fecha: TODAY.toISOString(),
      clima: {
        fecha: TODAY.toISOString(),
        fuente: 'Open-Meteo',
        temperatura: pronosticos[0].temperatura.avg,
        humedad: pronosticos[0].humedad.avg,
        velocidadViento: pronosticos[0].velocidadViento.avg,
        lluvia: pronosticos[0].lluvia,
        ubicacion: { lat, lng },
      },
    },
  };
}

function diseasePrediction(seed, index, siembraId, tenantIds) {
  const base = {
    'Mancha Amarilla': 13 + (index % 5) * 2.1,
    'Roya de la Hoja': 9 + (index % 7) * 2.4,
    'Mancha de la Hoja': 7 + (index % 4) * 1.8,
    'Fusarium de la Espiga': 6 + (index % 6) * 3.2,
  };

  const enfermedades = Object.entries(base).map(([enfermedad, valor]) => {
    const resistencia = seed.resistencia?.find((item) => item.enfermedad === enfermedad);
    const multiplicador = resistencia?.multiplicador ?? 1;
    const resultado = Number(Math.min(28, Math.max(4, valor * multiplicador)).toFixed(1));
    return {
      enfermedad,
      resultado,
      variables: {
        DPr: Number((1 + (index % 3) * 0.7).toFixed(1)),
        DPrHRT: Number((2.5 + resultado / 6).toFixed(1)),
        DHR: Number((7 + (index % 5)).toFixed(1)),
        PMoj: Number((resultado / 2.8).toFixed(1)),
      },
    };
  });

  return {
    fecha: TODAY,
    fechaPrediccion: TODAY.toISOString().slice(0, 10),
    etapa: (index % 6) + 1,
    nombreEtapa: ['Emergencia', 'Espiguilla Terminal', 'Hoja Bandera', 'Espigazon', 'Antesis', 'Llenado de Granos'][
      index % 6
    ],
    idSiembra: siembraId,
    enfermedades,
    estacion: {
      fuente: 'Open-Meteo',
      nombre: 'Fallback climatico local',
      distanciaKm: Number((3.5 + index * 0.4).toFixed(1)),
    },
    ...tenantIds,
  };
}

function irrigationRecommendations(index) {
  return Array.from({ length: 6 }, (_, day) => ({
    fecha: isoDate(day).toISOString(),
    cantidad: Number((day === 1 || day === 4 ? 5 + (index % 5) * 1.2 : 0).toFixed(1)),
    observacion:
      day === 1 || day === 4
        ? 'Reponer agua util por ET0 acumulada y bajo aporte de lluvia.'
        : 'Sin riego recomendado para este dia.',
  }));
}

function waterFootprint(index) {
  const verde = 620 + index * 11;
  const azul = 120 + (index % 5) * 18;
  const gris = 80 + (index % 4) * 16;
  const total = verde + azul + gris;
  return {
    verde: { litrosKg: verde, litrosKcal: Number((verde / 3.4).toFixed(1)) },
    azul: { litrosKg: azul, litrosKcal: Number((azul / 3.4).toFixed(1)) },
    gris: { litrosKg: gris, litrosKcal: Number((gris / 3.4).toFixed(1)) },
    total: { litrosKg: total, litrosKcal: Number((total / 3.4).toFixed(1)) },
  };
}

function ndviSvg(value, index) {
  const pct = Math.round(value * 100);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240">
    <defs>
      <linearGradient id="g${index}" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#e4f5b8"/>
        <stop offset="0.55" stop-color="#8bcf63"/>
        <stop offset="1" stop-color="#258b47"/>
      </linearGradient>
    </defs>
    <rect width="360" height="240" rx="18" fill="url(#g${index})"/>
    <path d="M0 ${140 - index} C70 110,120 180,190 135 S300 95,360 ${128 + index}" fill="none" stroke="#f5ffe6" stroke-width="22" opacity=".42"/>
    <path d="M0 ${172 - index} C60 145,130 200,210 160 S300 130,360 ${150 + index}" fill="none" stroke="#2f8d42" stroke-width="28" opacity=".38"/>
    <text x="26" y="45" font-family="Arial" font-size="18" fill="#173b2b">NDVI local</text>
    <text x="26" y="80" font-family="Arial" font-size="32" fill="#173b2b" font-weight="700">${value.toFixed(2)}</text>
    <text x="26" y="212" font-family="Arial" font-size="14" fill="#173b2b">${pct}% vigor relativo</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function deletePreviousDemo(db) {
  const prefixRegex = new RegExp(`^${escapeRegExp(PREFIX)}`);

  const quimicaIds = (await db.collection('quimicas').find({ nombre: prefixRegex }).project({ _id: 1 }).toArray()).map(
    (item) => item._id,
  );
  const distribuidorIds = (
    await db.collection('distribuidors').find({ nombre: prefixRegex }).project({ _id: 1 }).toArray()
  ).map((item) => item._id);
  const productorIds = (
    await db.collection('productors').find({ nombre: prefixRegex }).project({ _id: 1 }).toArray()
  ).map((item) => item._id);
  const establecimientoIds = (
    await db.collection('establecimientos').find({ nombre: prefixRegex }).project({ _id: 1 }).toArray()
  ).map((item) => item._id);
  const loteIds = (await db.collection('lotes').find({ nombre: prefixRegex }).project({ _id: 1 }).toArray()).map(
    (item) => item._id,
  );
  const siembraIds = (
    await db.collection('siembras').find({ idLote: { $in: loteIds } }).project({ _id: 1 }).toArray()
  ).map((item) => item._id);
  const dispositivoIds = (
    await db.collection('dispositivos').find({ nombre: prefixRegex }).project({ _id: 1 }).toArray()
  ).map((item) => item._id);

  await Promise.all([
    db.collection('prediccions').deleteMany({ idSiembra: { $in: siembraIds } }),
    db.collection('prediccionriegos').deleteMany({ idSiembra: { $in: siembraIds } }),
    db.collection('reportendvis').deleteMany({ $or: [{ idLote: { $in: loteIds } }, { coleccion: PREFIX }] }),
    db.collection('fertilizacions').deleteMany({ idLote: { $in: loteIds } }),
    db.collection('fumigacions').deleteMany({ idSiembra: { $in: siembraIds } }),
    db.collection('dispositivos').deleteMany({ _id: { $in: dispositivoIds } }),
    db.collection('siembras').deleteMany({ _id: { $in: siembraIds } }),
  ]);

  await db.collection('lotes').deleteMany({ _id: { $in: loteIds } });
  await db.collection('establecimientos').deleteMany({ _id: { $in: establecimientoIds } });
  await db.collection('productors').deleteMany({ _id: { $in: productorIds } });
  await db.collection('distribuidors').deleteMany({ _id: { $in: distribuidorIds } });
  await db.collection('quimicas').deleteMany({ _id: { $in: quimicaIds } });
  await db.collection('usuarios').deleteMany({ username: /^demo\./ });
}

async function upsertOauthClient(db) {
  await db.collection('clients').updateOne(
    { id: '1', clientSecret: '1' },
    {
      $set: {
        id: '1',
        clientSecret: '1',
        grants: ['password', 'refresh_token'],
        redirectUris: [],
        accessTokenLifetime: 3600 * 10,
        refreshTokenLifetime: 3600 * 100,
      },
    },
    { upsert: true },
  );
}

async function createUser(db, username, datosPersonales, permisos, hash) {
  await db.collection('usuarios').insertOne({
    activo: true,
    fechaCreacion: TODAY,
    username: username.toLowerCase(),
    email: username.toLowerCase(),
    hash,
    datosPersonales: {
      email: username.toLowerCase(),
      ...datosPersonales,
    },
    permisos,
  });
}

async function main() {
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db();

  try {
    await deletePreviousDemo(db);
    await upsertOauthClient(db);

    const [semillas, departamento, fertilizante, principioActivo] = await Promise.all([
      db
        .collection('semillas')
        .find({ cultivo: 'Trigo', campania: '2025-2026' })
        .sort({ semillero: 1, variedad: 1 })
        .limit(24)
        .toArray(),
      db.collection('departamentos').findOne({ nombre: 'RIO CUARTO' }).then((dep) => dep || db.collection('departamentos').findOne({})),
      db.collection('fertilizantes').findOne({ nombre: 'UREA' }).then((item) => item || db.collection('fertilizantes').findOne({})),
      db
        .collection('principioactivos')
        .findOne({ nombre: /TEBUCONAZOL/i })
        .then((item) => item || db.collection('principioactivos').findOne({})),
    ]);

    if (semillas.length < 20) {
      throw new Error('No hay suficientes semillas de Trigo campania 2025-2026 cargadas.');
    }
    if (!departamento) {
      throw new Error('No hay departamentos cargados.');
    }

    const hash = await bcrypt.hash(PASSWORD, 10);
    const quimicaId = new ObjectId();
    await db.collection('quimicas').insertOne({
      _id: quimicaId,
      nombre: `${PREFIX} - Quimica`,
      gratis: false,
      logo: '',
      fechaCreacion: TODAY,
    });

    const distribuidores = Array.from({ length: 5 }, (_, index) => ({
      _id: new ObjectId(),
      nombre: `${PREFIX} - Distribuidor ${String(index + 1).padStart(2, '0')}`,
      idQuimica: quimicaId,
      gratis: false,
      fechaCreacion: TODAY,
    }));
    await db.collection('distribuidors').insertMany(distribuidores);

    const productores = [];
    const establecimientos = [];
    const lotes = [];
    const dispositivos = [];
    const siembras = [];
    const predicciones = [];
    const prediccionesRiego = [];
    const reportesNdvi = [];
    const fertilizaciones = [];
    const fumigaciones = [];

    for (let index = 0; index < 20; index += 1) {
      const distribuidor = distribuidores[index % distribuidores.length];
      const seed = semillas[index];
      const lat = -33.12 - Math.floor(index / 5) * 0.035;
      const lng = -64.24 + (index % 5) * 0.045;
      const ubicacion = squarePolygon(lat, lng, 0.009 + (index % 3) * 0.002);
      const productorId = new ObjectId();
      const establecimientoId = new ObjectId();
      const loteId = new ObjectId();
      const dispositivoId = new ObjectId();
      const siembraId = new ObjectId();
      const tenantIds = {
        idQuimica: quimicaId,
        idDistribuidor: distribuidor._id,
        idProductor: productorId,
        idEstablecimiento: establecimientoId,
      };
      const crono =
        (await db.collection('cronos').findOne({
          cultivo: 'Trigo',
          ciclo: seed.ciclo,
          idDepartamento: departamento._id,
        })) ||
        (await db.collection('cronos').findOne({ cultivo: 'Trigo', ciclo: seed.ciclo })) ||
        (await db.collection('cronos').findOne({ cultivo: 'Trigo' }));

      if (!crono) {
        throw new Error('No hay cronos de Trigo cargados.');
      }

      productores.push({
        _id: productorId,
        nombre: `${PREFIX} - Productor ${String(index + 1).padStart(2, '0')}`,
        idDistribuidor: distribuidor._id,
        idQuimica: quimicaId,
        gratis: false,
        fechaCreacion: TODAY,
      });

      const climate = makeClimate(lat, lng, index);
      establecimientos.push({
        _id: establecimientoId,
        ...tenantIds,
        nombre: `${PREFIX} - Establecimiento ${String(index + 1).padStart(2, '0')}`,
        ubicacion: [ubicacion],
        fechaCreacion: TODAY,
        ...climate,
      });

      dispositivos.push({
        _id: dispositivoId,
        idQuimica: quimicaId,
        idDistribuidor: distribuidor._id,
        idProductor: productorId,
        deveui: `DEMOCHAMAN${String(index + 1).padStart(6, '0')}`,
        tipo: 'Sensor de Humedad de Suelo',
        nombre: `${PREFIX} - Sentek ${String(index + 1).padStart(2, '0')}`,
        sensores: ['humedad', 'temperatura'],
        geojson: point(lng, lat),
        bateria: { porcentaje: 82 - (index % 8) },
        ultimoReporte: {
          fecha: TODAY.toISOString(),
          humedad: 27 + (index % 6) * 2,
          temperatura: 14 + (index % 5),
        },
        fechaUltimaComunicacion: TODAY,
      });

      lotes.push({
        _id: loteId,
        ...tenantIds,
        nombre: `${PREFIX} - Lote ${String(index + 1).padStart(2, '0')}`,
        idDepartamento: departamento._id,
        ubicacion,
        idsDispositivo: [dispositivoId],
        idSiembra: siembraId,
        capacidadDeCampo: 34,
        puntoMarchitez: 14,
        capacidadDeRiego: 8,
        metrosLinealesHas: 2800,
        depositoN: 'MEDIO',
        texturaLixiviacion: 'MEDIA',
        texturaEscorrentia: 'MEDIA',
        drenajeNaturalLixiviacion: 'BUENO',
        drenajeNaturalEscorrentia: 'BUENO',
        contenidoP: 'MEDIO',
      });

      const fechaSiembra = isoDate(-30 - index * 3);
      const prediccion = diseasePrediction(seed, index, siembraId, tenantIds);
      const recomendaciones = irrigationRecommendations(index);
      const huella = waterFootprint(index);

      siembras.push({
        _id: siembraId,
        ...tenantIds,
        idLote: loteId,
        idDepartamento: departamento._id,
        idSemilla: seed._id,
        idCrono: crono._id,
        fechaSiembra,
        activa: true,
        coordenadas: { lat, lng },
        geojson: point(lng, lat),
        ultimaPrediccion: prediccion,
        ultimaPrediccionRiego: recomendaciones,
        aguaUtilReal: Number((88 - index * 1.7).toFixed(1)),
        estadoCalculoAguaUtil: 'estimado',
        motivoCalculoAguaUtil: 'Demo local hasta conectar telemetria ChirpStack/Sentek.',
        huellaHidrica: huella,
        humedadCosecha: 13.5,
        rendimientoObtenidoKgHa: 4100 + index * 55,
        rendimientoObtenidoKgHaSeco: 3660 + index * 50,
      });

      predicciones.push({ ...prediccion, _id: new ObjectId() });
      prediccionesRiego.push({
        _id: new ObjectId(),
        ...tenantIds,
        idSiembra: siembraId,
        idLote: loteId,
        fechaCreacion: TODAY,
        fechaPrediccion: TODAY.toISOString().slice(0, 10),
        regar: recomendaciones,
        variables: {
          aguaUtil: 88 - index * 1.7,
          et0SieteDias: climate.prediccionClimatica.pronosticos.reduce((sum, item) => sum + item.et0, 0),
          lluviaSieteDias: climate.prediccionClimatica.pronosticos.reduce((sum, item) => sum + item.lluvia, 0),
        },
      });

      const ndvi = Number((0.54 + (index % 8) * 0.045).toFixed(2));
      reportesNdvi.push({
        _id: new ObjectId(),
        ...tenantIds,
        idLote: loteId,
        idDepartamento: departamento._id,
        fechaCreacion: TODAY,
        fechaDelReporte: TODAY,
        fechaDeLaImagen: isoDate(-1 - (index % 3)),
        ndviPromedio: ndvi,
        ndviUrl: ndviSvg(ndvi, index),
        coleccion: PREFIX,
        metadataImagen: {
          fuente: 'Demo local',
          resolucion: '10m',
          nubosidad: 6 + (index % 4) * 4,
        },
      });

      if (fertilizante) {
        fertilizaciones.push({
          _id: new ObjectId(),
          ...tenantIds,
          idLote: loteId,
          idFertilizante: fertilizante._id,
          fechaCreacion: TODAY,
          fechaFertilizacion: isoDate(-12 - (index % 4)),
          dosisKgHa: 90 + (index % 5) * 12,
        });
      }

      if (principioActivo) {
        fumigaciones.push({
          _id: new ObjectId(),
          ...tenantIds,
          idSiembra: siembraId,
          idPrincipioActivo: principioActivo._id,
          fechaCreacion: TODAY,
          fechaFumigacion: isoDate(-7 - (index % 5)),
          duracion: 15,
          concentracion: 43,
          dosisLtHa: Number((0.7 + (index % 4) * 0.15).toFixed(2)),
        });
      }
    }

    await db.collection('productors').insertMany(productores);
    await db.collection('establecimientos').insertMany(establecimientos);
    await db.collection('dispositivos').insertMany(dispositivos);
    await db.collection('lotes').insertMany(lotes);
    await db.collection('siembras').insertMany(siembras);
    await db.collection('prediccions').insertMany(predicciones);
    await db.collection('prediccionriegos').insertMany(prediccionesRiego);
    await db.collection('reportendvis').insertMany(reportesNdvi);
    if (fertilizaciones.length) await db.collection('fertilizacions').insertMany(fertilizaciones);
    if (fumigaciones.length) await db.collection('fumigacions').insertMany(fumigaciones);

    await createUser(
      db,
      'demo.quimica@chaman.local',
      { nombre: `${PREFIX} Quimica` },
      [{ nivel: 'Quimica', rol: 'Admin', idQuimica: quimicaId }],
      hash,
    );

    for (const [index, distribuidor] of distribuidores.entries()) {
      await createUser(
        db,
        `demo.distribuidor${String(index + 1).padStart(2, '0')}@chaman.local`,
        { nombre: `${PREFIX} Distribuidor ${String(index + 1).padStart(2, '0')}` },
        [{ nivel: 'Distribuidor', rol: 'Admin', idQuimica: quimicaId, idDistribuidor: distribuidor._id }],
        hash,
      );
    }

    for (const [index, productor] of productores.entries()) {
      await createUser(
        db,
        `demo.productor${String(index + 1).padStart(2, '0')}@chaman.local`,
        { nombre: `${PREFIX} Productor ${String(index + 1).padStart(2, '0')}` },
        [
          {
            nivel: 'Productor',
            rol: 'Admin',
            idQuimica: quimicaId,
            idDistribuidor: productor.idDistribuidor,
            idProductor: productor._id,
          },
        ],
        hash,
      );
    }

    await createUser(
      db,
      'demo.establecimiento01@chaman.local',
      { nombre: `${PREFIX} Establecimiento 01` },
      [
        {
          nivel: 'Establecimiento',
          rol: 'Admin',
          idQuimica: quimicaId,
          idDistribuidor: productores[0].idDistribuidor,
          idProductor: productores[0]._id,
          idEstablecimiento: establecimientos[0]._id,
        },
      ],
      hash,
    );

    console.log('Demo jerarquico CHAMAN listo');
    console.table({
      quimicas: 1,
      distribuidores: distribuidores.length,
      productores: productores.length,
      establecimientos: establecimientos.length,
      lotes: lotes.length,
      siembras: siembras.length,
      dispositivos: dispositivos.length,
      reportesNdvi: reportesNdvi.length,
      fertilizaciones: fertilizaciones.length,
      fumigaciones: fumigaciones.length,
    });
    console.log(`Clave para usuarios demo: ${PASSWORD}`);
    console.log('Usuarios principales:');
    console.log('  demo.quimica@chaman.local');
    console.log('  demo.distribuidor01@chaman.local ... demo.distribuidor05@chaman.local');
    console.log('  demo.productor01@chaman.local ... demo.productor20@chaman.local');
    console.log('  demo.establecimiento01@chaman.local');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
