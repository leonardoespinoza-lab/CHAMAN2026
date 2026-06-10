#!/bin/bash
start_time=$(date +%s)

cliente="chaman"

unameOut=$(uname -a)
case "${unameOut}" in
*Microsoft*) OS="WSL" ;;  #must be first since Windows subsystem for linux will have Linux in the name too
*microsoft*) OS="WSL2" ;; #WARNING: My v2 uses ubuntu 20.4 at the moment slightly different name may not always work
Linux*) OS="Linux" ;;
Darwin*) OS="Mac" ;;
CYGWIN*) OS="Cygwin" ;;
MINGW*) OS="Windows" ;;
*Msys) OS="Windows" ;;
*) OS="UNKNOWN:${unameOut}" ;;
esac

# chequear el sistema operativo
if [ ${OS} = 'Linux' ]; then echo "🐧 ==> Sistema operativo Linux"; fi
if [ ${OS} = 'Mac' ]; then echo "🍏 ==> Sistema operativo macOS"; fi
if [ ${OS} = 'Windows' ]; then echo "🪟 ==> Sistema operativo Windows"; fi
if [ ${OS} = 'WSL' ]; then echo "🐧 ==> Sistema operativo Windows Subsystem for Linux"; fi
if [ ${OS} = 'WSL2' ]; then echo "🐧 ==> Sistema operativo Windows Subsystem for Linux 2"; fi
if [ ${OS} = 'Cygwin' ]; then echo "🐧 ==> Sistema operativo Cygwin"; fi
if [ ${OS} = 'UNKNOWN' ]; then
  echo "❌ ==> Sistema operativo desconocido"
  exit 1
fi

# chequear si hay argumento de test, si hay definir variable bool
if [ -z "$1" ]; then
  test=false
else
  test=true
  echo "🍺 ==> MODO TEST"
fi

# compilar angular
echo "Compilando Angular"
echo "Limpiando carpeta dist y compilando proyecto Angular"
rm -rf dist
# si es test usar el build-test
if [ $test = true ]; then
  $(npm run build-test >/dev/null)
else
  $(npm run build >/dev/null)
fi
if [ $? -eq 0 ]; then
  echo "✅ Build OK"
else
  echo "Build failed ❌"
  exit 1
fi
echo "Syncronizando proyecto android"
npx cap sync android

echo "Ejecturando gradle en proyecto Android"
(
  cd android
  sh gradlew clean >/dev/null
)
# el AAB hacerlo sólo si no es test
if [ $test = false ]; then
  (
    cd android
    sh gradlew :app:bundleRelease >/dev/null
  )
  if [ $? -eq 0 ]; then
    echo "✅ Gradle build OK"
    mkdir -p build
    cp android/app/build/outputs/bundle/release/app-release.aab build/$cliente.aab
    echo "Bundle AAB para $cliente creado en build/$cliente.aab"
  else
    echo "❌ Gradle build failed"
    exit 1
  fi
fi
# hacer build de APK también
echo "Ejecturando gradle en proyecto Android"
(
  cd android
  sh gradlew :app:assembleRelease >/dev/null
)
if [ $? -eq 0 ]; then
  echo "✅ Gradle build OK"
  mkdir -p build
  # si es test, el apk tiene que terminar con -test
  if [ $test = true ]; then
    cp android/app/build/outputs/apk/release/app-release.apk build/$cliente-test.apk
    echo "APK para $cliente creado en build/$cliente-test.apk"
  else
    cp android/app/build/outputs/apk/release/app-release.apk build/$cliente.apk
    echo "APK para $cliente creado en build/$cliente.apk"
  fi
else
  echo "❌ Gradle build failed"
  exit 1
fi
end_time=$(date +%s)
echo "Script termminado con éxito 🍻 en $((end_time - start_time)) segundos 🕐"
