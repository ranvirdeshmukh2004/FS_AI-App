# FS AI Chat — Project Context

> Comprehensive context file for AI-assisted development. Provide this file to any AI tool so it immediately understands the full project.

## Project Overview

Full-stack AI chat platform where users enter their own API keys, select AI providers/models, and chat with streaming responses. Supports chat history, session management, and vector-based memory/semantic search.

**Purpose:** Learning/testing project to demonstrate end-to-end AWS infrastructure skills — design, deploy, configure, and manage a modern AI platform.

**Scope:** Single-user dashboard-style application. No authentication, login, signup, or user management.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Cloud                               │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ CloudFront│───▶│   EC2 (Docker)│    │   RDS PostgreSQL     │  │
│  │   (CDN)   │    │              │───▶│   (Chat/Session DB)  │  │
│  └──────────┘    │  ┌────────┐  │    └──────────────────────┘  │
│                  │  │Frontend │  │                               │
│                  │  │ (Nginx) │  │    ┌──────────────────────┐  │
│                  │  └────┬───┘  │    │   Qdrant (Docker)     │  │
│                  │       │      │    │   (Vector DB)         │  │
│                  │  ┌────▼───┐  │◀──▶│                       │  │
│                  │  │Backend │  │    └──────────────────────┘  │
│                  │  │(Node.js)│  │                               │
│                  │  └────┬───┘  │                               │
│                  │       │      │                               │
│                  │  ┌────▼────┐ │                               │
│                  │  │AI Svc   │ │                               │
│                  │  │(FastAPI)│ │                               │
│                  │  └─────────┘ │                               │
│                  └──────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

### Three-Service Architecture

| Service | Tech | Port | Purpose |
|---------|------|------|---------|
| **frontend** | React + Vite + TypeScript + TailwindCSS | 3000 (dev) / 80 (prod) | Chat UI, settings, session sidebar |
| **backend** | Node.js + Express + TypeScript + Prisma | 4000 | REST API, session/chat management, AI provider routing, streaming |
| **ai-services** | Python + FastAPI | 8000 | Embeddings, vector search, memory/RAG, Qdrant communication |

**Why this split:** Node.js handles HTTP routing, database operations, and SSE streaming efficiently. Python is the ecosystem standard for ML/AI libraries (embeddings, vector operations). Keeping them separate allows independent scaling and deployment.

---

## Tech Stack Decisions

| Choice | Why |
|--------|-----|
| **React + Vite** | Fast HMR, modern bundling, excellent TypeScript support |
| **TailwindCSS** | Utility-first CSS, dark mode built-in, no separate CSS files |
| **Zustand** | Minimal state management, no boilerplate vs Redux |
| **Express** | Mature, widely supported, simple streaming with SSE |
| **Prisma** | Type-safe ORM, auto-generated client, easy migrations |
| **FastAPI** | Async Python, auto-docs, Pydantic validation |
| **Qdrant** | Purpose-built vector DB, easy Docker setup, good Python client |
| **PostgreSQL (RDS)** | Managed, reliable, cost-effective for relational data |

---

## Folder Structure

```
FS_AI-App/
├── frontend/                  # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/          # ChatView, ChatInput, MessageBubble, StreamingBubble
│   │   │   ├── sidebar/       # Sidebar with session list
│   │   │   ├── settings/      # API key management view
│   │   │   └── common/        # ThemeToggle, ModelSelector
│   │   ├── hooks/             # Custom React hooks
│   │   ├── services/          # API client (api.ts)
│   │   ├── stores/            # Zustand state (appStore.ts)
│   │   ├── types/             # TypeScript interfaces
│   │   ├── styles/            # Tailwind entry CSS
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── nginx.conf             # Frontend container Nginx config
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
├── backend/                   # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── config/            # App config, provider definitions
│   │   ├── routes/            # sessions, chat, apiKeys, providers
│   │   ├── services/          # sessionService, apiKeyService, chatService
│   │   ├── middleware/        # Error handler
│   │   ├── prisma/            # Prisma client singleton
│   │   ├── utils/             # Logger (Pino), crypto (AES-256-GCM)
│   │   └── index.ts           # Express entry point
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   ├── Dockerfile
│   └── package.json
│
├── ai-services/               # Python + FastAPI
│   ├── app/
│   │   ├── api/routes/        # memory.py (embed + search endpoints)
│   │   ├── config/            # Pydantic settings
│   │   ├── services/          # embedding_service, vector_service
│   │   ├── models/            # Pydantic schemas
│   │   └── main.py            # FastAPI entry point
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker/
│   └── nginx/                 # Production Nginx reverse proxy config
│
├── scripts/
│   ├── deploy.sh              # EC2 deployment script (SSM)
│   └── setup-ssl.sh           # Let's Encrypt SSL setup
│
├── docker-compose.yml         # Full production stack
├── docker-compose.dev.yml     # Dev databases only (Postgres + Qdrant)
├── PROJECT_CONTEXT.md         # This file
└── .gitignore
```

---

