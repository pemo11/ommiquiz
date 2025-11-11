# DigitalOcean App Platform Deployment

## Option 1: DigitalOcean App Platform (Empfohlen)

### Vorteile
- Automatische SSL-Zertifikate
- Automatische Skalierung
- Integrierte CI/CD mit GitHub
- Managed Database-Optionen
- Zero-Downtime Deployments

### Setup Schritte

1. **App Platform Konfigurationsdatei erstellen**
   Erstellen Sie eine `.do/app.yaml` im Projektroot:

```yaml
name: ommiquiz-app
services:
  - name: backend
    source_dir: /backend
    github:
      repo: your-username/ommiquiz
      branch: main
    run_command: uvicorn app.main:app --host 0.0.0.0 --port 8080
    environment_slug: python
    instance_count: 1
    instance_size_slug: basic-xxs
    http_port: 8080
    health_check:
      http_path: /health
    envs:
      - key: PYTHONUNBUFFERED
        value: "1"

  - name: frontend
    source_dir: /frontend
    github:
      repo: your-username/ommiquiz
      branch: main
    build_command: npm run build
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xxs
    http_port: 80
    envs:
      - key: REACT_APP_API_URL
        value: "${backend.PUBLIC_URL}"
    routes:
      - path: /
```

2. **GitHub Repository vorbereiten**
   - Code zu GitHub pushen
   - In DigitalOcean Dashboard: Apps → Create App → GitHub

3. **Kosten**: ~$10-15/Monat für beide Services

## Option 2: DigitalOcean Droplet mit Docker

### Vorteile
- Volle Kontrolle über die Infrastruktur
- Kostengünstiger für dauerhafte Workloads
- Docker Compose bereits vorhanden

### Setup Schritte

1. **Droplet erstellen**
   ```bash
   # Ubuntu 22.04 LTS, mindestens 2GB RAM, $12/Monat
   # Docker One-Click App verwenden
   ```

2. **Deployment-Skript erstellen**:

```bash
#!/bin/bash
# deploy.sh

# Server-Setup
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx

# Repository klonen
git clone https://github.com/your-username/ommiquiz.git
cd ommiquiz

# Umgebungsvariablen setzen
echo "REACT_APP_API_URL=https://your-domain.com/api" > .env

# Docker Compose für Produktion
docker compose -f docker-compose.prod.yml up -d

# Nginx Reverse Proxy konfigurieren
# SSL-Zertifikat mit Let's Encrypt
certbot --nginx -d your-domain.com
```

3. **Production Docker Compose erstellen**:

```yaml
# docker-compose.prod.yml
services:
  backend:
    build: ./backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./backend/flashcards:/app/flashcards
    environment:
      - PYTHONUNBUFFERED=1

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    environment:
      - REACT_APP_API_URL=https://your-domain.com/api
    depends_on:
      - backend
```

4. **Nginx-Konfiguration**:

```nginx
# /etc/nginx/sites-available/ommiquiz
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    # SSL-Konfiguration von Certbot

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

5. **Kosten**: ~$12/Monat für Basic Droplet

## Option 3: DigitalOcean Kubernetes (DOKS)

### Für größere Skalierung und Enterprise-Anforderungen

```yaml
# k8s/ommiquiz-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ommiquiz-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ommiquiz-backend
  template:
    metadata:
      labels:
        app: ommiquiz-backend
    spec:
      containers:
      - name: backend
        image: your-registry/ommiquiz-backend
        ports:
        - containerPort: 8000
        env:
        - name: PYTHONUNBUFFERED
          value: "1"
---
apiVersion: v1
kind: Service
metadata:
  name: ommiquiz-backend-service
spec:
  selector:
    app: ommiquiz-backend
  ports:
  - port: 8000
    targetPort: 8000
  type: ClusterIP
```

7. **Kosten**: ~$30+/Monat für Managed Kubernetes

## Empfehlung für Ihr Projekt

**Für den Start: Option 1 (App Platform)**
- Einfachste Einrichtung
- Automatische SSL, Skalierung, Backups
- Perfekt für MVP und kleinere Anwendungen

**Für Kostenkontrolle: Option 2 (Droplet)**
- Mehr Kontrolle über Kosten
- Gut für stabile Workloads
- Erfordert mehr DevOps-Kenntnisse

Welche Option bevorzugen Sie? Ich kann Ihnen dann detaillierte Schritte für die gewählte Methode bereitstellen.