# Railway Deployment

## Estrategia recomendada

Crear un proyecto Railway con servicios separados desde el mismo repositorio `CHAMAN2026`.

Usar root directory `.` para que todos los servicios puedan resolver `sdc-modelos` por `file:../sdc-modelos`, o configurar cada servicio con comandos que se ejecuten desde raiz.

## Servicios minimos para staging

1. `chaman-datos`
2. `chaman-auth`
3. `chaman-api`
4. `chaman-predicciones`
5. `chaman-clima`
6. `chaman-web`
7. MongoDB
8. Redis

## Orden de publicacion

1. MongoDB y Redis.
2. `sdc-datos`.
3. `sdc-auth`.
4. `sdc-api-clima`.
5. `sdc-api-predicciones`.
6. `sdc-api-cliente`.
7. `sdc-app-chaman`.

## Comandos por servicio

### sdc-datos

Build:

```bash
npm --prefix sdc-datos ci && npm --prefix sdc-datos run build
```

Start:

```bash
npm --prefix sdc-datos run start:prod
```

### sdc-auth

Build:

```bash
npm --prefix sdc-auth ci && npm --prefix sdc-auth run build
```

Start:

```bash
npm --prefix sdc-auth run start:prod
```

### sdc-api-cliente

Build:

```bash
npm --prefix sdc-api-cliente ci && npm --prefix sdc-api-cliente run build
```

Start:

```bash
npm --prefix sdc-api-cliente run start:prod
```

### sdc-api-predicciones

Build:

```bash
npm --prefix sdc-api-predicciones ci && npm --prefix sdc-api-predicciones run build
```

Start:

```bash
npm --prefix sdc-api-predicciones run start:prod
```

### sdc-api-clima

Build:

```bash
npm --prefix sdc-api-clima ci && npm --prefix sdc-api-clima run build
```

Start:

```bash
npm --prefix sdc-api-clima run start:prod
```

### sdc-app-chaman

Build:

```bash
npm --prefix sdc-app-chaman ci --legacy-peer-deps && npm --prefix sdc-app-chaman run build
```

Start depende del builder elegido. Para Nginx/Docker usar `sdc-app-chaman/Dockerfile`; para hosting estatico publicar `sdc-app-chaman/dist`.

## Variables

Usar los archivos `*.env.example` de esta carpeta como checklist. No copiar secretos reales al repositorio.
