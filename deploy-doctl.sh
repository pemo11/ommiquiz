#!/bin/bash

# Ommiquiz DigitalOcean Deployment mit doctl
# Dieses Skript stellt Backend und Frontend auf DigitalOcean App Platform bereit

set -e

# Cleanup bei Ctrl+C (früh definieren)
trap 'echo ""; log_warning "Deployment abgebrochen"; exit 1' INT

echo "=============================================="
echo "🚀 Ommiquiz DigitalOcean Deployment mit doctl"
echo "=============================================="

# Farben für bessere Lesbarkeit
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

projectId="9e4b2846-06a8-4354-b94b-d82fcd7c0c01"

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

# Hilfsfunktion um APP_ID zu ermitteln
get_app_id() {
    local app_name="$1"
    local app_id
    app_id=$(doctl apps list --format ID,Name --no-header 2>/dev/null | grep -w "$app_name" | awk '{print $1}' || echo "")
    if [[ -z "$app_id" ]]; then
        log_error "Konnte App-ID für '$app_name' nicht ermitteln"
        return 1
    fi
    echo "$app_id"
}

# App löschen falls sie existiert
delete_app_if_exists() {
    local app_name="$1"
    
    if doctl apps list --format Name --no-header 2>/dev/null | grep -q "^$app_name$"; then
        log_warning "App '$app_name' existiert bereits und wird gelöscht..."
        local app_id
        app_id=$(get_app_id "$app_name")
        if [[ $? -eq 0 && -n "$app_id" ]]; then
            if doctl apps delete "$app_id" --force; then
                log_success "App '$app_name' wurde gelöscht"
                # Warte kurz bis die App vollständig gelöscht ist
                sleep 5
            else
                log_error "Fehler beim Löschen der App '$app_name'"
                return 1
            fi
        else
            return 1
        fi
    fi
}

# Backend einzeln deployen
deploy_backend() {
    local backend_name="ommiquiz-backend"
    
    log_info "Starte Backend Deployment..."
    
    # Lösche existierende Backend-App
    delete_app_if_exists "$backend_name"
    if [[ $? -ne 0 ]]; then
        return 1
    fi
    
    # Erstelle neue Backend-App
    log_info "Erstelle neue Backend-App..."
    if doctl apps create --spec .do/backend.yaml --project-id $projectId --wait; then
        log_success "Backend-App wurde erstellt"
    else
        log_error "Backend-App-Erstellung fehlgeschlagen"
        return 1
    fi
    
    # Warte auf Backend-Deployment
    log_info "Warte auf Backend-Deployment..."
    local app_id
    for i in {1..5}; do
        sleep 10
        app_id=$(get_app_id "$backend_name" 2>/dev/null || echo "")
        if [[ -n "$app_id" ]]; then
            APP_STATUS=$(doctl apps get "$app_id" --format Phase --no-header 2>/dev/null || echo "unknown")
            log_info "Backend Status: $APP_STATUS (${i}/5)"
            
            if [[ "$APP_STATUS" == "ACTIVE" ]]; then
                log_success "Backend ist aktiv!"
                break
            elif [[ "$APP_STATUS" == "ERROR" ]]; then
                log_error "Backend-Deployment fehlgeschlagen!"
                log_info "Überprüfe die Logs mit: doctl apps logs $app_id --type BUILD --component backend"
                return 1
            fi
        else
            log_warning "Backend noch nicht verfügbar (Versuch $i/5)"
        fi
        
        if [[ $i -eq 5 ]]; then
            log_warning "Backend-Deployment dauert länger als erwartet. Prüfe Status manuell."
        fi
    done
    
    # Hole Backend-URL
    app_id=$(get_app_id "$backend_name")
    if [[ $? -eq 0 && -n "$app_id" ]]; then
        BACKEND_URL=$(doctl apps get "$app_id" --format URL --no-header 2>/dev/null)
        if [[ -n "$BACKEND_URL" ]]; then
            log_success "Backend deployed unter: $BACKEND_URL"
            
            # Teste Backend Health-Check
            log_info "Teste Backend-Verbindung..."
            HEALTH_URL="${BACKEND_URL}/api/health"
            
            for attempt in {1..5}; do
                log_info "Health-Check Versuch $attempt/5..."
                if HTTP_STATUS=$(curl -s -o /tmp/health_response.json -w "%{http_code}" "$HEALTH_URL" 2>/dev/null); then
                    if [[ "$HTTP_STATUS" == "200" ]]; then
                        if [[ -f /tmp/health_response.json ]]; then
                            RESPONSE_CONTENT=$(cat /tmp/health_response.json 2>/dev/null)
                            log_success "Backend ist erreichbar und funktioniert!"
                            log_info "Health-Check Response: $RESPONSE_CONTENT"
                        fi
                        rm -f /tmp/health_response.json
                        break
                    else
                        log_warning "Health-Check fehlgeschlagen (Versuch $attempt/5) - Status: $HTTP_STATUS"
                    fi
                else
                    log_warning "Health-Check Verbindungsfehler (Versuch $attempt/5)"
                fi
                rm -f /tmp/health_response.json
                
                if [[ $attempt -lt 5 ]]; then
                    sleep 10
                fi
            done
            
            log_info "Backend-URL für Frontend-Konfiguration: $BACKEND_URL/api"
        fi
    fi
}

