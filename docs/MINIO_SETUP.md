# MinIO Setup for Persistent Flashcard Storage

This setup uses MinIO (S3-compatible object storage) to persist flashcard updates across deployments.

## What's Included

- **MinIO Server**: S3-compatible storage running in Docker
- **Persistent Volume**: `minio-data` volume for data persistence
- **Backend Configuration**: Automatically uses MinIO for flashcard storage

## Quick Start

### 1. Start the Services

```bash
docker-compose up -d
```

This will start:
- MinIO server on ports 9000 (API) and 9001 (Console)
- Backend configured to use MinIO
- Frontend

### 2. Initialize MinIO and Upload Existing Flashcards

```bash
./scripts/init-minio.sh
```

This script will:
- Wait for MinIO to be ready
- Create the `flashcards` bucket
- Upload all existing flashcards from `./backend/flashcards/`

### 3. Access MinIO Console

Open http://localhost:9001 in your browser:
- **Username**: `minioadmin`
- **Password**: `minioadmin`

## How It Works

### Local Development (docker-compose)

The backend uses MinIO for storage:
- **Endpoint**: `http://minio:9000`
- **Bucket**: `flashcards`
- **Access**: minioadmin / minioadmin

All flashcard updates through the Admin Panel are saved to MinIO and persist across container restarts.

### Production (DigitalOcean App Platform)

For production, you have two options:

#### Option A: Deploy MinIO Separately

1. Deploy MinIO on a DigitalOcean Droplet or Container
2. Update `.do/app.yaml` with MinIO credentials
3. Run the init script to migrate flashcards

#### Option B: Use DigitalOcean Spaces

Update `.do/app.yaml`:
```yaml
- key: FLASHCARDS_STORAGE
  value: "s3"
- key: AWS_ACCESS_KEY_ID
  value: "YOUR_SPACES_KEY"
  type: SECRET
- key: AWS_SECRET_ACCESS_KEY
  value: "YOUR_SPACES_SECRET"
  type: SECRET
- key: AWS_S3_BUCKET
  value: "your-bucket-name"
- key: AWS_S3_ENDPOINT_URL
  value: "https://nyc3.digitaloceanspaces.com"
- key: AWS_S3_REGION
  value: "nyc3"
```

## Environment Variables

The backend automatically detects these variables in docker-compose.yml:

```yaml
FLASHCARDS_STORAGE=s3              # Use S3 storage
AWS_ACCESS_KEY_ID=minioadmin       # MinIO access key
AWS_SECRET_ACCESS_KEY=minioadmin   # MinIO secret key
AWS_S3_BUCKET=flashcards          # Bucket name
AWS_S3_ENDPOINT_URL=http://minio:9000  # MinIO endpoint
AWS_S3_REGION=us-east-1           # Region (required)
```

## Troubleshooting

### No flashcards showing up?

1. Check MinIO is running:
   ```bash
   docker-compose ps
   ```

2. Run the init script again:
   ```bash
   ./scripts/init-minio.sh
   ```

3. Check MinIO Console at http://localhost:9001

### Backend can't connect to MinIO?

Check the backend logs:
```bash
docker-compose logs backend
```

### Reset everything?

```bash
docker-compose down -v  # Removes volumes
docker-compose up -d
./scripts/init-minio.sh
```

## Benefits

✅ **Persistent Updates**: Flashcard changes survive container restarts
✅ **Same Storage for Dev & Prod**: Use MinIO locally, Spaces in production
✅ **No Git Commits**: Update flashcards without committing to Git
✅ **S3 Compatible**: Easy migration to any S3-compatible storage
