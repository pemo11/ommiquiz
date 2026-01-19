#!/bin/bash
# Initialize MinIO and upload flashcards

set -e

echo "🔧 Waiting for MinIO to be ready..."
until curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; do
  echo "Waiting for MinIO..."
  sleep 2
done

echo "✅ MinIO is ready!"

# Install MinIO client if not present
if ! command -v mc &> /dev/null; then
    echo "📦 Installing MinIO client..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install minio/stable/mc
    else
        wget https://dl.min.io/client/mc/release/linux-amd64/mc
        chmod +x mc
        sudo mv mc /usr/local/bin/
    fi
fi

echo "🔗 Configuring MinIO client..."
mc alias set local http://localhost:9000 minioadmin minioadmin

echo "📦 Creating flashcards bucket..."
mc mb local/flashcards --ignore-existing

echo "📤 Uploading existing flashcards..."
if [ -d "./backend/flashcards" ]; then
    mc cp --recursive ./backend/flashcards/ local/flashcards/
    echo "✅ Flashcards uploaded successfully!"
else
    echo "⚠️  No local flashcards directory found. Skipping upload."
fi

echo "🎉 MinIO initialization complete!"
echo ""
echo "MinIO Console: http://localhost:9001"
echo "Username: minioadmin"
echo "Password: minioadmin"
