#!/bin/bash

# Schnelles DigitalOcean Deployment
# Usage: ./quick-deploy.sh root@your-droplet-ip your-domain.com

SERVER_IP=${1}
DOMAIN=${2:-"ommiquiz-demo.com"}

if [ -z "$SERVER_IP" ]; then
    echo "Usage: ./quick-deploy.sh root@your-droplet-ip [domain.com]"
    echo "Example: ./quick-deploy.sh root@142.93.123.45 ommiquiz.example.com"
    exit 1
fi

echo "🚀 Deploying Ommiquiz to $SERVER_IP with domain $DOMAIN"

# Copy deployment script to server and execute
scp deploy-droplet.sh $SERVER_IP:/tmp/
ssh $SERVER_IP "chmod +x /tmp/deploy-droplet.sh && /tmp/deploy-droplet.sh $DOMAIN"

echo "✅ Deployment completed!"
echo "🌐 Your app should be available at: https://$DOMAIN"
echo "🔧 SSH to server: ssh $SERVER_IP"