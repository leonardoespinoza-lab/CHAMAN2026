FROM chirpstack/chirpstack:4.19.0

USER root
RUN rm -rf /etc/chirpstack && mkdir -p /etc/chirpstack
COPY --chown=nobody:nogroup configuration /etc/chirpstack
USER nobody:nogroup

CMD ["-c", "/etc/chirpstack"]
