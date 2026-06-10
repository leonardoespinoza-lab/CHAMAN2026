FROM python:3.12-slim

# Evita interacciones durante instalación
ENV DEBIAN_FRONTEND=noninteractive

# Instala dependencias del sistema necesarias
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    gdal-bin \
    libgdal-dev \
    libgl1 \
    python3-dev \
    curl \
    git && rm -rf /var/lib/apt/lists/*

# Variables necesarias para compilar gdal con rasterio
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal
ENV PIP_NO_CACHE_DIR=yes

# Update pip y setuptools
RUN pip install --upgrade pip setuptools

# Crea y entra en el directorio de la app
WORKDIR /app

# Copia requirements.txt primero para usar cache si no cambió
COPY requirements.txt .

# Instala dependencias
RUN pip install -r requirements.txt

# Copia el resto del código de la aplicación
COPY . .

# Comando por defecto
CMD ["python", "worker.py"]
