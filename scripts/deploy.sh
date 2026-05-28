#!/bin/bash
set -euo pipefail

# FS AI App — EC2 Deployment Script
# Run this via SSM Session Manager on your EC2 instance

echo "=== FS AI App Deployment ==="

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    sudo yum update -y
    sudo yum install -y docker
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker ssm-user
    echo "Docker installed. You may need to reconnect for group changes."
fi

# Install Docker Compose plugin if not present
if ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose plugin..."
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d '"' -f 4)
    sudo curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# Install Git if not present
if ! command -v git &> /dev/null; then
    sudo yum install -y git
fi

APP_DIR="/home/ssm-user/fs-ai-app"

if [ -d "$APP_DIR" ]; then
    echo "Updating existing deployment..."
    cd "$APP_DIR"
    git pull
else
    echo "First deployment — clone your repo here:"
    echo "  git clone <your-repo-url> $APP_DIR"
    echo "  cd $APP_DIR"
    echo "Then run this script again."
    exit 0
fi

# Create .env files if they don't exist
if [ ! -f backend/.env ]; then
    echo "Creating backend/.env from template..."
    cp backend/.env.example backend/.env
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    sed -i "s/your_64_char_hex_key_here/$ENCRYPTION_KEY/" backend/.env
    echo "IMPORTANT: Edit backend/.env to set DATABASE_URL with your RDS endpoint"
fi

if [ ! -f ai-services/.env ]; then
    cp ai-services/.env.example ai-services/.env
fi

echo "Building and starting services..."
docker compose up -d --build

echo ""
echo "=== Deployment complete ==="
echo "Services:"
echo "  Frontend:     http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "  Backend API:  port 4000"
echo "  AI Services:  port 8000"
echo "  Qdrant:       port 6333"
echo ""
echo "Next steps:"
echo "  1. Update backend/.env with your RDS DATABASE_URL"
echo "  2. Run: docker compose exec backend npx prisma db push"
echo "  3. Configure your domain in Route53 + nginx config"
