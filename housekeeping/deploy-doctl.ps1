#Requires -Version 5.1

<#
.SYNOPSIS
    Ommiquiz DigitalOcean Deployment mit doctl
.DESCRIPTION
    Dieses Skript stellt Backend und Frontend auf DigitalOcean App Platform bereit
.EXAMPLE
    .\deploy-doctl.ps1
#>

[CmdletBinding()]
param()

# Error handling
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Cleanup bei Ctrl+C
$null = Register-EngineEvent PowerShell.Exiting -Action {
    Write-Warning "Deployment abgebrochen"
}

Write-Host "=" * 46 -ForegroundColor White
Write-Host "🚀 Ommiquiz DigitalOcean Deployment mit doctl" -ForegroundColor White
Write-Host "=" * 46 -ForegroundColor White

# Konfiguration
$projectId = "9e4b2846-06a8-4354-b94b-d82fcd7c0c01"
$APP_NAME = "ommiquiz-app"
$GITHUB_REPO = "pemo11/ommiquiz"
$BRANCH = "main"

# Logging-Funktionen
function Write-LogInfo {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
}

function Write-LogSuccess {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-LogWarning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-LogError {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

# Hilfsfunktion um APP_ID zu ermitteln
function Get-AppId {
    param([string]$AppName)
    
    try {
        $output = & doctl apps list --format ID,Name --no-header 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "doctl apps list failed"
        }
        
        $appLine = $output | Where-Object { $_ -match "\s+$AppName$" }
        if ($appLine) {
            $appId = ($appLine -split '\s+')[0]
            if ([string]::IsNullOrWhiteSpace($appId)) {
                throw "Could not extract app ID"
            }
            return $appId
        }
        else {
            throw "App not found in list"
        }
    }
    catch {
        Write-LogError "Konnte App-ID für '$AppName' nicht ermitteln: $($_.Exception.Message)"
        return $null
    }
}

# App löschen falls sie existiert
function Remove-AppIfExists {
    param([string]$AppName)
    
    try {
        $output = & doctl apps list --format Name --no-header 2>$null
        $appExists = $output | Where-Object { $_ -match "^$AppName$" }
        
        if ($appExists) {
            Write-LogWarning "App '$AppName' existiert bereits und wird gelöscht..."
            $appId = Get-AppId -AppName $AppName
            if ($appId) {
                & doctl apps delete $appId --force
                if ($LASTEXITCODE -eq 0) {
                    Write-LogSuccess "App '$AppName' wurde gelöscht"
                    Start-Sleep -Seconds 5
                    return $true
                }
                else {
                    Write-LogError "Fehler beim Löschen der App '$AppName'"
                    return $false
                }
            }
            else {
                return $false
            }
        }
        return $true
    }
    catch {
        Write-LogError "Fehler beim Prüfen/Löschen der App '$AppName': $($_.Exception.Message)"
        return $false
    }
}

# Backend einzeln deployen
function Deploy-Backend {
    $backendName = "ommiquiz-backend"
    
    Write-LogInfo "Starte Backend Deployment..."
    
    # Lösche existierende Backend-App
    if (-not (Remove-AppIfExists -AppName $backendName)) {
        return $false
    }
    
    # Erstelle neue Backend-App
    Write-LogInfo "Erstelle neue Backend-App..."
    & doctl apps create --spec .do/backend.yaml --project-id $projectId --wait
    if ($LASTEXITCODE -eq 0) {
        Write-LogSuccess "Backend-App wurde erstellt"
    }
    else {
        Write-LogError "Backend-App-Erstellung fehlgeschlagen"
        return $false
    }
    
    # Warte auf Backend-Deployment
    Write-LogInfo "Warte auf Backend-Deployment..."
    for ($i = 1; $i -le 5; $i++) {
        Start-Sleep -Seconds 10
        
        $appId = Get-AppId -AppName $backendName
        if ($appId) {
            try {
                $APP_STATUS = & doctl apps get $appId --format Phase --no-header 2>$null
                if ($LASTEXITCODE -ne 0) {
                    $APP_STATUS = "unknown"
                }
                Write-LogInfo "Backend Status: $APP_STATUS ($i/5)"
                
                if ($APP_STATUS -eq "ACTIVE") {
                    Write-LogSuccess "Backend ist aktiv!"
                    break
                }
                elseif ($APP_STATUS -eq "ERROR") {
                    Write-LogError "Backend-Deployment fehlgeschlagen!"
                    Write-LogInfo "Überprüfe die Logs mit: doctl apps logs $appId --type BUILD --component backend"
                    return $false
                }
            }
            catch {
                Write-LogWarning "Backend noch nicht verfügbar (Versuch $i/5)"
            }
        }
        else {
            Write-LogWarning "Backend noch nicht verfügbar (Versuch $i/5)"
        }
        
        if ($i -eq 5) {
            Write-LogWarning "Backend-Deployment dauert länger als erwartet. Prüfe Status manuell."
        }
    }
    
    # Hole Backend-URL und teste
    $appId = Get-AppId -AppName $backendName
    if ($appId) {
        try {
            $BACKEND_URL = & doctl apps get $appId --format URL --no-header 2>$null
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($BACKEND_URL)) {
                Write-LogSuccess "Backend deployed unter: $BACKEND_URL"
                
                # Teste Backend Health-Check
                Write-LogInfo "Teste Backend-Verbindung..."
                $HEALTH_URL = "$BACKEND_URL/api/health"
                
                for ($attempt = 1; $attempt -le 5; $attempt++) {
                    Write-LogInfo "Health-Check Versuch $attempt/5 - URL: $HEALTH_URL"
                    try {
                        $response = Invoke-WebRequest -Uri $HEALTH_URL -Method GET -TimeoutSec 10 -ErrorAction Stop
                        if ($response.StatusCode -eq 200) {
                            Write-LogSuccess "Backend ist erreichbar und funktioniert!"
                            Write-LogInfo "Health-Check Response: $($response.Content)"
                            break
                        }
                        else {
                            Write-LogWarning "Health-Check fehlgeschlagen (Versuch $attempt/5) - Status: $($response.StatusCode)"
                        }
                    }
                    catch {
                        Write-LogWarning "Health-Check Verbindungsfehler (Versuch $attempt/5)"
                    }
                    
                    if ($attempt -lt 5) {
                        Start-Sleep -Seconds 10
                    }
                }
                
                Write-LogInfo "Backend-URL für Frontend-Konfiguration: $BACKEND_URL/api"
            }
        }
        catch {
            Write-LogWarning "Fehler beim Abrufen der Backend-URL: $($_.Exception.Message)"
        }
    }
    
    return $true
}

