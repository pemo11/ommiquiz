# OmmiQuiz Supabase Auth Fix - Checkliste

## Problem
"Invalid Key" Fehler bei der Authentifizierung zwischen Frontend und Backend.

## Ursachen gefunden:

### 1. Backend (.env)
- ❌ Verwendet `REACT_APP_SUPABASE_KEY` (Frontend-Variable!)
- ❌ Sollte `SUPABASE_PUBLISHABLE_KEY` sein

### 2. Frontend (.env.production)
- ❌ `REACT_APP_SUPABASE_KEY=df370f34-2c1d-471e-a126-71d6720ebcfd`
- ❌ Das ist eine UUID, KEIN gültiger Supabase Key!
- ✅ Sollte sein: `sb_publishable_...` (Publishable Key)

### 3. Code-Änderungen erforderlich

#### Backend: app/main.py
**Aktuell (FALSCH):**
```python
supabase_key = os.getenv("REACT_APP_SUPABASE_KEY")
```

**Sollte sein:**
```python
supabase_publishable_key = os.getenv("SUPABASE_PUBLISHABLE_KEY")
```

## Fix-Schritte

### 1. Backend .env erstellen/aktualisieren
```bash
cd C:\Users\pemo24\Projekte\ommiquiz\backend
```

Erstellen Sie eine `.env` Datei mit:
```env
# Supabase Configuration
SUPABASE_URL=https://zihxfkwzlxgpppzddfyb.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_IHR_KEY_HIER
```

### 2. Frontend .env.production aktualisieren
```env
# Supabase Configuration
REACT_APP_SUPABASE_URL=https://zihxfkwzlxgpppzddfyb.supabase.co
REACT_APP_SUPABASE_KEY=sb_publishable_IHR_KEY_HIER
```

**WICHTIG**: Ersetzen Sie `IHR_KEY_HIER` mit dem echten Publishable Key aus Supabase!
- Dashboard → Project Settings → API → Publishable anon key
- Beginnt mit `sb_publishable_...`

### 3. Backend Code aktualisieren

Alle Vorkommen von `REACT_APP_SUPABASE_KEY` durch `SUPABASE_PUBLISHABLE_KEY` ersetzen.

Betroffene Dateien:
- `backend/app/main.py` (Zeile 163, 220, und weitere)
- Alle anderen Python-Dateien, die den Key verwenden

### 4. .env.example Dateien aktualisieren

#### backend/.env.example
```env
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

#### frontend/.env.example
```env
# Supabase Configuration
REACT_APP_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
REACT_APP_SUPABASE_KEY=sb_publishable_your_key_here
```

### 5. DigitalOcean Umgebungsvariablen aktualisieren

In der DigitalOcean App Platform:

**Backend:**
- `SUPABASE_URL` → `https://zihxfkwzlxgpppzddfyb.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` → `sb_publishable_...`

**Frontend:**
- `REACT_APP_SUPABASE_URL` → `https://zihxfkwzlxgpppzddfyb.supabase.co`
- `REACT_APP_SUPABASE_KEY` → `sb_publishable_...`

### 6. Deployment

Nach den Änderungen:
```bash
git add .
git commit -m "Fix: Use correct Supabase Publishable Key"
git push origin main
```

DigitalOcean wird automatisch neu deployen.

## Wichtige Erkenntnisse

✅ **NUR der Publishable Key wird benötigt!**
- Format: `sb_publishable_xxxxx`
- NICHT der Anon JWT Key
- NICHT der Secret Key
- NICHT der Service Role Key
- NICHT eine UUID oder andere ID

❌ **Häufige Fehler:**
- Verwendung einer Projekt-UUID statt des Keys
- Mischen von Frontend/Backend Variablennamen
- Verwendung des alten JWT Anon Keys

## Testen

Nach dem Fix:
```powershell
# Frontend Login testen
# Im Browser: DevTools → Network → Supabase requests prüfen

# Backend testen
curl -X POST https://ihre-backend-url.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123","username":"testuser"}'
```
