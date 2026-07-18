const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');

const url = process.env.MONGO_PUBLIC_URL || process.env.MONGO_URL || process.env.MONGO_URI;
const lotId = process.argv[2];
if (!url || !lotId) throw new Error('Faltan URL Mongo o id de lote.');

const id = (value) => (ObjectId.isValid(value) ? new ObjectId(value) : value);

(async () => {
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'chaman');
    const lote = await db.collection('lotes').findOne({ _id: id(lotId) });
    const siembra = lote?.idSiembra
      ? await db.collection('siembras').findOne({ _id: id(lote.idSiembra) })
      : await db.collection('siembras').find({ idLote: id(lotId) }).sort({ fechaSiembra: -1 }).limit(1).next();
    const prediccion = siembra
      ? await db.collection('prediccions').find({ idSiembra: siembra._id }).sort({ fecha: -1 }).limit(1).next()
      : undefined;

    const resumen = {
      lote: lote && { _id: lote._id, nombre: lote.nombre, idSiembra: lote.idSiembra },
      siembra: siembra && {
        _id: siembra._id,
        fechaSiembra: siembra.fechaSiembra,
        cultivo: siembra.cultivo,
        semilla: siembra.semilla && {
          _id: siembra.semilla._id,
          cultivo: siembra.semilla.cultivo,
          semillero: siembra.semilla.semillero,
          variedad: siembra.semilla.variedad,
          ciclo: siembra.semilla.ciclo,
          resistencia: siembra.semilla.resistencia,
        },
      },
      prediccion: prediccion && {
        fecha: prediccion.fecha,
        etapa: prediccion.etapa,
        nombreEtapa: prediccion.nombreEtapa,
        fuenteFenologia: prediccion.fuenteFenologia,
        calidadFenologia: prediccion.calidadFenologia,
        estacion: prediccion.estacion,
        enfermedades: prediccion.enfermedades,
      },
    };
    console.log(JSON.stringify(resumen, null, 2));
  } finally {
    await client.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