# Frontend einzeln deployen
function Deploy-Frontend {
    $frontendName = "ommiquiz-frontend"
    
    Write-LogInfo "Starte Frontend Deployment..."
    
    # Lösche existierende Frontend-App
    if (-not (Remove-AppIfExists -AppName $frontendName)) {
        return $false
    }
    
    # Erstelle neue Frontend-App
    Write-LogInfo "Erstelle neue Frontend-App..."
    & doctl apps create --spec .do/frontend.yaml --project-id $projectId --wait
    if ($LASTEXITCODE -eq 0) {
        Write-LogSuccess "Frontend-App wurde erstellt"
    }
    else {
        Write-LogError "Frontend-App-Erstellung fehlgeschlagen"
        return $false
    }
    
    # Warte auf Frontend-Deployment
    Write-LogInfo "Warte auf Frontend-Deployment..."
    for ($i = 1; $i -le 5; $i++) {
        Start-Sleep -Seconds 10
        
        $appId = Get-AppId -AppName $frontendName
        if ($appId) {
            try {
                $APP_STATUS = & doctl apps get $appId --format Phase --no-header 2>$null
                if ($LASTEXITCODE -ne 0) {
                    $APP_STATUS = "unknown"
                }
                Write-LogInfo "Frontend Status: $APP_STATUS ($i/5)"
                
                if ($APP_STATUS -eq "ACTIVE") {
                    Write-LogSuccess "Frontend ist aktiv!"
                    break
                }
                elseif ($APP_STATUS -eq "ERROR") {
                    Write-LogError "Frontend-Deployment fehlgeschlagen!"
                    Write-LogInfo "Überprüfe die Logs mit: doctl apps logs $appId --type BUILD --component frontend"
                    return $false
                }
            }
            catch {
                Write-LogWarning "Frontend noch nicht verfügbar (Versuch $i/5)"
            }
        }
        else {
            Write-LogWarning "Frontend noch nicht verfügbar (Versuch $i/5)"
        }
        
        if ($i -eq 5) {
            Write-LogWarning "Frontend-Deployment dauert länger als erwartet. Prüfe Status manuell."
        }
    }
    
    # Hole Frontend-URL und teste
    $appId = Get-AppId -AppName $frontendName
    if ($appId) {
        try {
            $FRONTEND_URL = & doctl apps get $appId --format URL --no-header 2>$null
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($FRONTEND_URL)) {
                Write-LogSuccess "Frontend deployed unter: $FRONTEND_URL"
                
                # Teste Frontend
                Write-LogInfo "Teste Frontend-Verbindung..."
                try {
                    $response = Invoke-WebRequest -Uri $FRONTEND_URL -Method GET -TimeoutSec 10 -ErrorAction Stop
                    if ($response.StatusCode -eq 200) {
                        Write-LogSuccess "Frontend ist erreichbar!"
                    }
                    else {
                        Write-LogWarning "Frontend antwortet mit Status: $($response.StatusCode)"
                    }
                }
                catch {
                    Write-LogWarning "Frontend-Verbindung fehlgeschlagen"
                }
            }
        }
        catch {
            Write-LogWarning "Fehler beim Abrufen der Frontend-URL: $($_.Exception.Message)"
        }
    }
    
    return $true
}

