#!/bin/bash

# Schnelle doctl Deployment Befehle für Ommiquiz
# Verwenden Sie diese Befehle direkt oder das interaktive deploy-doctl.sh Skript

set -e

echo "🚀 Ommiquiz doctl Quick Commands"
echo "================================"

# Farben
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Verfügbare Befehle:${NC}"
echo ""

# 1. Backend deployen
echo -e "${GREEN}1. Backend deployen:${NC}"
echo "doctl apps create --spec .do/backend-app.yaml --wait"
echo ""

# 2. Frontend deployen  
echo -e "${GREEN}2. Frontend deployen:${NC}"
echo "doctl apps create --spec frontend-app.yaml --wait"
echo ""

# 3. Apps auflisten
echo -e "${GREEN}3. Apps auflisten:${NC}"
echo "doctl apps list"
echo ""

# 4. App aktualisieren
echo -e "${GREEN}4. App aktualisieren:${NC}"
echo "doctl apps update <APP_ID> --spec <CONFIG_FILE>"
echo ""

# 5. App Status prüfen
echo -e "${GREEN}5. App Status prüfen:${NC}"
echo "doctl apps get <APP_ID>"
echo ""

# 6. App Logs anzeigen
echo -e "${GREEN}6. App Logs anzeigen:${NC}"
echo "doctl apps logs <APP_ID> --follow"
echo ""

# 7. App löschen
echo -e "${GREEN}7. App löschen:${NC}"
echo "doctl apps delete <APP_ID>"
echo ""

echo "Für interaktives Deployment verwenden Sie: ./deploy-doctl.sh"