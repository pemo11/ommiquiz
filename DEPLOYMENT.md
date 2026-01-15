# Deployment Guide for Ommiquiz

## Architecture Overview

The production deployment consists of:
- **Frontend**: React app served by nginx at `https://ommiquiz.de`
- **Backend**: FastAPI service at `https://nanoquiz-backend-ypez6.ondigitalocean.app`
- **Nginx Reverse Proxy**: Routes `/api/*` requests from frontend to backend

## Recent Fix: API Routing

**Problem**: The frontend at `https://ommiquiz.de/api/*` was returning HTML instead of JSON because nginx wasn't configured to proxy API requests to the backend.

**Solution**: Updated `frontend/nginx.conf` to proxy `/api/*` requests to the backend server.

## Deployment Steps

### 1. Rebuild Frontend with Updated Configuration

```bash
cd frontend

# Build with production environment variables
docker build --no-cache -t ommiquiz-frontend:latest .
```

The build will:
- Use `.env.production` which sets `REACT_APP_API_URL=/api`
- Copy the updated `nginx.conf` with API proxy configuration
- Create optimized production build

### 2. Deploy Frontend Container

**Option A: Docker Compose (Recommended)**

```bash
cd /Users/pemo22/2025/Projekte/ommiquiz

# Stop existing containers
docker-compose -f docker-compose.prod.yml down

# Rebuild and start
docker-compose -f docker-compose.prod.yml up --build -d
```

**Option B: Manual Docker Commands**

```bash
# Stop existing frontend
docker stop ommiquiz-frontend-prod
docker rm ommiquiz-frontend-prod

# Run new container
docker run -d \
  --name ommiquiz-frontend-prod \
  --restart unless-stopped \
  -p 3000:80 \
  --network ommiquiz-network \
  ommiquiz-frontend:latest
```

### 3. Verify Deployment

Test that the API proxy is working:

```bash
# Should return JSON, not HTML
curl https://ommiquiz.de/api/version

# Expected response:
# {"api_version":"1.10.0","service_name":"Ommiquiz API","status":"running"}

# Test flashcards endpoint
curl https://ommiquiz.de/api/flashcards | jq '.flashcards | length'

# Should return number of flashcard sets (e.g., 49)
```

### 4. Run Pester Tests

After deployment, validate all API endpoints:

```bash
cd scripts/OmmiQuizApiTesting

# Set authentication tokens (if available)
export OMMIQUIZ_AUTH_TOKEN="your-jwt-token"
export OMMIQUIZ_ADMIN_TOKEN="admin-jwt-token"

# Run all tests
pwsh -Command "Invoke-Pester -Path ./Tests -Output Detailed"
```

Expected results after fix:
- ✅ All public endpoint tests should pass
- ⚠️  Tests requiring authentication will be skipped without tokens
- ❌ No tests should fail due to HTML responses

## Configuration Files

### frontend/nginx.conf
Proxies `/api/*` to `https://nanoquiz-backend-ypez6.ondigitalocean.app`

### frontend/.env.production
Sets `REACT_APP_API_URL=/api` so React uses the local proxy

### docker-compose.prod.yml
Orchestrates both frontend and backend containers

## Troubleshooting

### API Returns HTML Instead of JSON

**Symptom**: `curl https://ommiquiz.de/api/version` returns `<!doctype html>`

**Cause**: nginx not configured to proxy API requests

**Fix**: Rebuild frontend with updated `nginx.conf`

### CORS Errors

**Symptom**: Browser console shows CORS errors

**Cause**: Direct requests to backend without proxy

**Fix**: Ensure `REACT_APP_API_URL=/api` and nginx proxy is working

### Backend Not Responding

**Symptom**: `502 Bad Gateway` or timeout errors

**Cause**: Backend service down or unreachable

**Fix**:
```bash
# Check backend health directly
curl https://nanoquiz-backend-ypez6.ondigitalocean.app/api/health

# If backend is down, check DigitalOcean App Platform dashboard
```

### Cache Issues After Deployment

**Symptom**: Old frontend behavior despite new deployment

**Fix**:
```bash
# Clear browser cache and hard reload (Cmd+Shift+R / Ctrl+Shift+R)

# Check deployed version
curl -I https://ommiquiz.de | grep -i etag
```

## Environment Variables

### Frontend (.env.production)
- `REACT_APP_API_URL`: API endpoint (set to `/api` for proxy)
- `REACT_APP_SUPABASE_URL`: Supabase project URL
- `REACT_APP_SUPABASE_ANON_KEY`: Supabase anonymous key

### Backend
- `DATABASE_URL`: PostgreSQL connection string
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_JWT_SECRET`: JWT verification secret
- `SUPABASE_SERVICE_KEY`: Service role key for admin operations
- S3 configuration (if using S3 for flashcards)

## SSL/HTTPS Setup

The current deployment uses HTTP. To enable HTTPS:

1. Obtain SSL certificate (Let's Encrypt recommended)
2. Update `nginx-production.conf` with SSL configuration
3. Uncomment SSL sections in the config
4. Rebuild and redeploy frontend

## Monitoring

### Health Checks

```bash
# Frontend health
curl https://ommiquiz.de/health

# Backend health
curl https://nanoquiz-backend-ypez6.ondigitalocean.app/api/health
```

### Logs

```bash
# Frontend container logs
docker logs ommiquiz-frontend-prod -f

# Backend container logs (if running locally)
docker logs ommiquiz-backend-prod -f
```

## Rollback Procedure

If deployment causes issues:

```bash
# Tag current image before deploying
docker tag ommiquiz-frontend:latest ommiquiz-frontend:backup

# To rollback
docker stop ommiquiz-frontend-prod
docker rm ommiquiz-frontend-prod
docker run -d --name ommiquiz-frontend-prod -p 3000:80 ommiquiz-frontend:backup
```

## Contact

For deployment issues or questions, refer to the main README.md or create an issue in the repository.