# Vollständige App Deployment Funktion
function Deploy-App {
    Write-LogInfo "Starte komplettes App Deployment (Backend + Frontend)..."
    
    # Lösche existierende App
    if (-not (Remove-AppIfExists -AppName $APP_NAME)) {
        return $false
    }

    # Erstelle neue App
    Write-LogInfo "Erstelle neue App..."
    & doctl apps create --spec .do/app.yaml --project-id $projectId --wait
    if ($LASTEXITCODE -eq 0) {
        Write-LogSuccess "App wurde erstellt"
    }
    else {
        Write-LogError "App-Erstellung fehlgeschlagen"
        return $false
    }
    
    # Warte auf Deployment mit Fortschrittsanzeige
    Write-LogInfo "Warte auf App-Deployment..."
    
    for ($i = 1; $i -le 5; $i++) {
        Start-Sleep -Seconds 10
        
        $appId = Get-AppId -AppName $APP_NAME
        if ($appId) {
            try {
                $APP_STATUS = & doctl apps get $appId --format Phase --no-header 2>$null
                if ($LASTEXITCODE -ne 0) {
                    $APP_STATUS = "unknown"
                }
                Write-LogInfo "Deployment Status: $APP_STATUS ($i/5)"
                
                if ($APP_STATUS -eq "ACTIVE") {
                    Write-LogSuccess "App ist aktiv!"
                    break
                }
                elseif ($APP_STATUS -eq "ERROR") {
                    Write-LogError "App-Deployment fehlgeschlagen!"
                    Write-LogInfo "Überprüfe die Logs mit:"
                    Write-LogInfo "  Backend Build: doctl apps logs $appId --type BUILD --component backend"
                    Write-LogInfo "  Frontend Build: doctl apps logs $appId --type BUILD --component frontend"
                    return $false
                }
            }
            catch {
                Write-LogWarning "Fehler beim Abrufen des App-Status (Versuch $i/5)"
            }
        }
        else {
            Write-LogWarning "App noch nicht verfügbar (Versuch $i/5)"
        }
        
        if ($i -eq 5) {
            Write-LogWarning "Deployment dauert länger als erwartet. Prüfe Status manuell."
        }
    }
    
    # Hole App-URLs und teste Verbindungen
    $appId = Get-AppId -AppName $APP_NAME
    if ($appId) {
        try {
            $APP_URL = & doctl apps get $appId --format URL --no-header 2>$null
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($APP_URL)) {
                Write-LogSuccess "App deployed unter: $APP_URL"
                
                # Teste Backend Health-Check
                Write-LogInfo "Teste Backend-Verbindung..."
                $HEALTH_URL = "$APP_URL/api/health"
                
                for ($attempt = 1; $attempt -le 5; $attempt++) {
                    Write-LogInfo "Health-Check Versuch $attempt/5 - URL: $HEALTH_URL"
                    try {
                        $response = Invoke-WebRequest -Uri $HEALTH_URL -Method GET -TimeoutSec 10 -ErrorAction Stop
                        if ($response.StatusCode -eq 200) {
                            Write-LogSuccess "Backend ist erreichbar und funktioniert!"
                            Write-LogInfo "Health-Check Response: $($response.Content)"
                            break
                        }
                        else {
                            Write-LogWarning "Health-Check fehlgeschlagen (Versuch $attempt/5) - Status: $($response.StatusCode)"
                        }
                    }
                    catch {
                        Write-LogWarning "Health-Check Verbindungsfehler (Versuch $attempt/5): $($_.Exception.Message)"
                    }
                    
                    if ($attempt -lt 5) {
                        Start-Sleep -Seconds 10
                    }
                }
                
                # Teste Frontend
                Write-LogInfo "Teste Frontend-Verbindung..."
                try {
                    $frontendResponse = Invoke-WebRequest -Uri $APP_URL -Method GET -TimeoutSec 10 -ErrorAction Stop
                    if ($frontendResponse.StatusCode -eq 200) {
                        Write-LogSuccess "Frontend ist erreichbar!"
                    }
                    else {
                        Write-LogWarning "Frontend antwortet mit Status: $($frontendResponse.StatusCode)"
                    }
                }
                catch {
                    Write-LogWarning "Frontend-Verbindung fehlgeschlagen: $($_.Exception.Message)"
                }
            }
            else {
                Write-LogWarning "Konnte App-URL nicht ermitteln"
            }
        }
        catch {
            Write-LogWarning "Fehler beim Abrufen der App-URL: $($_.Exception.Message)"
        }
    }
    else {
        Write-LogError "App nicht gefunden nach Deployment"
        return $false
    }
    
    return $true
}