## Database Schema

### PostgreSQL (RDS)

**chat_sessions**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Session identifier |
| title | String | Chat session title (auto-generated from first message) |
| provider | String | AI provider ID (openrouter, groq, xai, openai) |
| model | String | Model ID used in this session |
| created_at | DateTime | Creation timestamp |
| updated_at | DateTime | Last activity timestamp |

**messages**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Message identifier |
| session_id | UUID (FK) | References chat_sessions.id (CASCADE delete) |
| role | Enum | user, assistant, system |
| content | String | Message content |
| tokens | Int? | Token count (optional) |
| created_at | DateTime | Timestamp |

**api_keys**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Key identifier |
| provider | String (UNIQUE) | Provider ID — one key per provider |
| key | String | AES-256-GCM encrypted API key |
| label | String? | Optional user label |
| created_at | DateTime | Timestamp |
| updated_at | DateTime | Timestamp |

**provider_models**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Record identifier |
| provider | String | Provider ID |
| model_id | String | Model identifier |
| name | String | Display name |
| active | Boolean | Whether model is available |

### Qdrant (Vector DB)

**Collection:** `chat_memory`
- Vector size: 1536 (text-embedding-3-small)
- Distance: Cosine similarity
- Payload fields: `text`, `session_id`, custom metadata

---

## API Structure

### Backend API (port 4000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/sessions | List all chat sessions |
| GET | /api/sessions/:id | Get session with messages |
| POST | /api/sessions | Create new session |
| PATCH | /api/sessions/:id/title | Update session title |
| DELETE | /api/sessions/:id | Delete session and messages |
| POST | /api/chat | Send message, receive SSE stream |
| GET | /api/providers | List available providers and models |
| GET | /api/keys | List configured API keys (masked) |
| POST | /api/keys | Add/update an API key |
| DELETE | /api/keys/:provider | Remove an API key |

### AI Services API (port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check (includes Qdrant status) |
| POST | /api/memory/embed | Generate embedding and store in Qdrant |
| POST | /api/memory/search | Semantic search across stored embeddings |

---

## AI Providers

| Provider | Base URL | Key Models |
|----------|----------|------------|
| **OpenRouter** | openrouter.ai/api/v1 | Claude Sonnet 4, Gemini 2.5 Pro, GPT-4o, Llama 4, DeepSeek R1 |
| **Groq** | api.groq.com/openai/v1 | Llama 3.3 70B, Mixtral 8x7B, Gemma 2 9B |
| **xAI (Grok)** | api.x.ai/v1 | Grok 3, Grok 3 Mini |
| **OpenAI** | api.openai.com/v1 | GPT-4o, GPT-4o Mini, o3 Mini |

All providers use OpenAI-compatible `/chat/completions` endpoint with streaming. The backend routes requests to the appropriate provider based on the session's provider setting.

---

## AWS Services

| Service | Purpose | Why |
|---------|---------|-----|
| **EC2** (t3.medium) | Hosts Docker containers (backend, frontend, AI services, Qdrant) | Cost-effective for a single-instance learning project |
| **RDS** (db.t3.micro) | Managed PostgreSQL | Automated backups, patching, no DB admin overhead |
| **S3** | Static frontend assets (optional, alternative to Docker-served frontend) | Cheap, scalable static hosting |
| **CloudFront** | CDN for frontend (pairs with S3) | Low-latency global delivery |
| **Route53** | DNS management | AWS-native, easy integration with ACM/CloudFront |
| **ACM** | Free SSL/TLS certificates | Auto-renewal, works with CloudFront/ALB |
| **IAM** | Roles and permissions | SSM access requires an instance role |
| **CloudWatch** | Logs and monitoring | Container logs, basic alerts |
| **SSM** | EC2 access without SSH | No .pem file needed, browser-based terminal |

### Cost Estimate (Monthly, us-east-1)

| Resource | Estimate |
|----------|----------|
| EC2 t3.medium (on-demand) | ~$30 |
| RDS db.t3.micro (single-AZ) | ~$15 |
| S3 + CloudFront (low traffic) | ~$1-2 |
| Route53 hosted zone | ~$0.50 |
| Data transfer | ~$1-5 |
| **Total** | **~$48-53/month** |

**Cost optimization tips:**
- Use EC2 Savings Plans or Spot Instances for ~60% savings
- RDS db.t3.micro is Free Tier eligible for 12 months
- Stop EC2 when not in use (Qdrant data persists in EBS volume)

---

## SSM Session Manager Setup

Since you have an existing EC2 key pair but no .pem file, use SSM instead of SSH.

### Required IAM Role for EC2

Create an IAM role with these policies attached:
1. **AmazonSSMManagedInstanceCore** — required for SSM Session Manager
2. **CloudWatchAgentServerPolicy** — optional, for CloudWatch logs

### Steps

1. **Create the IAM Role:**
   - Go to IAM > Roles > Create Role
   - Trusted entity: AWS service > EC2
   - Attach policy: `AmazonSSMManagedInstanceCore`
   - Name it: `EC2-SSM-Role`

