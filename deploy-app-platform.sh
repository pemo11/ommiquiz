#!/bin/bash

# DigitalOcean App Platform Deployment Script - Separate Apps
# Bereitet Code für separates Backend/Frontend Deployment vor

set -e

echo "🚀 Preparing Ommiquiz for separate DigitalOcean App Platform deployment..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "📁 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit: Ommiquiz flashcard application with separate deployment"
    
    echo "⚠️  Please add your GitHub remote:"
    echo "   git remote add origin https://github.com/pemo11/ommiquiz.git"
    echo "   git push -u origin main"
    exit 0
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Committing latest changes..."
    git add .
    git commit -m "Update for separate DigitalOcean deployment - $(date '+%Y-%m-%d %H:%M')"
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
echo "🎉 Ready for separate DigitalOcean deployment!"
echo ""
echo "📋 Deployment Steps (Backend zuerst, dann Frontend):"
echo ""
echo "1️⃣  BACKEND DEPLOYMENT:"
echo "   - Go to: https://cloud.digitalocean.com/apps"
echo "   - Create App → GitHub → pemo11/ommiquiz"
echo "   - Source Directory: /backend"
echo "   - Use backend-app.yaml configuration"
echo "   - Deploy and note the backend URL"
echo ""
echo "2️⃣  FRONTEND DEPLOYMENT:"
echo "   - Create another App → GitHub → pemo11/ommiquiz"
echo "   - Source Directory: /frontend"
echo "   - Update REACT_APP_API_URL with backend URL"
echo "   - Use frontend-app.yaml configuration"
echo "   - Deploy"
echo ""
echo "🔧 Configuration Files:"
echo "   - Backend: backend-app.yaml"
echo "   - Frontend: frontend-app.yaml"
echo ""
echo "📝 Don't forget to update REACT_APP_API_URL in frontend deployment!"
echo ""