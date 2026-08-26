# ChirpStack production baseline

This directory preserves the sanitized deployment sources verified on
2026-08-26. It is documentation and recovery material; adding it to Git does
not authorize or trigger a Railway deployment.

> **Status: snapshot only — not approved for deployment.** The sources are
> preserved so they cannot be lost, but the recovery procedure is incomplete.
> In particular, the active Basic Station snapshot has empty MQTT credentials
> while the preserved broker rejects anonymous clients. A service can report
> `SUCCESS` even when that application-level connection is not working.

## AU915 channel plan

The Network Server intentionally enables two independent region prefixes:

| Region | Uplink channels | 500 kHz channel | Current use |
| --- | --- | --- | --- |
| `au915_0` | `0-7` (`915.2-916.6 MHz`) | `64` (`915.9 MHz`) | Kleppe |
| `au915_1` | `8-15` (`916.8-918.2 MHz`) | `65` (`917.5 MHz`) | Existing Milesight / Basic Station fleet |

`server/chirpstack.toml` enables both regions. The MQTT ACL authorizes both
topic prefixes. The preserved Basic Station bridge publishes to `au915_1` and
therefore must not be repurposed for a gateway using `au915_0` without a
separate, reviewed configuration and deployment.

The gateway channel plan, MQTT topic prefix, ChirpStack region and end-device
channel mask must agree. Do not change one of them in isolation.

## Provenance

- `server/` is an exact copy of the local deployment context whose static
  files were matched against the active `chirpstack-ns` Railway container.
  It supersedes the historical `region_au915_0.toml` from `50abdb5`, which
  incorrectly represented `au915_0` with the FSB2 frequencies.
- `gateway-bridge-basicstation/` is an exact copy of the local deployment
  context matched against the active `chirpstack-gateway-bridge-au915-1`
  container.
- `mosquitto/` comes from `50abdb5`; its Dockerfile and four static runtime
  files were matched against the active MQTT build/container. The repository
  normalizes text to LF, so hashes from a Windows CRLF checkout can differ
  while normalized content remains identical. The manifest records both the
  verified Windows-deployment-context CRLF hashes and the staged Git LF
  hashes. Runtime matching applies only to files that exist in the container;
  Dockerfiles and Railway descriptors are build/deployment evidence.
- `postgres/` and `redis/` preserve the recipes associated with `70308ab`;
  their build/runtime behavior was matched to the active services.
- `railway.json` files are deployment descriptors. They do not exist inside
  the running containers and therefore cannot be verified by container hash.

The service/deployment mapping and confidence levels are recorded in
`deploy/production-baseline-2026-08-26.json`.

For Chamán services, `activeDeploymentMode` describes how the currently active
artifact was produced, while `configuredSource` describes the GitHub trigger
still attached to the service. They are intentionally separate: a manual CLI
artifact does not remove the service's `main` trigger.

## Recovery blockers to resolve before deployment

1. Parameterize and validate the Basic Station bridge MQTT authentication.
   Do not insert a password in the TOML file or commit one to Git.
2. Capture and verify each Railway service Root Directory/config path. The
   nested `railway.json` files are only correct when Railway builds from their
   corresponding service directory; the bridge currently has no descriptor.
3. Capture the external persistent-volume mapping for PostgreSQL
   (`/var/lib/postgresql/data`), Redis (`/data`) and Mosquitto
   (`/mosquitto/data`). Never initialize replacement empty volumes over the
   active services.
4. Pin the validated image digests for Gateway Bridge, Mosquitto, PostgreSQL
   and Redis. Their current Dockerfiles use mutable tags.
5. Review the admin bootstrap behavior: when `CHIRPSTACK_ADMIN_PASSWORD` is
   present, the Network Server entrypoint writes that password to PostgreSQL
   on every start.
6. Validate joins, uplinks, downlinks and MQTT flow for one gateway on each
   AU915 prefix in an isolated environment.

Only environment-variable names and mount paths may be documented here. Their
values remain in the approved secret/platform store.

| Service | Required variable names visible in this snapshot | Persistent path |
| --- | --- | --- |
| Network Server | `CHIRPSTACK_POSTGRES_DSN`, `CHIRPSTACK_REDIS_URL`, `CHIRPSTACK_API_SECRET`, `MQTT_BROKER_HOST`, `MQTT_CHIRPSTACK_PASSWORD`; optional admin and gateway-CA variables | PostgreSQL/Redis are external |
| Gateway Bridge | `BASIC_STATION_TLS_CERT_B64`, `BASIC_STATION_TLS_KEY_B64`, `BASIC_STATION_CA_CERT_B64`; MQTT authentication is an unresolved blocker | none |
| Mosquitto | `MQTT_CHIRPSTACK_PASSWORD`, `MQTT_CHAMAN_PASSWORD`, gateway auth variables and optional TLS variables | `/mosquitto/data` |
| PostgreSQL | standard PostgreSQL image variables supplied by the platform | `/var/lib/postgresql/data` |
| Redis | `REDIS_PASSWORD` | `/data` |

## Secret handling

No credential, password, private certificate or database value belongs in
this directory. All sensitive values are injected through Railway variables
and materialized only under runtime paths. The repository ignores generated
PKI/private-key output. Never copy `/run/chirpstack`, `/run/mosquitto`, Railway
variables or local credential files into Git.

## Deployment guardrail

After every blocker above has been resolved, before any future deployment:

1. Work from a clean branch based on the approved production baseline.
2. Run `node --test scripts/tests/chirpstack-production-baseline.test.js` and
   the normal repository quality gates.
3. Review the diff for the one intended service only.
4. Obtain a separate production-deployment authorization.
5. Deploy from that service directory, never from the monorepo root.
6. Verify health, joins and uplinks on both AU915 prefixes before considering
   the change complete.

Pushing this preservation branch must not be confused with deploying it. The
current production services remain untouched until an explicit deployment is
approved.
