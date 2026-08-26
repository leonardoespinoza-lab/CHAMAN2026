FROM eclipse-mosquitto:2.0.22

COPY mosquitto.conf /etc/chaman/mosquitto.conf
COPY acl /etc/chaman/acl
COPY gateway-acl /etc/chaman/gateway-acl
COPY docker-entrypoint-chaman.sh /usr/local/bin/docker-entrypoint-chaman.sh
RUN chown mosquitto:mosquitto /etc/chaman/acl /etc/chaman/gateway-acl \
  && chmod 0640 /etc/chaman/acl /etc/chaman/gateway-acl \
  && chmod 0755 /usr/local/bin/docker-entrypoint-chaman.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-chaman.sh"]
