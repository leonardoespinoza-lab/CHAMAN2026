FROM chirpstack/chirpstack:4@sha256:9e0105f1dd733d3d3caa77aa7cfdbf817417fab8a093dd89639a2cd899ab9efe

USER root

COPY chirpstack.toml /etc/chirpstack/chirpstack.toml
COPY region_au915_0.toml /etc/chirpstack/region_au915_0.toml
COPY region_au915_1.toml /etc/chirpstack/region_au915_1.toml
COPY docker-entrypoint-chaman.sh /usr/local/bin/docker-entrypoint-chaman.sh

RUN mkdir -p /run/chirpstack \
    && chown nobody:nogroup /run/chirpstack \
    && chmod 0755 /usr/local/bin/docker-entrypoint-chaman.sh \
    && chown nobody:nogroup /etc/chirpstack/*.toml

USER nobody:nogroup

ENTRYPOINT ["/bin/sh", "/usr/local/bin/docker-entrypoint-chaman.sh"]