# Frontend einzeln deployen
deploy_frontend() {
    local frontend_name="ommiquiz-frontend"
    
    log_info "Starte Frontend Deployment..."
    
    # Lösche existierende Frontend-App
    delete_app_if_exists "$frontend_name"
    if [[ $? -ne 0 ]]; then
        return 1
    fi
    
    # Erstelle neue Frontend-App
    log_info "Erstelle neue Frontend-App..."
    if doctl apps create --spec .do/frontend.yaml --project-id $projectId --wait; then
        log_success "Frontend-App wurde erstellt"
    else
        log_error "Frontend-App-Erstellung fehlgeschlagen"
        return 1
    fi
    
    # Warte auf Frontend-Deployment
    log_info "Warte auf Frontend-Deployment..."
    local app_id
    for i in {1..5}; do
        sleep 10
        app_id=$(get_app_id "$frontend_name" 2>/dev/null || echo "")
        if [[ -n "$app_id" ]]; then
            APP_STATUS=$(doctl apps get "$app_id" --format Phase --no-header 2>/dev/null || echo "unknown")
            log_info "Frontend Status: $APP_STATUS (${i}/5)"
            
            if [[ "$APP_STATUS" == "ACTIVE" ]]; then
                log_success "Frontend ist aktiv!"
                break
            elif [[ "$APP_STATUS" == "ERROR" ]]; then
                log_error "Frontend-Deployment fehlgeschlagen!"
                log_info "Überprüfe die Logs mit: doctl apps logs $app_id --type BUILD --component frontend"
                return 1
            fi
        else
            log_warning "Frontend noch nicht verfügbar (Versuch $i/5)"
        fi
        
        if [[ $i -eq 5 ]]; then
            log_warning "Frontend-Deployment dauert länger als erwartet. Prüfe Status manuell."
        fi
    done
    
    # Hole Frontend-URL
    app_id=$(get_app_id "$frontend_name")
    if [[ $? -eq 0 && -n "$app_id" ]]; then
        FRONTEND_URL=$(doctl apps get "$app_id" --format URL --no-header 2>/dev/null)
        if [[ -n "$FRONTEND_URL" ]]; then
            log_success "Frontend deployed unter: $FRONTEND_URL"
            
            # Teste Frontend
            log_info "Teste Frontend-Verbindung..."
            if HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null); then
                if [[ "$HTTP_STATUS" == "200" ]]; then
                    log_success "Frontend ist erreichbar!"
                else
                    log_warning "Frontend antwortet mit Status: $HTTP_STATUS"
                fi
            else
                log_warning "Frontend-Verbindung fehlgeschlagen"
            fi
        fi
    fi
}

