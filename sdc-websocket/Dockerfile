FROM node:22-alpine AS build
WORKDIR /app
COPY sdc-modelos ./sdc-modelos
COPY sdc-websocket/package*.json ./sdc-websocket/
WORKDIR /app/sdc-websocket
RUN npm ci --legacy-peer-deps
COPY sdc-websocket ./
RUN npm run build && npm prune --omit=dev --legacy-peer-deps

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/sdc-modelos /app/sdc-modelos
COPY --from=build --chown=node:node /app/sdc-websocket /app/sdc-websocket
WORKDIR /app/sdc-websocket
USER node
EXPOSE 5006
CMD ["node", "dist/main.js"]