# App-Status prüfen
function Check-AppStatus {
    Write-Host ""
    Write-LogInfo "App-Status:"
    
    try {
        $output = & doctl apps list --format Name --no-header 2>$null
        $appExists = $output | Where-Object { $_ -match "^$APP_NAME$" }
        
        if ($appExists) {
            Write-Host "App gefunden:"
            & doctl apps list --format "ID,Name,Phase,URL" | Select-String -Pattern "(ID|$APP_NAME)"
            
            $APP_ID = Get-AppId -AppName $APP_NAME
            if ($APP_ID) {
                Write-Host ""
                Write-Host "App-Details:"
                & doctl apps get $APP_ID --format "Name,Phase,URL"
            }
        }
        else {
            Write-Host "App '$APP_NAME' nicht gefunden"
        }
    }
    catch {
        Write-LogError "Fehler beim Abrufen des App-Status: $($_.Exception.Message)"
    }
    
    Write-Host ""
    Write-Host "Alle Apps:"
    & doctl apps list --format "ID,Name,Phase,URL"
}

# Logs anzeigen
function Show-Logs {
    try {
        $output = & doctl apps list --format Name --no-header 2>$null
        $appExists = $output | Where-Object { $_ -match "^$APP_NAME$" }
        
        if ($appExists) {
            $APP_ID = Get-AppId -AppName $APP_NAME
            if (-not $APP_ID) {
                return
            }
            
            Write-Host "Verfügbare Log-Typen:"
            Write-Host "1) Backend Build Logs"
            Write-Host "2) Backend Runtime Logs"
            Write-Host "3) Frontend Build Logs"
            $logChoice = Read-Host "Welche Logs möchten Sie sehen? (1-3)"
            
            switch ($logChoice) {
                "1" {
                    Write-LogInfo "Backend Build Logs:"
                    & doctl apps logs $APP_ID --type BUILD --component backend
                }
                "2" {
                    Write-LogInfo "Backend Runtime Logs:"
                    & doctl apps logs $APP_ID --type RUN --component backend
                }
                "3" {
                    Write-LogInfo "Frontend Build Logs:"
                    & doctl apps logs $APP_ID --type BUILD --component frontend
                }
                default {
                    Write-LogError "Ungültige Auswahl"
                }
            }
        }
        else {
            Write-LogError "App '$APP_NAME' nicht gefunden"
        }
    }
    catch {
        Write-LogError "Fehler beim Anzeigen der Logs: $($_.Exception.Message)"
    }
}

