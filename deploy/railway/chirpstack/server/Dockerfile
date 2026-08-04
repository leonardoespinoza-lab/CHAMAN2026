FROM chirpstack/chirpstack:4.19.0

RUN rm -rf /etc/chirpstack && mkdir -p /etc/chirpstack
COPY configuration /etc/chirpstack

CMD ["-c", "/etc/chirpstack"]
