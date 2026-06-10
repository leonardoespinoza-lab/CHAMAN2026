# Usamos Alpine para reducir el tamaño de la imagen
FROM node:20-alpine
# Instalamos git para poder clonar el repositorio
RUN apk add --no-cache git
# Creamos el directorio de trabajo
WORKDIR /app
# Clonamos el repositorio
COPY . /app
# Instalamos las dependencias
RUN npm install && npm run lint && npm run build
# Exponemos el puerto 5000
EXPOSE 5000
# Comando para ejecutar la aplicación
CMD ["npm", "run","start:prod"]
