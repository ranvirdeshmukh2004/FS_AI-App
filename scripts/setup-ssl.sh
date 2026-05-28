#!/bin/bash
set -euo pipefail

# SSL Setup with Let's Encrypt (run on EC2 via SSM)

DOMAIN="${1:?Usage: ./setup-ssl.sh your-domain.com}"

echo "=== SSL Setup for $DOMAIN ==="

# Install certbot
if ! command -v certbot &> /dev/null; then
    sudo yum install -y certbot
fi

# Stop nginx temporarily for standalone verification
docker compose stop frontend

# Get certificate
sudo certbot certonly --standalone \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "admin@$DOMAIN"

# Update nginx config with your domain
sed -i "s/your-domain.com/$DOMAIN/g" docker/nginx/nginx.conf

# Uncomment HTTPS block and HTTP redirect
sed -i 's/# return 301/return 301/' docker/nginx/nginx.conf
sed -i '/^# server {$/,/^# }$/ s/^# //' docker/nginx/nginx.conf

# Restart with SSL
docker compose up -d --build frontend

echo "SSL configured for $DOMAIN"
echo "Set up auto-renewal: sudo crontab -e"
echo "Add: 0 0 * * * certbot renew --quiet && docker compose restart frontend"
