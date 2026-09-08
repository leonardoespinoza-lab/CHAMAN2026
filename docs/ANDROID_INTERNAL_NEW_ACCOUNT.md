# Android: nueva cuenta de Chamán

## Identidades separadas

- Android: `ar.chamanagro.app`, Chamán Agro, versión 1.6.0, versionCode 1.
- iOS conserva `com.chamanagro.app`, Chamán, y su numeración existente.
- El namespace Java Android permanece `com.chamanagro.app`: no es el identificador de distribución. El FileProvider utiliza `${applicationId}`.
- Cada comando que modifica Capacitor debe indicar `android` o `ios`. No usar `npx cap sync` sin plataforma.

## Preparación y firma

1. Ejecutar las pruebas móviles desde la raíz: `npm run test:mobile-release`.
2. Dentro de `sdc-app-chaman`: instalar dependencias, `npm run build` y `npx cap sync android`.
3. Usar Java 21, Android SDK 36 y el wrapper Gradle del repositorio (con checksum).
4. Configurar sólo en el entorno del proceso las variables `CHAMAN_ANDROID_KEYSTORE_FILE`, `CHAMAN_ANDROID_KEYSTORE_PASSWORD`, `CHAMAN_ANDROID_KEY_ALIAS` y `CHAMAN_ANDROID_KEY_PASSWORD`.
5. Ejecutar `gradlew.bat --no-daemon :app:bundleRelease :app:assembleRelease`. El keystore es PKCS12. Una tarea release sin firma configurada debe fallar.
6. Verificar identificador, versión y firma de los artefactos antes de subir el AAB directamente a Google Play Console.

La clave de carga y su contraseña se conservan localmente fuera del repositorio. No publicar claves, contraseñas, APK ni AAB de pruebas privadas como artefactos de un repositorio público. La contraseña local protegida con Windows DPAPI depende del usuario y del equipo; no sustituye un respaldo portable gestionado por el titular.

## Alcance

Rama aislada para pruebas internas de Android. No fusionar ni desplegar esta rama en Railway. La lista de probadores y el lanzamiento interno se administran en Google Play Console. Preparar un paquete o una prueba interna no autoriza revisión ni publicación pública.
