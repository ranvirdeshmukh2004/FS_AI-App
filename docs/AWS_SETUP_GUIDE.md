# AWS Setup Guide — FS AI Chat

Step-by-step guide to deploy the app on AWS. Uses your existing **BNOVA-Security-Group** and keeps things minimal for a testing project.

Your security group already has these ports open:
- **22** (SSH)
- **80** (HTTP)
- **443** (HTTPS)
- **8080** (custom/API)

That covers everything we need.

---

## Step 1 — Launch EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**

2. Configure:
   - **Name:** `FS-AI-App`
   - **AMI:** Amazon Linux 2023 (free tier eligible)
   - **Instance type:** `t3.medium` (2 vCPU, 4 GB RAM — needed for Docker + Qdrant)
     - `t3.small` works too if you want cheaper, but might be tight on memory
   - **Key pair:** Select your existing key pair (doesn't matter that you don't have the .pem — we'll use SSH since port 22 is open, or Session Manager)
   - **Security group:** Select existing → **BNOVA-Security-Group**
   - **Storage:** 30 GB gp3 (default 8 GB is too small for Docker images)

3. Under **Advanced details** (scroll down on launch page):
   - **IAM instance profile:** Leave as "None" (keeping it simple)
   - If you want SSM Session Manager later, you can attach `AmazonSSMManagedInstanceCore` — but since you have port 22 open, SSH works fine

4. Click **Launch Instance**

5. **Note your instance's Public IPv4 address** — you'll need it

---

## Step 2 — Connect to EC2

Since port 22 is open in your security group, the easiest way:

### Option A: EC2 Instance Connect (no .pem needed)

1. Go to **EC2 → Instances → Select your instance**
2. Click **Connect** (top button)
3. Choose **EC2 Instance Connect** tab
4. Username: `ec2-user`
5. Click **Connect** — opens a browser terminal

### Option B: SSM Session Manager (no .pem needed)

Only works if you attached the IAM role. If you didn't:
1. Go to **IAM → Roles → Create Role**
2. Trusted entity: **AWS service → EC2**
3. Attach policy: `AmazonSSMManagedInstanceCore`
4. Name: `EC2-SSM-Role`
5. Go back to **EC2 → Select instance → Actions → Security → Modify IAM Role**
6. Select `EC2-SSM-Role` → Update
7. Wait 5 minutes, then: **EC2 → Select instance → Connect → Session Manager → Connect**

### Option C: SSH from terminal (if you have any .pem)

```bash
ssh -i your-key.pem ec2-user@<your-ec2-public-ip>
```

**Recommendation: Use Option A (EC2 Instance Connect)** — works immediately in browser, no keys needed.

---

## Step 3 — Install Docker on EC2

Run these commands after connecting:

```bash
# Update system
sudo dnf update -y

# Install Docker
sudo dnf install -y docker
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to docker group (so you don't need sudo)
sudo usermod -aG docker ec2-user

# IMPORTANT: Disconnect and reconnect for group change to take effect
exit
```

Reconnect (same method as Step 2), then:

```bash
# Verify docker works without sudo
docker --version

# Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d '"' -f 4)
sudo curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Verify
docker compose version
```

---

## Step 4 — Install Git & Clone the Repo

```bash
sudo dnf install -y git

git clone https://github.com/ranvirdeshmukh2004/FS_AI-App.git
cd FS_AI-App
```

---

## Step 5 — Create RDS PostgreSQL Database

1. Go to **AWS Console → RDS → Create Database**

2. Configure:
   - **Engine:** PostgreSQL
   - **Version:** PostgreSQL 16.x
   - **Templates:** Free tier (if eligible) or Dev/Test
   - **DB instance identifier:** `fs-ai-db`
   - **Master username:** `postgres`
   - **Master password:** Choose a strong password and **save it**
   - **Instance class:** `db.t3.micro` (cheapest, free tier eligible)
   - **Storage:** 20 GB gp2
   - **Storage autoscaling:** Uncheck (testing project, don't need it)

3. **Connectivity:**
   - **VPC:** Same VPC as your EC2 instance
   - **Public access:** No
   - **VPC security group:** Select existing → **BNOVA-Security-Group**
   - **Availability Zone:** No preference

4. **Additional configuration:**
   - **Initial database name:** `fs_ai_chat`
   - **Automated backups:** Uncheck (testing project)
   - **Encryption:** Uncheck (testing project)

5. Click **Create Database** — takes ~5 minutes

6. Once created, go to the database and **copy the Endpoint** (looks like: `fs-ai-db.xxxxxxx.us-east-1.rds.amazonaws.com`)

---

## Step 6 — Configure Environment Files

Back on your EC2 instance:

```bash
cd ~/FS_AI-App

# Create backend .env
cp backend/.env.example backend/.env
```

Edit the backend .env:

```bash
nano backend/.env
```

Set these values:

```
PORT=4000
NODE_ENV=production
DATABASE_URL=postgresql://postgres:YOUR_RDS_PASSWORD@YOUR_RDS_ENDPOINT:5432/fs_ai_chat
AI_SERVICES_URL=http://ai-services:8000
ENCRYPTION_KEY=PASTE_GENERATED_KEY_HERE
```

Generate the encryption key:

```bash
# Run this, then paste the output into ENCRYPTION_KEY above
openssl rand -hex 32
```

Save and exit nano: `Ctrl+X`, then `Y`, then `Enter`

Now create the AI services .env:

```bash
cp ai-services/.env.example ai-services/.env
```

Edit it:

```bash
nano ai-services/.env
```

Set:

```
QDRANT_HOST=qdrant
QDRANT_PORT=6333
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

Save and exit.

---

## Step 7 — Build & Launch Everything

```bash
cd ~/FS_AI-App

# Build and start all containers (takes 3-5 min first time)
docker compose up -d --build

# Check all 5 containers are running
docker compose ps
```

You should see:

```
NAME              STATUS
fs_ai-app-frontend-1      Up
fs_ai-app-backend-1       Up
fs_ai-app-ai-services-1   Up
fs_ai-app-postgres-1      Up
fs_ai-app-qdrant-1        Up
```

---

## Step 8 — Initialize the Database

```bash
# Push Prisma schema to RDS
docker compose exec backend npx prisma db push

# You should see: "Your database is now in sync with your Prisma schema"
```

---

## Step 9 — Verify It Works

```bash
# Test backend health
curl http://localhost:4000/api/health
# Should return: {"status":"ok","timestamp":"..."}

# Test AI services health
curl http://localhost:8000/api/health
# Should return: {"status":"ok","qdrant_connected":true}

# Test Qdrant
curl http://localhost:6333/collections
# Should return: {"result":{"collections":[]},"status":"ok","time":...}
```

Now open your browser and go to:

```
http://<your-ec2-public-ip>
```

You should see the FS AI Chat interface.

---

## Step 10 — Start Using the App

1. Click **API Key Settings** in the sidebar
2. Select a provider (e.g., OpenRouter, Groq)
3. Paste your API key for that provider
4. Click **Save Key**
5. Go back to chat, select the provider + model from the dropdowns
6. Click **New Chat** and start chatting

---

## Troubleshooting

### Container not starting?

```bash
# Check logs for a specific service
docker compose logs backend
docker compose logs frontend
docker compose logs ai-services

# Restart everything
docker compose down && docker compose up -d --build
```

### Can't connect to RDS?

```bash
# Test from EC2 (install psql first)
sudo dnf install -y postgresql16
psql -h YOUR_RDS_ENDPOINT -U postgres -d fs_ai_chat

# If it fails, check:
# 1. RDS security group allows inbound 5432 from BNOVA-Security-Group
# 2. RDS is in the same VPC as EC2
# 3. RDS is not publicly accessible but EC2 is in the same VPC
```

### Port 80 not responding from browser?

```bash
# Check frontend container is running
docker compose ps frontend

# Check nginx is serving
docker compose logs frontend

# Make sure security group has port 80 open (yours does)
```

### Want to update the code later?

```bash
cd ~/FS_AI-App
git pull
docker compose up -d --build
```

---

## Optional: Set Up a Domain + HTTPS

If you have a domain:

1. Go to **Route53 → Hosted Zones** (or your DNS provider)
2. Create an **A record** pointing to your EC2 public IP
3. Back on EC2:

```bash
cd ~/FS_AI-App

# Install certbot
sudo dnf install -y certbot

# Stop frontend temporarily
docker compose stop frontend

# Get SSL certificate
sudo certbot certonly --standalone -d yourdomain.com --non-interactive --agree-tos --email your@email.com

# Start frontend again
docker compose up -d frontend
```

Then update `docker/nginx/nginx.conf` to uncomment the HTTPS server block and set your domain.

---

## Cost Summary

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t3.medium | ~$30 (on-demand) |
| RDS db.t3.micro | ~$15 (or free if in Free Tier) |
| EBS 30 GB gp3 | ~$2.40 |
| **Total** | **~$33-48/month** |

**To save money:** Stop the EC2 instance when not using it (`Actions → Stop Instance`). RDS keeps running but you can stop it too for up to 7 days at a time.