# Vollständige App Deployment Funktion (Backend + Frontend)
deploy_app() {
    log_info "Starte komplettes App Deployment (Backend + Frontend)..."
    
    # Lösche existierende Apps
    delete_app_if_exists "$APP_NAME"
    if [[ $? -ne 0 ]]; then
        return 1
    fi
    
    # Erstelle neue App
    log_info "Erstelle neue App..."
    if doctl apps create --spec .do/app.yaml --project-id $projectId --wait; then
        log_success "App wurde erstellt"
    else
        log_error "App-Erstellung fehlgeschlagen"
        return 1
    fi
    
    # Warte auf Deployment mit Fortschrittsanzeige
    log_info "Warte auf App-Deployment..."
    local app_id
    for i in {1..5}; do
        sleep 10
        app_id=$(get_app_id "$APP_NAME" 2>/dev/null || echo "")
        if [[ -n "$app_id" ]]; then
            APP_STATUS=$(doctl apps get "$app_id" --format Phase --no-header 2>/dev/null || echo "unknown")
            log_info "Deployment Status: $APP_STATUS (${i}/5)"
            
            if [[ "$APP_STATUS" == "ACTIVE" ]]; then
                log_success "App ist aktiv!"
                break
            elif [[ "$APP_STATUS" == "ERROR" ]]; then
                log_error "App-Deployment fehlgeschlagen!"
                log_info "Überprüfe die Logs mit:"
                log_info "  Backend Build: doctl apps logs $app_id --type BUILD --component backend"
                log_info "  Frontend Build: doctl apps logs $app_id --type BUILD --component frontend"
                return 1
            fi
        else
            log_warning "App noch nicht verfügbar (Versuch $i/5)"
        fi
        
        if [[ $i -eq 5 ]]; then
            log_warning "Deployment dauert länger als erwartet. Prüfe Status manuell."
        fi
    done
    
    # Hole App-URLs
    app_id=$(get_app_id "$APP_NAME")
    if [[ $? -eq 0 && -n "$app_id" ]]; then
        APP_URL=$(doctl apps get "$app_id" --format URL --no-header 2>/dev/null)
        if [[ -n "$APP_URL" ]]; then
            log_success "App deployed unter: $APP_URL"
            
            # Teste Backend Health-Check
            log_info "Teste Backend-Verbindung..."
            HEALTH_URL="${APP_URL}/api/health"
            
            for attempt in {1..5}; do
                log_info "Health-Check Versuch $attempt/5..."
                if HTTP_STATUS=$(curl -s -o /tmp/health_response.json -w "%{http_code}" "$HEALTH_URL" 2>/dev/null); then
                    if [[ "$HTTP_STATUS" == "200" ]]; then
                        if [[ -f /tmp/health_response.json ]]; then
                            RESPONSE_CONTENT=$(cat /tmp/health_response.json 2>/dev/null)
                            log_success "Backend ist erreichbar und funktioniert!"
                            log_info "Health-Check Response: $RESPONSE_CONTENT"
                        fi
                        rm -f /tmp/health_response.json
                        break
                    else
                        log_warning "Health-Check fehlgeschlagen (Versuch $attempt/5) - Status: $HTTP_STATUS"
                    fi
                else
                    log_warning "Health-Check Verbindungsfehler (Versuch $attempt/5)"
                fi
                rm -f /tmp/health_response.json
                
                if [[ $attempt -lt 5 ]]; then
                    sleep 10
                fi
            done
            
            # Teste Frontend
            log_info "Teste Frontend-Verbindung..."
            if HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL" 2>/dev/null); then
                if [[ "$HTTP_STATUS" == "200" ]]; then
                    log_success "Frontend ist erreichbar!"
                else
                    log_warning "Frontend antwortet mit Status: $HTTP_STATUS"
                fi
            else
                log_warning "Frontend-Verbindung fehlgeschlagen"
            fi
        else
            log_warning "Konnte App-URL nicht ermitteln"
        fi
    else
        log_error "App nicht gefunden nach Deployment"
        return 1
    fi
}

