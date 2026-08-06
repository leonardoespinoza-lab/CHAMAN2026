FROM chirpstack/chirpstack:4.19.0

USER root
RUN rm -rf /etc/chirpstack && mkdir -p /etc/chirpstack
COPY --chown=nobody:nogroup configuration /etc/chirpstack
COPY --chown=nobody:nogroup docker-entrypoint-chaman.sh /usr/local/bin/docker-entrypoint-chaman.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint-chaman.sh
USER nobody:nogroup

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-chaman.sh"]
