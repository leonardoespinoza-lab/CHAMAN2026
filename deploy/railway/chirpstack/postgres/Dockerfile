FROM postgres:16-alpine

ENV PGDATA=/var/lib/postgresql/data/pgdata

COPY initdb/001-chirpstack.sql /docker-entrypoint-initdb.d/001-chirpstack.sql
