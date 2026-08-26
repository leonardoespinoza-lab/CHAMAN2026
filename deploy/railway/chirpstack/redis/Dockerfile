FROM redis:7-alpine

COPY docker-entrypoint-chaman.sh /usr/local/bin/docker-entrypoint-chaman.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint-chaman.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-chaman.sh"]
