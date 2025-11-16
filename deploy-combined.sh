#!/bin/bash

# DigitalOcean App Platform Combined Deployment Script
# Deploys both backend and frontend together in a single app (more cost-effective)

set -e

echo "🚀 Preparing Ommiquiz for combined DigitalOcean App Platform deployment..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "📁 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit: Ommiquiz flashcard application with combined deployment"
    
    echo "⚠️  Please add your GitHub remote:"
    echo "   git remote add origin https://github.com/pemo11/ommiquiz.git"
    echo "   git push -u origin main"
    exit 0
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Committing latest changes..."
    git add .
    git commit -m "Update for combined DigitalOcean deployment - $(date '+%Y-%m-%d %H:%M')"
fi

# Push to GitHub
echo "⬆️  Pushing to GitHub..."
if git remote | grep -q origin; then
    git push origin main
    echo "✅ Code pushed successfully!"
else
    echo "⚠️  No GitHub remote found. Please add your remote:"
    echo "   git remote add origin https://github.com/pemo11/ommiquiz.git"
    echo "   git push -u origin main"
    exit 1
fi

echo ""
echo "🎉 Ready for combined DigitalOcean deployment!"
echo ""
echo "💰 COMBINED DEPLOYMENT (Cost-effective - Single App):"
echo ""
echo "📋 Deployment Steps:"
echo ""
echo "1️⃣  Go to: https://cloud.digitalocean.com/apps"
echo "2️⃣  Create App → GitHub → pemo11/ommiquiz"
echo "3️⃣  Source Directory: / (root directory)"
echo "4️⃣  Use app.yaml configuration file"
echo "5️⃣  Deploy"
echo ""
echo "🔧 Configuration:"
echo "   - File: app.yaml (combined frontend + backend)"
echo "   - Backend routes: /api/*"
echo "   - Frontend routes: /* (everything else)"
echo "   - Single URL for entire application"
echo ""
echo "✅ Benefits of combined deployment:"
echo "   ✅ Lower cost (single app vs two apps)"
echo "   ✅ No CORS issues"
echo "   ✅ Single domain/URL"
echo "   ✅ Simplified routing"
echo "   ✅ Easier management"
echo ""
echo "📱 After deployment, your app will be available at:"
echo "   - Frontend: https://your-app-name.ondigitalocean.app/"
echo "   - API: https://your-app-name.ondigitalocean.app/api/"
echo "   - Health Check: https://your-app-name.ondigitalocean.app/api/health"
echo ""