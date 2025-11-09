# Deployment Guide

This guide provides detailed instructions for deploying the Ommiquiz application.

## Prerequisites

- Docker 20.x or higher
- Docker Compose V2
- Git

## Quick Start with Docker Compose

1. **Clone the repository**
   ```bash
   git clone https://github.com/pemo11/ommiquiz.git
   cd ommiquiz
   ```

2. **Start the application**
   ```bash
   docker compose up --build
   ```

3. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

4. **Stop the application**
   ```bash
   docker compose down
   ```

## Local Development Setup

### Backend Development

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Create a virtual environment (optional but recommended)**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the backend server**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. **Test the API**
   ```bash
   # From the root directory
   ./test_backend.sh
   ```

### Frontend Development

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

   The app will open at http://localhost:3000

4. **Build for production**
   ```bash
   npm run build
   ```

## Adding Custom Flashcards

1. Create a new YAML file in `backend/flashcards/` directory
2. Follow the flashcard format structure (see README.md)
3. The flashcard will be automatically available in the application

Example flashcard structure:
```yaml
id: my-custom-flashcard
author: Your Name
createDate: 2025-11-09
language: en
level: intermediate
topics:
  - topic1
  - topic2
keywords:
  - keyword1

cards:
  - question: Your question?
    answer: Your answer
    type: single
  
  - question: Question with options?
    answers:
      - Option 1
      - Option 2
      - Option 3
    type: multiple
```

## Environment Variables

### Backend
- `PYTHONUNBUFFERED`: Set to `1` for better logging in Docker

### Frontend
- `REACT_APP_API_URL`: Backend API URL (default: http://localhost:8000)

## Production Deployment

### Docker Compose Production

1. **Update docker-compose.yml** for production:
   - Set proper CORS origins in backend
   - Use environment-specific configuration
   - Add volume mounts for persistent data
   - Configure reverse proxy (nginx/traefik)

2. **Build and run**
   ```bash
   docker compose -f docker-compose.yml up -d
   ```

### Kubernetes Deployment

Create Kubernetes manifests for:
- Backend deployment and service
- Frontend deployment and service
- ConfigMap for flashcards
- Ingress for routing

Example deployment structure:
```
k8s/
├── backend-deployment.yaml
├── backend-service.yaml
├── frontend-deployment.yaml
├── frontend-service.yaml
├── flashcards-configmap.yaml
└── ingress.yaml
```

### Security Considerations

1. **CORS Configuration**: Update `allow_origins` in backend to specific domains
2. **HTTPS**: Use SSL/TLS certificates in production
3. **Input Validation**: Already implemented with regex validation
4. **Path Traversal Protection**: Already implemented with path resolution checks
5. **Rate Limiting**: Consider adding rate limiting for API endpoints

## Troubleshooting

### Backend Issues

**Issue**: Port 8000 already in use
```bash
# Find and kill the process
lsof -ti:8000 | xargs kill -9
```

**Issue**: Module not found
```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

**Issue**: YAML parsing errors
- Check YAML syntax (indentation, quotes)
- Validate YAML at https://www.yamllint.com/

### Frontend Issues

**Issue**: npm install fails
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Issue**: Cannot connect to backend
- Ensure backend is running on port 8000
- Check CORS configuration
- Verify `REACT_APP_API_URL` environment variable

### Docker Issues

**Issue**: Build fails with network errors
- Check internet connection
- Try building without cache: `docker compose build --no-cache`
- Check Docker daemon is running

**Issue**: Container exits immediately
```bash
# Check logs
docker compose logs backend
docker compose logs frontend
```

## Monitoring

### Health Checks

The backend provides a health check endpoint:
```bash
curl http://localhost:8000/health
```

### Logs

View application logs:
```bash
# Docker Compose
docker compose logs -f

# Individual services
docker compose logs -f backend
docker compose logs -f frontend
```

## Performance Optimization

1. **Backend**
   - Use production ASGI server (Gunicorn + Uvicorn)
   - Enable caching for frequently accessed flashcards
   - Optimize YAML parsing with caching

2. **Frontend**
   - Use production build (`npm run build`)
   - Enable gzip compression in nginx
   - Implement lazy loading for large flashcard sets
   - Add service worker for offline support

## Backup and Restore

### Backup Flashcards
```bash
# Create backup
tar -czf flashcards-backup-$(date +%Y%m%d).tar.gz backend/flashcards/

# Restore from backup
tar -xzf flashcards-backup-YYYYMMDD.tar.gz
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/pemo11/ommiquiz/issues
- Documentation: See README.md
