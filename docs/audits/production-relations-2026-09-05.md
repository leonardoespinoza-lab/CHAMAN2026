# Production relations incident, 2026-09-05

Read-only baseline: production Datos deployment `395bb754-ed81-4c4e-afe8-b484eaeea2fb`, commit `358120cb00d30617332efd223ad05cae9ada4985`.

The active lot listing has 112 rows, 85 with idSiembra and zero populated siembra relations. The active sowing listing has 88 rows, 88 with idSemilla and zero populated semilla relations. Individual detail endpoints still include those relations. Weed redaction calls toObject without virtuals, while the schemas enable virtuals only for toJSON. This drops populated relations from list responses without deleting stored data.

Fix: preserve virtuals and getters during redaction in both services. Real Mongoose document regressions cover nested sowing/seed/calendar, establishment, devices, redaction and nonmutation. Three targeted tests passed; Datos production build passed.

Deployment scope: Datos only, from GitHub commit cc35ed6. No database migration. Existing deployment above is the rollback target. Testing Datos currently includes license changes (ab8ba49); do not replace it with this production baseline and undo that ongoing work.

Meteorological batch separately reports 9/88 processed and 79 failures. Rate limiting is still an unconfirmed hypothesis. Verify current observations and ET0 after restoring relationships; do not declare meteorological recovery solely from a successful deployment.

## Recovery verified

Production Datos deployment `0fceabb6-20aa-4889-a5e4-3e6334ef0d43` succeeded with GitHub SHA `cc35ed6e233b40a753829895f3d51b77f6034d63`. Other production services retained their previous deployments.

After deployment, the same queries returned 85/85 populated lot-to-sowing relations and 88/88 populated sowing-to-seed relations. An authenticated POST to the existing `/clima/agrometeorologia/procesar-activas` endpoint launched recovery. The local HTTP caller eventually timed out, so completion was independently verified from server logs and persisted active generations, without issuing a duplicate request.

At 2026-09-05T11:37:35Z the batch completed: 88 sowings, 88 processed, zero failures, 40 establishments. Read-only Mongo verification found 88 newly activated generations and 88 current-day rows with finite ET0 in `indicadores_agrometeorologicos_generados`.

ARVEJA 1 (`6a53f48e927dd0710cbf081c`, sowing `6a53f4be927dd0710cbf0873`) returned HTTP 200, four daily rows and 96 hourly records for September 4–7. GDD was complete through September 4; September 4 ET0 was 3.62 mm. Daily source attribution preserved station priority and modeled gap filling.

No rate-limit configuration or security exemption was needed. The previous rate-limit explanation remains unproven and must not be presented as the confirmed cause. No sowings were recreated and no Mongo migration was run. The existing generation workflow performed the meteorological writes. Browser sessions were at login; visual verification requires the user's session. A reload clears the daily in-memory card cache of the earlier empty response.
