# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar git (necesario para sdc-modelos)
RUN apk add --no-cache git

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copiar código fuente
COPY . .

# Build de producción
RUN npm run build 2>&1 || npm run build-test 2>&1

# Stage 2: Serve con Nginx
FROM nginx:alpine

# Copiar archivos desde donde estén
COPY --from=builder /app/dist /tmp/dist

# Script para mover archivos al lugar correcto
RUN if [ -d "/tmp/dist/browser" ]; then \
      cp -r /tmp/dist/browser/* /usr/share/nginx/html/; \
    elif [ -d "/tmp/dist" ]; then \
      cp -r /tmp/dist/* /usr/share/nginx/html/; \
    fi && \
    rm -rf /tmp/dist

# Copiar configuración de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer puerto
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
