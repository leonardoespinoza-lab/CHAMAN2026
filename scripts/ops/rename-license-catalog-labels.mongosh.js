/*
 * Renombra unicamente las etiquetas visibles de los planes consolidados.
 * Conserva _id, codigo, limites, modulos y todas las asignaciones existentes.
 *
 * Por defecto SOLO PREVISUALIZA. Para aplicar se requieren ambas variables:
 *   CHAMAN_LICENSE_LABELS_APPLY=true
 *   CHAMAN_LICENSE_LABELS_PLAN_HASH=<hash impreso por la previsualizacion>
 *
 * Ejecutar solamente despues de un mongodump verificado del ambiente objetivo.
 */

const run = async () => {
  const databaseName = String(
    process.env.CHAMAN_LICENSE_CATALOG_DB || "chaman",
  ).trim();
  if (!["chaman", "chaman_testing"].includes(databaseName)) {
    throw new Error(
      `Base no autorizada para renombrar licencias: ${databaseName}`,
    );
  }

  const database = db.getSiblingDB(databaseName);
  const apply = process.env.CHAMAN_LICENSE_LABELS_APPLY === "true";
  const expectedHash = String(
    process.env.CHAMAN_LICENSE_LABELS_PLAN_HASH || "",
  ).trim();
  const crypto = require("crypto");
  const now = new Date();

  const targetLabels = {
    gratis_empresa: "Plan Empresa",
    gratis_red_integral: "Plan Red Integral",
    gratis_red: "Plan Red",
    gratis_individual: "Plan Individual",
  };
  const targetCodes = Object.keys(targetLabels).sort();
  const licensesCursor = await database.licencias.find({
    codigo: { $in: targetCodes },
  });
  const resolvedLicenses = await licensesCursor.toArray();

  const foundCodes = new Set(
    resolvedLicenses.map((license) => String(license.codigo)),
  );
  const missingCodes = targetCodes.filter((code) => !foundCodes.has(code));
  if (missingCodes.length) {
    throw new Error(
      `El catalogo no esta consolidado o faltan planes: ${missingCodes.join(", ")}`,
    );
  }
  if (resolvedLicenses.length !== targetCodes.length) {
    throw new Error(
      "Hay codigos de plan duplicados; no se renombra el catalogo",
    );
  }

  const changes = resolvedLicenses
    .map((license) => ({
      id: String(license._id),
      codigo: String(license.codigo),
      nombreActual: String(license.nombre || ""),
      nombreNuevo: targetLabels[String(license.codigo)],
    }))
    .filter((change) => change.nombreActual !== change.nombreNuevo)
    .sort((left, right) => left.codigo.localeCompare(right.codigo));
  const assignmentCount = await database.licenciaporentidads.countDocuments({});
  const plan = {
    database: database.getName(),
    licenseCount: resolvedLicenses.length,
    assignmentCount,
    changes,
  };
  const planHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(plan))
    .digest("hex");

  print(
    EJSON.stringify(
      { mode: apply ? "apply" : "preview", planHash, plan },
      null,
      2,
    ),
  );

  if (!apply) return;
  if (!expectedHash || expectedHash !== planHash) {
    throw new Error(
      `Plan hash invalido. Esperado ${planHash}; recibido ${expectedHash || "(vacio)"}`,
    );
  }

  const backupId = new ObjectId();
  const backupCollection = database.license_catalog_label_backups;
  let backupPrepared = false;

  try {
    await backupCollection.insertOne({
      _id: backupId,
      kind: "license-catalog-label-backup",
      status: "prepared",
      database: database.getName(),
      planHash,
      createdAt: now,
      licenses: resolvedLicenses,
      assignmentCount,
    });
    backupPrepared = true;

    for (const change of changes) {
      const result = await database.licencias.updateOne(
        {
          _id: ObjectId(change.id),
          codigo: change.codigo,
          nombre: change.nombreActual,
        },
        {
          $set: {
            nombre: change.nombreNuevo,
            fechaActualizacion: now,
          },
        },
      );
      if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
        throw new Error(
          `El plan ${change.codigo} cambio despues de la previsualizacion`,
        );
      }
    }

    const finalLicensesCursor = await database.licencias.find({
      codigo: { $in: targetCodes },
    });
    const finalLicenses = await finalLicensesCursor.toArray();
    for (const license of finalLicenses) {
      if (license.nombre !== targetLabels[String(license.codigo)]) {
        throw new Error(
          `No se pudo verificar la etiqueta de ${license.codigo}`,
        );
      }
    }
    const finalAssignmentCount =
      await database.licenciaporentidads.countDocuments({});
    if (finalAssignmentCount !== assignmentCount) {
      throw new Error(
        `Cambio inesperado de asignaciones: ${finalAssignmentCount}/${assignmentCount}`,
      );
    }

    await backupCollection.updateOne(
      { _id: backupId },
      {
        $set: {
          status: "applied",
          completedAt: new Date(),
          finalAssignmentCount,
        },
      },
    );
    print(
      EJSON.stringify(
        {
          applied: true,
          backupId,
          planHash,
          renamed: changes.length,
          assignmentsPreserved: finalAssignmentCount,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (backupPrepared) {
      for (const license of resolvedLicenses) {
        await database.licencias.replaceOne({ _id: license._id }, license, {
          upsert: true,
        });
      }
      await backupCollection.updateOne(
        { _id: backupId },
        {
          $set: {
            status: "rolled_back",
            rolledBackAt: new Date(),
            error: String(error?.message || error),
          },
        },
      );
    }
    throw error;
  }
};

run();