# App-Status prüfen
check_app_status() {
    echo ""
    log_info "App-Status:"
    
    # Verwende ein robusteres Format für die Auflistung
    if doctl apps list --format ID,Name,Phase --no-header 2>/dev/null | grep -w "$APP_NAME" >/dev/null; then
        echo "App gefunden:"
        doctl apps list --format "ID,Name,Phase,URL" 2>/dev/null | head -1  # Header
        doctl apps list --format "ID,Name,Phase,URL" --no-header 2>/dev/null | grep -w "$APP_NAME"
        
        APP_ID=$(get_app_id "$APP_NAME")
        if [[ $? -eq 0 && -n "$APP_ID" ]]; then
            echo ""
            echo "App-Details:"
            doctl apps get "$APP_ID" --format "Name,Phase,URL" 2>/dev/null
        fi
    else
        echo "App '$APP_NAME' nicht gefunden in der Liste"
        echo "Versuche direkte Suche..."
        
        # Versuche alle Apps aufzulisten um zu sehen was vorhanden ist
        echo ""
        echo "Verfügbare Apps:"
        doctl apps list 2>/dev/null || echo "Fehler beim Auflisten der Apps"
    fi
}

# Logs anzeigen
show_logs() {
    if doctl apps list --format Name --no-header 2>/dev/null | grep -q "^$APP_NAME$"; then
        APP_ID=$(get_app_id "$APP_NAME")
        if [[ $? -ne 0 || -z "$APP_ID" ]]; then
            return 1
        fi
        
        echo "Verfügbare Log-Typen:"
        echo "1) Backend Build Logs"
        echo "2) Backend Runtime Logs"
        echo "3) Frontend Build Logs"
        read -p "Welche Logs möchten Sie sehen? (1-3): " log_choice
        
        case $log_choice in
            1)
                log_info "Backend Build Logs:"
                doctl apps logs "$APP_ID" --type BUILD --component backend
                ;;
            2)
                log_info "Backend Runtime Logs:"
                doctl apps logs "$APP_ID" --type RUN --component backend
                ;;
            3)
                log_info "Frontend Build Logs:"
                doctl apps logs "$APP_ID" --type BUILD --component frontend
                ;;
            *)
                log_error "Ungültige Auswahl"
                ;;
        esac
    else
        log_error "App '$APP_NAME' nicht gefunden"
    fi
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
APP_NAME="ommiquiz-app"
GITHUB_REPO="pemo11/ommiquiz"
BRANCH="main"

# Prüfe ob .do Verzeichnis existiert
if [[ ! -d ".do" ]]; then
    log_error "Verzeichnis .do nicht gefunden!"
    log_info "Erstelle zuerst das Verzeichnis und die app.yaml Datei"
    exit 1
fi

# Prüfe ob .do/app.yaml existiert
if [[ ! -f ".do/app.yaml" ]]; then
    log_error "Datei .do/app.yaml nicht gefunden!"
    exit 1
fi

# Menü für Deployment-Optionen
echo ""
echo "Wählen Sie eine Option:"
echo "1) Komplette App deployen (Backend + Frontend)"
echo "2) Nur Backend deployen"
echo "3) Nur Frontend deployen"
echo "4) App-Status prüfen"
echo "5) App-Logs anzeigen"
echo "6) Alle Apps anzeigen"
read -p "Ihre Wahl (1-6): " choice

case $choice in
    1)
        echo ""
        deploy_app
        ;;
    2)
        echo ""
        deploy_backend
        ;;
    3)
        echo ""
        deploy_frontend
        ;;
    4)
        echo ""
        check_app_status
        ;;
    5)
        echo ""
        show_logs
        ;;
    6)
        echo ""
        log_info "Alle Apps:"
        doctl apps list
        ;;
    *)
        log_error "Ungültige Auswahl"
        exit 1
        ;;
esac

log_success "Vorgang abgeschlossen! 🎉"
echo ""
echo "Nützliche Befehle:"
echo "- Apps anzeigen: doctl apps list"
echo "- App-Details: doctl apps get <APP_ID>"
echo "- Backend-Logs: doctl apps logs <APP_ID> --component backend"
echo "- Frontend-Logs: doctl apps logs <APP_ID> --component frontend"
echo "- App löschen: doctl apps delete <APP_ID>"