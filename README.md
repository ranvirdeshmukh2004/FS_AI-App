<div align="center">

# 🤖 FS AI Chat

**Full-Stack AI Chat Platform with ReAct Agent, Multi-Provider Support & Vector Memory**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![AWS](https://img.shields.io/badge/AWS-Deployed-FF9900?logo=amazonaws&logoColor=white)](https://aws.amazon.com)

---

A modern, self-hosted AI chat application that lets you bring your own API keys, choose from multiple AI providers, and chat with streaming responses. Features a **ReAct (Reasoning + Acting) agent** with web search and Wikipedia tools, **vector-based semantic memory** via Qdrant, and full **Docker-based deployment** on AWS.

</div>

---

## 📑 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Docker (Full Stack)](#docker-full-stack)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [AI Providers](#-ai-providers)
- [ReAct Agent Framework](#-react-agent-framework)
- [Database Schema](#-database-schema)
- [AWS Deployment](#-aws-deployment)
- [Security](#-security)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Multi-Provider Chat** | Switch between OpenRouter, Groq, xAI (Grok), and OpenAI — all using your own API keys |
| **Real-Time Streaming** | Server-Sent Events (SSE) for live token-by-token responses |
| **ReAct Agent** | Tool-augmented LLM with web search (DuckDuckGo/Google) and Wikipedia integration |
| **Reasoning Trace** | Visual trace panel showing the agent's thinking, tool calls, and observations |
| **Semantic Memory** | Vector-based chat memory using Qdrant for embeddings and similarity search |
| **Session Management** | Create, rename, delete, and switch between chat sessions |
| **Encrypted API Keys** | API keys are encrypted at rest using AES-256-GCM before storage |
| **Dark/Light Mode** | Full theme support with system-aware defaults |
| **Markdown Rendering** | Rich message formatting with syntax-highlighted code blocks |
| **Docker Deployment** | One-command deployment via `docker compose` |
| **AWS-Ready** | Includes EC2 + RDS + Qdrant deployment scripts and guides |

---

## 🏗 Architecture

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

The platform is composed of **three services** running inside Docker containers:

| Service | Tech | Port | Role |
|---------|------|------|------|
| **Frontend** | React + Vite + TypeScript + TailwindCSS | `3000` (dev) / `80` (prod) | Chat UI, settings panel, session sidebar |
| **Backend** | Node.js + Express + TypeScript + Prisma | `4000` | REST API, SSE streaming, session/chat CRUD, API key encryption, provider routing |
| **AI Services** | Python + FastAPI | `8000` | Embeddings, vector search (Qdrant), ReAct agent with tool execution |

**Why this split?** Node.js excels at HTTP routing, database operations, and SSE streaming. Python is the ecosystem standard for ML/AI libraries (embeddings, vector ops, agent frameworks). Separating them allows independent scaling and deployment.

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19, Vite 6, TypeScript 5.8 | UI framework and build tooling |
| **Styling** | TailwindCSS 3.4 | Utility-first CSS with dark mode |
| **State** | Zustand 5 | Lightweight state management |
| **Icons** | Lucide React | Consistent icon system |
| **Markdown** | react-markdown, react-syntax-highlighter | Rich message rendering |
| **Backend** | Express 5, TypeScript | API server and SSE streaming |
| **ORM** | Prisma 6.9 | Type-safe database access with auto-generated client |
| **Validation** | Zod 3 | Runtime schema validation |
| **Logging** | Pino | Structured JSON logging |
| **AI Services** | FastAPI 0.115, Python 3.11+ | Async API for AI/ML operations |
| **Embeddings** | OpenAI `text-embedding-3-small` | 1536-dimension text embeddings |
| **Vector DB** | Qdrant | Cosine similarity search over embeddings |
| **HTTP** | httpx | Async HTTP client for LLM and tool calls |
| **Database** | PostgreSQL 16 (RDS) | Chat sessions, messages, API keys |
| **Containers** | Docker Compose | Multi-service orchestration |
| **Reverse Proxy** | Nginx | Production frontend serving and API routing |
| **Cloud** | AWS (EC2, RDS, S3, CloudFront, Route53, ACM) | Production infrastructure |

---

## 📁 Project Structure

```
FS_AI-App/
├── frontend/                      # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/              # ChatView, ChatInput, MessageBubble, StreamingBubble
│   │   │   ├── sidebar/           # Session list sidebar
│   │   │   ├── settings/          # API key management, provider config, tool toggles
│   │   │   └── common/            # ThemeToggle, ModelSelector
│   │   ├── services/              # API client (api.ts)
│   │   ├── stores/                # Zustand state management (appStore.ts)
│   │   ├── types/                 # TypeScript interfaces
│   │   └── styles/                # Tailwind entry CSS
│   ├── Dockerfile                 # Multi-stage build → Nginx
│   ├── nginx.conf                 # Frontend container Nginx config
│   └── package.json
│
├── backend/                       # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── config/                # App config, provider definitions (OpenRouter, Groq, xAI, OpenAI)
│   │   ├── routes/                # sessions, chat (SSE), apiKeys, providers
│   │   ├── services/              # sessionService, chatService, reactService, apiKeyService
│   │   ├── middleware/            # Global error handler
│   │   ├── prisma/                # Prisma client singleton
│   │   └── utils/                 # Logger (Pino), crypto (AES-256-GCM)
│   ├── prisma/
│   │   └── schema.prisma          # Database schema (4 models)
│   ├── Dockerfile
│   └── package.json
│
├── ai-services/                   # Python + FastAPI
│   ├── app/
│   │   ├── api/routes/            # memory.py, react.py (ReAct agent endpoint)
│   │   ├── config/                # Pydantic settings
│   │   ├── services/
│   │   │   ├── react_agent.py     # ReAct loop with tool parsing and trace events
│   │   │   ├── embedding_service.py
│   │   │   ├── vector_service.py  # Qdrant operations
│   │   │   └── tools/             # web_search.py (DuckDuckGo/Google), wikipedia.py
│   │   └── models/                # Pydantic schemas
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker/
│   └── nginx/nginx.conf           # Production reverse proxy config
│
├── scripts/
│   ├── deploy.sh                  # EC2 deployment script (Docker + SSM)
│   └── setup-ssl.sh               # Let's Encrypt SSL setup
│
├── docs/
│   └── AWS_SETUP_GUIDE.md         # Step-by-step AWS deployment guide
│
├── docker-compose.yml             # Full production stack (5 services)
├── docker-compose.dev.yml         # Dev databases only (Postgres + Qdrant)
├── PROJECT_CONTEXT.md             # Detailed project context for AI tools
└── .gitignore
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.11+ and **pip**
- **Docker** and **Docker Compose** (for databases / full deployment)
- An API key from at least one supported provider (OpenRouter, Groq, xAI, or OpenAI)

### Local Development

**1. Start databases**

```bash
docker compose -f docker-compose.dev.yml up -d
```

This launches PostgreSQL (port 5432) and Qdrant (port 6333).

**2. Setup backend**

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL to: postgresql://postgres:localdev123@localhost:5432/fs_ai_chat
# Generate ENCRYPTION_KEY: openssl rand -hex 32

npm install
npx prisma db push     # Apply schema to database
npm run dev             # Starts on port 4000
```

**3. Setup AI services**

```bash
cd ai-services
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**4. Setup frontend**

```bash
cd frontend
cp .env.example .env
npm install
npm run dev             # Starts on port 3000
```

**5. Open the app**

Navigate to `http://localhost:3000`, go to **Settings**, add your API key for a provider, and start chatting.

### Docker (Full Stack)

To run the entire platform in Docker:

```bash
# Build and start all 5 services
docker compose up -d --build

# Initialize the database
docker compose exec backend npx prisma db push

# Open http://localhost in your browser
```

---

## 🔐 Environment Variables

### `backend/.env`

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment | `development` or `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:pass@localhost:5432/fs_ai_chat` |
| `AI_SERVICES_URL` | AI services base URL | `http://localhost:8000` |
| `ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM encryption | Generate with `openssl rand -hex 32` |

### `ai-services/.env`

| Variable | Description | Default |
|----------|-------------|---------|
| `QDRANT_HOST` | Qdrant hostname | `localhost` (Docker: `qdrant`) |
| `QDRANT_PORT` | Qdrant port | `6333` |
| `EMBEDDING_MODEL` | OpenAI embedding model | `text-embedding-3-small` |
| `EMBEDDING_DIMENSIONS` | Embedding vector size | `1536` |

### `frontend/.env`

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:4000` |

---

## 📡 API Reference

### Backend API (port 4000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/sessions` | List all chat sessions |
| `GET` | `/api/sessions/:id` | Get session with messages |
| `POST` | `/api/sessions` | Create new session |
| `PATCH` | `/api/sessions/:id/title` | Update session title |
| `DELETE` | `/api/sessions/:id` | Delete session and all messages |
| `POST` | `/api/chat` | Send message → receive SSE stream (supports `useTools` + `searchEngine` params) |
| `GET` | `/api/providers` | List available providers and models |
| `GET` | `/api/keys` | List configured API keys (masked) |
| `POST` | `/api/keys` | Add or update an API key |
| `DELETE` | `/api/keys/:provider` | Remove an API key |

### AI Services API (port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (includes Qdrant connection status) |
| `POST` | `/api/memory/embed` | Generate embedding and store in Qdrant |
| `POST` | `/api/memory/search` | Semantic similarity search across stored embeddings |
| `POST` | `/api/react/chat` | ReAct agent endpoint — tool-augmented chat with streaming SSE |

---

## 🤝 AI Providers

All providers use the OpenAI-compatible `/chat/completions` endpoint with streaming. Add your API key in the Settings panel to enable a provider.

| Provider | Base URL | Models |
|----------|----------|--------|
| **OpenRouter** | `openrouter.ai/api/v1` | Claude Sonnet 4, Gemini 2.5 Pro, GPT-4o, Llama 4 Maverick, DeepSeek R1 |
| **Groq** | `api.groq.com/openai/v1` | Llama 3.3 70B, Mixtral 8x7B, Gemma 2 9B |
| **xAI (Grok)** | `api.x.ai/v1` | Grok 3, Grok 3 Mini |
| **OpenAI** | `api.openai.com/v1` | GPT-4o, GPT-4o Mini, o3 Mini |

---

## 🧠 ReAct Agent Framework

The app includes a **ReAct (Reasoning + Acting)** agent that gives LLMs access to external tools during conversation.

### How It Works

1. When **"Tools"** is enabled in Settings, chat requests route through the ReAct agent
2. The agent injects a system prompt describing available tools and the `Thought → Action → Observation` format
3. If the LLM decides to use a tool, it emits `Action: tool_name` and `Action Input: query`
4. The agent parses this, executes the tool, and feeds the result back as an `Observation`
5. The LLM can chain up to **6 tool calls** before producing a `Final Answer`
6. For simple questions, the LLM responds directly without tools

### Available Tools

| Tool | Description |
|------|-------------|
| **web_search** | Search the web via DuckDuckGo (default) or Google Custom Search API |
| **wikipedia** | Search Wikipedia for encyclopedic information |

### Request Flow

```
Frontend → Backend POST /api/chat { useTools: true, searchEngine: "duckduckgo" }
  → Backend calls AI Services POST /api/react/chat (with provider credentials)
    → ReAct agent calls LLM → parses tool calls → executes tools → loops
    → Streams SSE events: thinking → tool → observation → chunk → trace → done
  → Backend forwards SSE to frontend
```

### SSE Event Types

| Type | Description |
|------|-------------|
| `thinking` | Agent's reasoning (Thought lines) |
| `tool` | Tool being called with query |
| `observation` | Summarized tool result with timing |
| `chunk` | Final answer content |
| `trace` | Complete reasoning trace (steps, tool count, timing) |
| `done` | Signals completion with full final answer |
| `error` | Error message |

---

## 🗄 Database Schema

### PostgreSQL (via Prisma)

**4 models** defined in `backend/prisma/schema.prisma`:

```
ChatSession     Message         ApiKey          ProviderModel
─────────────   ─────────────   ─────────────   ─────────────
id (UUID PK)    id (UUID PK)    id (UUID PK)    id (UUID PK)
title           session_id FK   provider (UQ)   provider
provider        role (enum)     key (encrypted) model_id
model           content         label           name
created_at      tokens          created_at      active
updated_at      created_at      updated_at
```

- `ChatSession ←→ Message`: One-to-many with cascade delete
- `ApiKey.provider`: Unique — one key per provider
- `ApiKey.key`: AES-256-GCM encrypted at rest
- `MessageRole` enum: `user | assistant | system`

### Qdrant (Vector DB)

- **Collection:** `chat_memory`
- **Vector Size:** 1536 (`text-embedding-3-small`)
- **Distance Metric:** Cosine similarity
- **Payload Fields:** `text`, `session_id`, custom metadata

---

## ☁️ AWS Deployment

The app is designed for deployment on AWS using EC2 + RDS + Docker.

### Infrastructure

| Service | Purpose | Spec |
|---------|---------|------|
| **EC2** | Docker host (frontend, backend, AI services, Qdrant) | `t3.medium` (2 vCPU, 4 GB) |
| **RDS** | Managed PostgreSQL | `db.t3.micro` |
| **S3 + CloudFront** | (Optional) Static frontend CDN | — |
| **Route53** | DNS management | — |
| **ACM** | SSL/TLS certificates | — |
| **SSM** | EC2 access without SSH keys | — |

### Quick Deploy

```bash
# 1. Launch EC2 (t3.medium, Amazon Linux 2023)
# 2. Create RDS PostgreSQL (db.t3.micro, same VPC)
# 3. Connect via EC2 Instance Connect or SSM

git clone <your-repo-url> ~/fs-ai-app
cd ~/fs-ai-app
bash scripts/deploy.sh

# 4. Edit backend/.env with your RDS endpoint
# 5. docker compose exec backend npx prisma db push
# 6. (Optional) bash scripts/setup-ssl.sh your-domain.com
```

### Cost Estimate (~$33–53/month)

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t3.medium | ~$30 |
| RDS db.t3.micro | ~$15 (Free Tier eligible) |
| EBS 30 GB gp3 | ~$2.40 |
| S3 + CloudFront (low traffic) | ~$1–2 |

> 💡 **Save money:** Stop EC2 when not in use. Use Savings Plans or Spot Instances for ~60% savings.

For the full step-by-step guide, see [`docs/AWS_SETUP_GUIDE.md`](docs/AWS_SETUP_GUIDE.md).

---

## 🔒 Security

- **API Key Encryption** — Keys are encrypted at rest using AES-256-GCM with a server-side `ENCRYPTION_KEY`
- **No Authentication** — This is a single-user learning/testing project; add auth before public exposure
- **CORS** — Configured permissively in dev; tighten `origin` for production
- **RDS Access** — Restricted to EC2 security group only (not publicly accessible)
- **SSM** — Eliminates the need for SSH keys and open port 22
- **Environment Files** — `.env` files are gitignored; secrets never committed

---

## 🗺 Roadmap

- [x] Multi-provider chat with SSE streaming
- [x] ReAct agent with web search + Wikipedia tools
- [x] Reasoning trace panel in UI
- [x] Search engine toggle (DuckDuckGo / Google)
- [x] Docker Compose deployment
- [x] AWS EC2 + RDS deployment
- [ ] RAG context injection — Query Qdrant before each chat for relevant context
- [ ] Token usage tracking — Parse provider responses, store in messages table
- [ ] Session auto-titling — Generate better titles after first exchange
- [ ] Export/Import — Export chat sessions as JSON or Markdown
- [ ] S3 + CloudFront frontend — CDN-served static assets
- [ ] Google Custom Search API — Server-side configuration

---

## 📜 License

This project is for learning and demonstration purposes. No license specified.

---

<div align="center">

**Built to learn AWS infrastructure, full-stack architecture, and AI agent design.**

</div>

