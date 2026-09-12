"use strict";
// Node 20+. Backend example: never embed the key in a browser/mobile bundle.
async function queryPhenology({
  baseUrl,
  apiKey,
  sowingId,
  etag,
  fetchImpl = fetch,
}) {
  const base = new URL(baseUrl);
  if (
    base.origin !== "https://testing-api-testing.up.railway.app" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname.replace(/\/$/, "") !== "/sdc-quimica-test/integraciones/v1"
  )
    throw Error("Este ejemplo solo admite la URL de Testing acordada.");
  if (
    typeof apiKey !== "string" ||
    !apiKey ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(sowingId)
  )
    throw Error("Credencial e ID externo validos requeridos.");
  const headers = { "x-api-key": apiKey, Accept: "application/json" };
  if (etag) headers["If-None-Match"] = etag;
  const response = await fetchImpl(
    `${base.href.replace(/\/$/, "")}/siembras/${encodeURIComponent(sowingId)}/fenologia`,
    { headers, redirect: "error", signal: AbortSignal.timeout(60000) },
  );
  if (response.status === 304) return { unchanged: true, etag };
  if (response.status === 429)
    return {
      retry: true,
      afterSeconds: Math.max(
        60,
        Number(response.headers.get("Retry-After")) || 60,
      ),
    };
  if (![200, 202].includes(response.status))
    throw Error(
      `Consulta no confirmada (HTTP ${response.status}). Conservar la ultima lectura; no registrar la clave.`,
    );
  return {
    unchanged: false,
    pending: response.status === 202,
    etag: response.headers.get("ETag"),
    result: await response.json(),
  };
}
if (require.main === module) {
  queryPhenology({
    baseUrl: process.env.CHAMAN_API_BASE_URL,
    apiKey: process.env.CHAMAN_API_KEY,
    sowingId: process.argv[2],
    etag: process.env.CHAMAN_LAST_ETAG,
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch(() => {
      console.error(
        "Consulta no completada. Revisar URL, clave, ID y disponibilidad; no se imprimen detalles sensibles.",
      );
      process.exitCode = 1;
    });
}
module.exports = { queryPhenology };
