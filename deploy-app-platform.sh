#!/bin/bash

# DigitalOcean App Platform Deployment Script
# Bereitet Code für DigitalOcean App Platform vor und pusht zu GitHub

set -e

echo "🚀 Preparing Ommiquiz for DigitalOcean App Platform deployment..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "📁 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit: Ommiquiz flashcard application with upload functionality"
    
    echo "⚠️  Please add your GitHub remote:"
    echo "   git remote add origin https://github.com/pemo11/ommiquiz.git"
    echo "   git push -u origin main"
    exit 0
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Committing latest changes..."
    git add .
    git commit -m "Update for DigitalOcean App Platform deployment - $(date '+%Y-%m-%d %H:%M')"
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
echo "🎉 Ready for DigitalOcean deployment!"
echo ""
echo "📋 Next steps:"
echo "1. Go to DigitalOcean App Platform: https://cloud.digitalocean.com/apps"
echo "2. Click 'Create App'"
echo "3. Select 'GitHub' as source"
echo "4. Choose repository: pemo11/ommiquiz"
echo "5. The .do/app.yaml will be automatically detected"
echo "6. Review and deploy!"
echo ""
echo "🔗 Your app will be available at: https://ommiquiz-app-*.ondigitalocean.app"
echo "   Frontend: https://your-app-url/"
echo "   Backend API: https://your-app-url/api/"
echo "   API Docs: https://your-app-url/api/docs"
echo ""