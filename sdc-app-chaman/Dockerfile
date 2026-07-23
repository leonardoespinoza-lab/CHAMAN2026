# Stage 1: reproducible build from the monorepo root.
#
# Usage:
#   docker build -f sdc-app-chaman/Dockerfile .
#
# Railway uses RAILPACK with scripts/railway-build.js. This Docker path is
# retained as an independently reproducible recovery and validation path.
FROM node:20-alpine AS builder

WORKDIR /workspace
RUN apk add --no-cache git

# Build the versioned shared package first. Local generated tarballs are not
# part of the source of truth; package-lock links it via file:../sdc-modelos.
COPY sdc-modelos/package.json sdc-modelos/package-lock.json sdc-modelos/tsconfig.json ./sdc-modelos/
COPY sdc-modelos/src ./sdc-modelos/src
RUN npm --prefix sdc-modelos ci \
    && npm --prefix sdc-modelos run build

# Install exactly the frontend lockfile and then add the application sources.
COPY sdc-app-chaman/package.json sdc-app-chaman/package-lock.json ./sdc-app-chaman/
RUN npm --prefix sdc-app-chaman ci --legacy-peer-deps
COPY sdc-app-chaman ./sdc-app-chaman

# A production build is mandatory. A testing build must never mask a failure.
RUN npm --prefix sdc-app-chaman run build

# Stage 2: serve with Nginx.
FROM nginx:alpine

COPY --from=builder /workspace/sdc-app-chaman/dist /tmp/dist

RUN if [ -d "/tmp/dist/browser" ]; then \
      cp -r /tmp/dist/browser/* /usr/share/nginx/html/; \
    elif [ -d "/tmp/dist" ]; then \
      cp -r /tmp/dist/* /usr/share/nginx/html/; \
    fi && \
    rm -rf /tmp/dist

COPY sdc-app-chaman/nginx.conf /etc/nginx/conf.d/default.conf
COPY sdc-app-chaman/docker-entrypoint.d/40-chaman-runtime-config.sh /docker-entrypoint.d/40-chaman-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-chaman-runtime-config.sh

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
