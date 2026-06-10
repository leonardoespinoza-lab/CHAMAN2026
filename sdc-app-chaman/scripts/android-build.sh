#!/bin/bash

# Script para construir y abrir el proyecto Android
# Uso: npm run android:build

set -e  # Salir si cualquier comando falla

echo "🚀 Iniciando build para Android..."

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir mensajes con color
print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Paso 1: Limpiar dist anterior
print_step "Limpiando build anterior..."
rm -rf dist/
print_success "Build anterior limpiado"

# Paso 2: Construir la aplicación
print_step "Construyendo aplicación Angular..."
if npm run build; then
    print_success "Build de Angular completado"
else
    print_error "Error en el build de Angular"
    exit 1
fi

# Paso 3: Verificar que existe el directorio dist
if [ ! -d "dist" ]; then
    print_error "El directorio dist no fue creado. Verifique el build."
    exit 1
fi

# Paso 4: Sincronizar con Capacitor Android
print_step "Sincronizando con Capacitor Android..."
if npx cap sync android; then
    print_success "Sincronización con Android completada"
else
    print_error "Error en la sincronización con Android"
    exit 1
fi

# Paso 5: Verificar que el proyecto Android existe
if [ ! -d "android" ]; then
    print_error "El directorio Android no existe. Ejecute: npx cap add android"
    exit 1
fi

# Paso 6: Abrir Android Studio
print_step "Abriendo Android Studio..."
if npx cap open android; then
    print_success "Android Studio abierto correctamente"
    echo ""
    echo "🎉 ¡Proceso completado! Android Studio debería estar abierto con tu proyecto."
    echo "💡 Puedes compilar y ejecutar directamente desde Android Studio."
else
    print_error "Error al abrir Android Studio"
    exit 1
fi
