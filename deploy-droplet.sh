#!/bin/bash

# Ommiquiz DigitalOcean Deployment Script
# Usage: ./deploy-droplet.sh your-domain.com

set -e

DOMAIN=${1:-"your-domain.com"}
APP_DIR="/opt/ommiquiz"
REPO_URL="https://github.com/pemo11/ommiquiz.git"

echo "🚀 Starting Ommiquiz deployment for domain: $DOMAIN"

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install required packages
echo "🔧 Installing Docker, Nginx, and Certbot..."
apt install -y docker.io docker-compose nginx certbot python3-certbot-nginx git curl

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Create app directory
echo "📁 Setting up application directory..."
mkdir -p $APP_DIR
cd $APP_DIR

# Clone or update repository
if [ -d ".git" ]; then
    echo "🔄 Updating existing repository..."
    git pull origin main
else
    echo "📥 Cloning repository..."
    git clone $REPO_URL .
fi

# Set environment variables
echo "⚙️  Configuring environment..."
cat > .env << EOF
REACT_APP_API_URL=https://$DOMAIN/api
DOMAIN=$DOMAIN
EOF

# Build and start containers
echo "🐳 Building and starting Docker containers..."
docker-compose -f docker-compose.prod.yml down || true
docker-compose -f docker-compose.prod.yml up -d --build

# Configure Nginx
echo "🌐 Configuring Nginx reverse proxy..."
cat > /etc/nginx/sites-available/ommiquiz << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL configuration will be added by Certbot
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    
    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support (if needed later)
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:8000/health;
        proxy_set_header Host \$host;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/ommiquiz /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Reload Nginx
systemctl reload nginx

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check if services are running
if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Backend service is healthy"
else
    echo "❌ Backend service failed to start"
    docker-compose -f docker-compose.prod.yml logs backend
    exit 1
fi

if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend service is healthy"
else
    echo "❌ Frontend service failed to start"
    docker-compose -f docker-compose.prod.yml logs frontend
    exit 1
fi

# Obtain SSL certificate
echo "🔒 Obtaining SSL certificate with Let's Encrypt..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# Setup automatic renewal
echo "🔄 Setting up automatic SSL renewal..."
systemctl enable certbot.timer
systemctl start certbot.timer

# Create update script
cat > /opt/ommiquiz/update.sh << EOF
#!/bin/bash
cd /opt/ommiquiz
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build
EOF
chmod +x /opt/ommiquiz/update.sh

# Setup firewall
echo "🔥 Configuring UFW firewall..."
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📋 Summary:"
echo "   Domain: https://$DOMAIN"
echo "   Backend API: https://$DOMAIN/api"
echo "   Health Check: https://$DOMAIN/health"
echo ""
echo "🔧 Management commands:"
echo "   View logs: cd $APP_DIR && docker-compose -f docker-compose.prod.yml logs -f"
echo "   Restart app: cd $APP_DIR && docker-compose -f docker-compose.prod.yml restart"
echo "   Update app: $APP_DIR/update.sh"
echo ""
echo "🔍 Verify deployment:"
echo "   curl https://$DOMAIN/health"
echo "   curl https://$DOMAIN/api/flashcards"
echo ""