FROM chirpstack/chirpstack-gateway-bridge:4

USER root

COPY chirpstack-gateway-bridge.toml /etc/chirpstack-gateway-bridge/chirpstack-gateway-bridge.toml
COPY entrypoint.sh /usr/local/bin/chaman-basicstation-entrypoint.sh

RUN mkdir -p /run/chaman-basicstation \
    && chown nobody:nogroup /run/chaman-basicstation \
    && chmod 0755 /usr/local/bin/chaman-basicstation-entrypoint.sh

USER nobody:nogroup

ENTRYPOINT ["/bin/sh", "/usr/local/bin/chaman-basicstation-entrypoint.sh"]
