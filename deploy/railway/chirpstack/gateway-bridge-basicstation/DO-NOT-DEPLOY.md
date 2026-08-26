# Snapshot only — do not deploy

This directory preserves the static files matched against the active
`chirpstack-gateway-bridge-au915-1` container on 2026-08-26. It is not an
approved recovery package.

The preserved TOML connects to the internal MQTT listener with an empty
username and password. The preserved Mosquitto configuration has
`allow_anonymous false` and requires its runtime password file. Before any
redeployment, MQTT authentication must be parameterized through environment
variables, tested without committing values, and approved independently.

The service also requires Railway Root Directory/config-path settings and the
three Basic Station certificate variables. Those settings are external to
this directory and have not yet been captured as a complete recovery runbook.

Do not modify or deploy this snapshot merely because its files match the
currently running container. Container `SUCCESS` is not proof of MQTT event
flow.
