# Compilación móvil de Chamán

La aplicación móvil usa el mismo frontend Angular que la web y se empaqueta con
Capacitor. El identificador debe permanecer como `com.chamanagro.app` para
actualizar las aplicaciones existentes en Apple y Google sin perder usuarios.

## Versiones de esta entrega

- Aplicación: `1.6.0`.
- Android: `versionCode 22`, `targetSdk 36`, `minSdk 24`.
- iOS: `CFBundleShortVersionString 1.6.0`, build `2`, iOS 15.6 o superior.
- Capacitor: línea 8.x.

## Validación local

Desde la raíz del repositorio:

```bash
npm run test:mobile-release
npm run audit:secrets
```

Desde `sdc-app-chaman`:

```bash
npm ci --legacy-peer-deps
npm test -- --watch=false --karma-config=karma.ci.conf.js --browsers=ChromeHeadlessCI
npm run build
npx cap sync android
npx cap sync ios
```

La sincronización de iOS puede prepararse en Windows, pero CocoaPods y la
compilación final requieren macOS y Xcode. El workflow
`.github/workflows/mobile-gates.yml` realiza ambos builds en GitHub: Android con
API 36 e iOS con Xcode 26.

## Firma

La firma Android no se guarda en Git. El build de distribución recibe:

- `CHAMAN_ANDROID_KEYSTORE_FILE`
- `CHAMAN_ANDROID_KEYSTORE_PASSWORD`
- `CHAMAN_ANDROID_KEY_ALIAS`
- `CHAMAN_ANDROID_KEY_PASSWORD`

Los certificados y perfiles de Apple se administran con la cuenta del equipo
de Chamán en App Store Connect y tampoco se guardan en el repositorio.

## Flujo de publicación

1. Crear una rama `codex/mobile-*` desde el SHA productivo aprobado.
2. Ejecutar las validaciones locales.
3. Subir la rama y esperar los dos jobs de `mobile-gates`.
4. Probar el APK generado y un build de TestFlight con usuarios internos.
5. Completar metadatos, privacidad y capturas en las tiendas.
6. Publicar manualmente después de la aprobación de cada tienda.

No se compila ni publica desde una carpeta sucia y no se utiliza `railway up`
para una entrega móvil.