# Hauptausführung
try {
    # Prüfe ob doctl installiert ist
    if (-not (Get-Command doctl -ErrorAction SilentlyContinue)) {
        Write-LogError "doctl ist nicht installiert."
        Write-Host "Installation unter Windows:"
        Write-Host "1. Lade doctl von https://github.com/digitalocean/doctl/releases herunter"
        Write-Host "2. Oder installiere mit Chocolatey: choco install doctl"
        Write-Host "3. Oder installiere mit Scoop: scoop install doctl"
        exit 1
    }

    # Prüfe Authentifizierung
    Write-LogInfo "Prüfe doctl Authentifizierung..."
    & doctl account get >$null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-LogError "doctl ist nicht authentifiziert. Führe aus: doctl auth init"
        exit 1
    }
    Write-LogSuccess "doctl ist authentifiziert"

    # Prüfe ob .do Verzeichnis existiert
    if (-not (Test-Path ".do" -PathType Container)) {
        Write-LogError "Verzeichnis .do nicht gefunden!"
        Write-LogInfo "Erstelle zuerst das Verzeichnis und die app.yaml Datei"
        exit 1
    }

    # Prüfe ob .do/app.yaml existiert
    if (-not (Test-Path ".do/app.yaml" -PathType Leaf)) {
        Write-LogError "Datei .do/app.yaml nicht gefunden!"
        exit 1
    }

    # Menü für Deployment-Optionen
    Write-Host ""
    Write-Host "Wählen Sie eine Option:"
    Write-Host "1) Komplette App deployen (Backend + Frontend)"
    Write-Host "2) Nur Backend deployen"
    Write-Host "3) Nur Frontend deployen"
    Write-Host "4) App-Status prüfen"
    Write-Host "5) App-Logs anzeigen"
    Write-Host "6) Alle Apps anzeigen"
    $choice = Read-Host "Ihre Wahl (1-6)"

    switch ($choice) {
        "1" {
            Write-Host ""
            $result = Deploy-App
            if (-not $result) {
                exit 1
            }
        }
        "2" {
            Write-Host ""
            $result = Deploy-Backend
            if (-not $result) {
                exit 1
            }
        }
        "3" {
            Write-Host ""
            $result = Deploy-Frontend
            if (-not $result) {
                exit 1
            }
        }
        "4" {
            Write-Host ""
            Check-AppStatus
        }
        "5" {
            Write-Host ""
            Show-Logs
        }
        "6" {
            Write-Host ""
            Write-LogInfo "Alle Apps:"
            & doctl apps list
        }
        default {
            Write-LogError "Ungültige Auswahl"
            exit 1
        }
    }

    Write-LogSuccess "Vorgang abgeschlossen! 🎉"
    Write-Host ""
    Write-Host "Nützliche Befehle:"
    Write-Host "- Apps anzeigen: doctl apps list"
    Write-Host "- App-Details: doctl apps get <APP_ID>"
    Write-Host "- Backend-Logs: doctl apps logs <APP_ID> --component backend"
    Write-Host "- Frontend-Logs: doctl apps logs <APP_ID> --component frontend"
    Write-Host "- App löschen: doctl apps delete <APP_ID>"
}
catch {
    Write-LogError "Unerwarteter Fehler: $($_.Exception.Message)"
    exit 1
}