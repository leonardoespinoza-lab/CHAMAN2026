#!/bin/bash

# Script para construir y abrir el proyecto iOS
# Uso: npm run ios:build

set -e  # Salir si cualquier comando falla

echo "🚀 Iniciando build para iOS..."

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

# Paso 4: Sincronizar con Capacitor iOS
print_step "Sincronizando con Capacitor iOS..."
if npx cap sync ios; then
    print_success "Sincronización con iOS completada"
else
    print_error "Error en la sincronización con iOS"
    exit 1
fi

# Paso 5: Verificar que el proyecto iOS existe
if [ ! -d "ios" ]; then
    print_error "El directorio iOS no existe. Ejecute: npx cap add ios"
    exit 1
fi

# Paso 6: Abrir Xcode
print_step "Abriendo Xcode..."
if npx cap open ios; then
    print_success "Xcode abierto correctamente"
    echo ""
    echo "🎉 ¡Proceso completado! Xcode debería estar abierto con tu proyecto."
    echo "💡 Puedes compilar y ejecutar directamente desde Xcode."
else
    print_error "Error al abrir Xcode"
    exit 1
fi