2. **Attach Role to EC2:**
   - EC2 Console > Select your instance > Actions > Security > Modify IAM Role
   - Select `EC2-SSM-Role` > Update

3. **Ensure SSM Agent is running** (Amazon Linux 2/2023 has it pre-installed):
   ```
   sudo systemctl status amazon-ssm-agent
   sudo systemctl enable amazon-ssm-agent
   sudo systemctl start amazon-ssm-agent
   ```

4. **Connect via browser:**
   - EC2 Console > Select instance > Connect > Session Manager tab > Connect
   - Or: AWS Systems Manager > Session Manager > Start a session

5. **Connect via CLI:**
   ```bash
   aws ssm start-session --target i-your-instance-id
   ```

### Security Group Requirements
Your existing Security Group needs these inbound rules:
- **Port 80** (HTTP) — from 0.0.0.0/0
- **Port 443** (HTTPS) — from 0.0.0.0/0
- **Port 5432** — from EC2 security group only (for RDS)
- SSM does NOT need port 22 open

---

## Environment Variables

### backend/.env
```
PORT=4000
NODE_ENV=production
DATABASE_URL=postgresql://postgres:<password>@<rds-endpoint>:5432/fs_ai_chat
AI_SERVICES_URL=http://ai-services:8000
ENCRYPTION_KEY=<openssl rand -hex 32>
```

### ai-services/.env
```
QDRANT_HOST=qdrant
QDRANT_PORT=6333
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

---

## Deployment Steps

### Local Development

```bash
# 1. Start databases
docker compose -f docker-compose.dev.yml up -d

# 2. Setup backend
cd backend
cp .env.example .env  # edit DATABASE_URL to localhost
npm install
npx prisma db push
npm run dev

# 3. Setup AI services
cd ai-services
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 4. Setup frontend
cd frontend
npm install
npm run dev
```

### AWS Production Deployment

```bash
# 1. Launch EC2 (t3.medium, Amazon Linux 2023)
#    - Use your existing Security Group
#    - Use your existing Key Pair
#    - Attach the EC2-SSM-Role IAM role

# 2. Create RDS PostgreSQL (db.t3.micro)
#    - Same VPC as EC2
#    - Security group allows port 5432 from EC2's SG

# 3. Connect to EC2 via SSM Session Manager (browser or CLI)

# 4. Run deployment
git clone <your-repo-url> ~/fs-ai-app
cd ~/fs-ai-app
bash scripts/deploy.sh

# 5. Configure environment
#    Edit backend/.env with RDS endpoint
#    Run: docker compose exec backend npx prisma db push

# 6. (Optional) Setup SSL
bash scripts/setup-ssl.sh your-domain.com
```

---

## Important Commands

```bash
# Docker
docker compose up -d --build          # Build and start all services
docker compose logs -f backend         # Tail backend logs
docker compose exec backend sh         # Shell into backend container
docker compose down                    # Stop all services

# Database
docker compose exec backend npx prisma db push     # Apply schema
docker compose exec backend npx prisma studio       # Visual DB editor
docker compose exec backend npx prisma migrate dev  # Create migration

# Qdrant
curl http://localhost:6333/collections               # List collections
curl http://localhost:6333/collections/chat_memory    # Collection info

# SSM
aws ssm start-session --target i-<instance-id>       # Connect to EC2
```

---

## Security Considerations

- **API keys are encrypted at rest** using AES-256-GCM before storing in PostgreSQL
- **No authentication** — this is a single-user learning project, not exposed publicly without caution
- **CORS** is configured permissively for development; tighten for production
- **RDS** should only be accessible from the EC2 security group, not publicly
- **SSM** eliminates the need for SSH keys and open port 22
- **Environment variables** are kept in `.env` files (gitignored), not hardcoded

---

## Current Status

- [x] Project architecture designed
- [x] Folder structure created
- [x] Frontend scaffolded (React + Vite + Tailwind + Zustand)
- [x] Backend scaffolded (Express + Prisma + streaming)
- [x] AI services scaffolded (FastAPI + Qdrant)
- [x] Docker setup (Compose + Dockerfiles)
- [x] Nginx reverse proxy config
- [x] Deployment scripts (SSM-based)
- [x] PROJECT_CONTEXT.md created
- [ ] Install dependencies and verify local dev
- [ ] Test full Docker Compose stack
- [ ] Deploy to AWS
- [ ] Configure domain + SSL
- [ ] Add RAG context injection into chat flow
- [ ] Add usage/token tracking

---

## Pending Enhancements

1. **RAG integration in chat flow** — Before sending messages to the AI provider, query Qdrant for relevant context and inject it as a system message
2. **Token usage tracking** — Parse provider responses for token counts, store in messages table
3. **Session auto-titling** — Use the AI to generate a better title after the first exchange
4. **Export/import** — Export chat sessions as JSON or Markdown
5. **S3 + CloudFront frontend** — Alternative to Docker-served frontend for better caching and CDN
