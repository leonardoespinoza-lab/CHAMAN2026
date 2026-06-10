# 📱 Scripts de Build para Móvil - Chaman App

Este proyecto incluye scripts automatizados para facilitar el desarrollo y build de la aplicación móvil usando Capacitor.

## 🚀 Comandos Principales

### iOS
```bash
# Build completo y apertura de Xcode (RECOMENDADO)
npm run ios:build

# Build rápido para desarrollo
npm run ios:dev

# Build para producción
npm run ios:prod
```

### Android
```bash
# Build completo y apertura de Android Studio (RECOMENDADO)
npm run android:build

# Build rápido para desarrollo
npm run android:dev

# Build para producción
npm run android:prod
```

## 🔧 Comandos de Utilidad

### Sincronización de Capacitor
```bash
# Sincronizar ambas plataformas
npm run cap:sync

# Sincronizar solo iOS
npm run cap:sync:ios

# Sincronizar solo Android
npm run cap:sync:android
```

### Limpieza y Diagnóstico
```bash
# Limpiar cache de Capacitor y build
npm run cap:clean

# Diagnosticar problemas de Capacitor
npm run cap:doctor
```

## 📋 ¿Qué hace cada script?

### `npm run ios:build`
1. 🧹 Limpia el build anterior
2. 🏗️ Construye la aplicación Angular en modo producción
3. 🔄 Sincroniza con Capacitor iOS
4. 📱 Abre Xcode automáticamente
5. ✅ Proporciona feedback visual del proceso

### `npm run android:build`
1. 🧹 Limpia el build anterior
2. 🏗️ Construye la aplicación Angular en modo producción
3. 🔄 Sincroniza con Capacitor Android
4. 📱 Abre Android Studio automáticamente
5. ✅ Proporciona feedback visual del proceso

## 🔍 Solución de Problemas

### Error: "Permission denied"
```bash
chmod +x scripts/ios-build.sh
chmod +x scripts/android-build.sh
```

### Error: "Xcode command line tools not found"
```bash
xcode-select --install
```

### Error: "Android SDK not found"
1. Instala Android Studio
2. Configura las variables de entorno ANDROID_HOME
3. Ejecuta `npm run cap:doctor` para verificar

### Mapa no renderiza en iOS
- Verifica que las mejoras implementadas estén aplicadas
- El script automáticamente usa la configuración optimizada
- Los timeouts para iOS están incluidos en el código

## 📁 Estructura de Scripts

```
scripts/
├── ios-build.sh     # Script completo para iOS
└── android-build.sh # Script completo para Android
```

## 💡 Tips

- Usa `npm run ios:build` para desarrollo diario (más robusto)
- Usa `npm run ios:dev` para builds rápidos ocasionales
- Ejecuta `npm run cap:clean` si tienes problemas de cache
- Revisa `npm run cap:doctor` para diagnosticar problemas de configuración

## 🚨 Notas Importantes

- Los scripts verifican que todos los directorios existan antes de proceder
- Se proporciona feedback visual de cada paso
- Los errores detienen la ejecución automáticamente
- Compatible con macOS (desarrollo iOS) y cualquier SO (desarrollo Android)
