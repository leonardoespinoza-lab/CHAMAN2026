FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=yes
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gcc \
    gdal-bin \
    git \
    libgdal-dev \
    libgl1 \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

COPY package.json ./
COPY scripts ./scripts
COPY sdc-ndvi-worker ./sdc-ndvi-worker

RUN python -m pip install --upgrade pip setuptools \
    && python -m pip install -r sdc-ndvi-worker/requirements.txt

CMD ["npm", "run", "railway:start"]
