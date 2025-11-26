#!/bin/bash

# Ommiquiz DigitalOcean Deployment mit doctl
# Dieses Skript stellt Backend und Frontend auf DigitalOcean App Platform bereit

set -e

echo "🚀 Ommiquiz DigitalOcean Deployment mit doctl"
echo "=============================================="

# Farben für bessere Lesbarkeit
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funktionen
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Prüfe ob doctl installiert ist
if ! command -v doctl &> /dev/null; then
    log_error "doctl ist nicht installiert. Installiere es mit: brew install doctl"
    exit 1
fi

# Prüfe Authentifizierung
log_info "Prüfe doctl Authentifizierung..."
if ! doctl account get &> /dev/null; then
    log_error "doctl ist nicht authentifiziert. Führe aus: doctl auth init"
    exit 1
fi
log_success "doctl ist authentifiziert"

# Parameter
BACKEND_APP_NAME="ommiquiz-backend"
FRONTEND_APP_NAME="ommiquiz-frontend" 
GITHUB_REPO="pemo11/ommiquiz"
BRANCH="main"

# Menü für Deployment-Optionen
echo ""
echo "Wählen Sie eine Deployment-Option:"
echo "1) Nur Backend deployen"
echo "2) Nur Frontend deployen"
echo "3) Backend und Frontend deployen (empfohlen)"
echo "4) Bestehende Apps anzeigen"
echo "5) App-Status prüfen"
read -p "Ihre Wahl (1-5): " choice

case $choice in
    1)
        echo ""
        log_info "Deploying Backend..."
        deploy_backend
        ;;
    2)
        echo ""
        log_info "Deploying Frontend..."
        deploy_frontend
        ;;
    3)
        echo ""
        log_info "Deploying Backend und Frontend..."
        deploy_backend
        sleep 5
        deploy_frontend
        ;;
    4)
        echo ""
        log_info "Bestehende Apps:"
        doctl apps list
        ;;
    5)
        echo ""
        log_info "App-Status:"
        check_app_status
        ;;
    *)
        log_error "Ungültige Auswahl"
        exit 1
        ;;
esac

# Backend Deployment Funktion
deploy_backend() {
    log_info "Starte Backend Deployment..."
    
    # Prüfe ob Backend-App bereits existiert
    if doctl apps list | grep -q "$BACKEND_APP_NAME"; then
        log_warning "Backend-App '$BACKEND_APP_NAME' existiert bereits"
        read -p "Möchten Sie sie aktualisieren? (y/n): " update_choice
        if [[ $update_choice == "y" || $update_choice == "Y" ]]; then
            BACKEND_APP_ID=$(doctl apps list | grep "$BACKEND_APP_NAME" | awk '{print $1}')
            log_info "Aktualisiere Backend-App (ID: $BACKEND_APP_ID)..."
            doctl apps update $BACKEND_APP_ID --spec .do/backend-app.yaml
            log_success "Backend-App wurde aktualisiert"
        else
            log_info "Backend-Deployment übersprungen"
            return
        fi
    else
        log_info "Erstelle neue Backend-App..."
        doctl apps create --spec .do/backend-app.yaml --wait
        log_success "Backend-App wurde erstellt"
    fi
    
    # Warte auf Deployment
    log_info "Warte auf Backend-Deployment..."
    sleep 30
    
    # Hole Backend-URL
    BACKEND_APP_ID=$(doctl apps list | grep "$BACKEND_APP_NAME" | awk '{print $1}')
    BACKEND_URL=$(doctl apps get $BACKEND_APP_ID --format URL --no-header)
    
    log_success "Backend deployed unter: $BACKEND_URL"
    
    # Teste Backend
    log_info "Teste Backend-Verbindung..."
    if curl -f -s "$BACKEND_URL/api/health" > /dev/null; then
        log_success "Backend ist erreichbar und funktioniert!"
    else
        log_warning "Backend-Gesundheitscheck fehlgeschlagen"
    fi
}

# Frontend Deployment Funktion
deploy_frontend() {
    log_info "Starte Frontend Deployment..."
    
    # Hole Backend-URL für Frontend-Konfiguration
    BACKEND_APP_ID=$(doctl apps list | grep "$BACKEND_APP_NAME" | awk '{print $1}')
    if [[ -n "$BACKEND_APP_ID" ]]; then
        BACKEND_URL=$(doctl apps get $BACKEND_APP_ID --format URL --no-header)
        log_info "Verwende Backend-URL: $BACKEND_URL"
        
        # Aktualisiere Frontend-Konfiguration
        sed -i.bak "s|YOUR-BACKEND-APP-URL\.ondigitalocean\.app|${BACKEND_URL#https://}|g" frontend-app.yaml
    else
        log_warning "Backend-App nicht gefunden. Verwende Standard-URL"
    fi
    
    # Prüfe ob Frontend-App bereits existiert
    if doctl apps list | grep -q "$FRONTEND_APP_NAME"; then
        log_warning "Frontend-App '$FRONTEND_APP_NAME' existiert bereits"
        read -p "Möchten Sie sie aktualisieren? (y/n): " update_choice
        if [[ $update_choice == "y" || $update_choice == "Y" ]]; then
            FRONTEND_APP_ID=$(doctl apps list | grep "$FRONTEND_APP_NAME" | awk '{print $1}')
            log_info "Aktualisiere Frontend-App (ID: $FRONTEND_APP_ID)..."
            doctl apps update $FRONTEND_APP_ID --spec frontend-app.yaml
            log_success "Frontend-App wurde aktualisiert"
        else
            log_info "Frontend-Deployment übersprungen"
            return
        fi
    else
        log_info "Erstelle neue Frontend-App..."
        doctl apps create --spec frontend-app.yaml --wait
        log_success "Frontend-App wurde erstellt"
    fi
    
    # Warte auf Deployment
    log_info "Warte auf Frontend-Deployment..."
    sleep 30
    
    # Hole Frontend-URL
    FRONTEND_APP_ID=$(doctl apps list | grep "$FRONTEND_APP_NAME" | awk '{print $1}')
    FRONTEND_URL=$(doctl apps get $FRONTEND_APP_ID --format URL --no-header)
    
    log_success "Frontend deployed unter: $FRONTEND_URL"
}

# App-Status prüfen
check_app_status() {
    echo ""
    echo "Backend Apps:"
    doctl apps list | grep -E "(ID|$BACKEND_APP_NAME)" || echo "Keine Backend-App gefunden"
    
    echo ""
    echo "Frontend Apps:"
    doctl apps list | grep -E "(ID|$FRONTEND_APP_NAME)" || echo "Keine Frontend-App gefunden"
    
    echo ""
    echo "Alle Apps:"
    doctl apps list
}

# Cleanup bei Ctrl+C
trap 'echo ""; log_warning "Deployment abgebrochen"; exit 1' INT

log_success "Deployment abgeschlossen! 🎉"
echo ""
echo "Nützliche Befehle:"
echo "- Apps anzeigen: doctl apps list"
echo "- App-Details: doctl apps get <APP_ID>"
echo "- App-Logs: doctl apps logs <APP_ID>"
echo "- App löschen: doctl apps delete <APP_ID>"