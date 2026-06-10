#!/bin/bash

# Script rápido para sync iOS sin abrir Xcode
# Uso: npm run ios:sync

set -e  # Salir si cualquier comando falla

echo "🔄 Sincronizando con iOS..."

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

# Verificar si existe build previo
if [ ! -d "dist" ]; then
    print_step "No existe build previo, construyendo..."
    if npm run build; then
        print_success "Build completado"
    else
        print_error "Error en el build"
        exit 1
    fi
else
    print_step "Usando build existente en dist/"
fi

# Sincronizar con Capacitor iOS
print_step "Sincronizando con Capacitor iOS..."
if npx cap sync ios; then
    print_success "Sincronización completada"
    echo ""
    echo "🎉 iOS sincronizado. Puedes abrir Xcode manualmente si necesitas:"
    echo "💡 Ejecuta: npm run ios:open"
else
    print_error "Error en la sincronización"
    exit 1
fi
