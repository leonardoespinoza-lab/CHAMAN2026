# Reproducible fallback build from the CHAMAN2026 monorepo root.
#
# Usage:
#   docker build -f sdc-api-cliente/Dockerfile .
#
# Railway uses RAILPACK through scripts/railway-build.js. This image is kept as
# an independently verifiable recovery path.
FROM node:20-bookworm-slim AS builder

WORKDIR /workspace

COPY sdc-modelos/package.json sdc-modelos/package-lock.json sdc-modelos/tsconfig.json ./sdc-modelos/
COPY sdc-modelos/src ./sdc-modelos/src
RUN npm --prefix sdc-modelos ci \
    && npm --prefix sdc-modelos run build

COPY sdc-api-cliente/package.json sdc-api-cliente/package-lock.json ./sdc-api-cliente/
RUN npm --prefix sdc-api-cliente ci --install-links

COPY sdc-api-cliente ./sdc-api-cliente
RUN npm --prefix sdc-api-cliente run build \
    && npm --prefix sdc-api-cliente prune --omit=dev --install-links

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /workspace/sdc-api-cliente/package.json ./package.json
COPY --from=builder /workspace/sdc-api-cliente/node_modules ./node_modules
COPY --from=builder /workspace/sdc-api-cliente/dist ./dist

EXPOSE 5000

CMD ["node", "dist/main.js"]
