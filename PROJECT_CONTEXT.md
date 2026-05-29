# FS AI Chat — Project Context

> Comprehensive context file for AI-assisted development. Provide this file to any AI tool so it immediately understands the full project.

## Project Overview

Full-stack AI chat platform where users enter their own API keys, select AI providers/models, and chat with streaming responses. Features a ReAct agent with 7 tools, reasoning traces, token tracking, and persistent metrics.

**Purpose:** Learning/testing project to demonstrate end-to-end AWS infrastructure skills — design, deploy, configure, and manage a modern AI platform.

**Scope:** Single-user dashboard-style application. No authentication, login, signup, or user management.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Cloud (ap-south-1)                  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    EC2 (Docker Compose)                   │  │
│  │                                                          │  │
│  │  ┌────────┐   ┌──────────┐   ┌───────────────────────┐ │  │
│  │  │Frontend │──▶│ Backend  │──▶│   AI Services (Python) │ │  │
│  │  │ (Nginx) │   │(Node.js) │   │   ReAct Agent + Tools  │ │  │
│  │  │  :80    │   │  :4000   │   │       :8000            │ │  │
│  │  └────────┘   └────┬─────┘   └───────────────────────┘ │  │
│  │                     │                     │              │  │
│  │              ┌──────▼─────┐       ┌───────▼──────┐      │  │
│  │              │ PostgreSQL │       │   Qdrant     │      │  │
│  │              │   :5432    │       │ :6333/:6334  │      │  │
│  │              └────────────┘       └──────────────┘      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Three-Service Architecture

| Service | Tech | Port | Purpose |
|---------|------|------|---------|
| **frontend** | React + Vite + TypeScript + TailwindCSS | 3000 (dev) / 80 (prod) | Chat UI, settings, session sidebar, reasoning trace |
| **backend** | Node.js + Express + TypeScript + Prisma | 4000 | REST API, session/chat management, AI provider routing, SSE streaming, Anthropic adapter |
| **ai-services** | Python + FastAPI | 8000 | ReAct agent, 7 tools, Anthropic/OpenAI-compatible LLM calls, embeddings, vector search |

---

## AI Providers

| Provider | Base URL | Models | API Format |
|----------|----------|--------|------------|
| **OpenRouter** | openrouter.ai/api/v1 | Claude Sonnet 4, Gemini 2.5 Pro, GPT-4o, Llama 4 Maverick, Llama 4 Scout, DeepSeek R1 | OpenAI-compatible |
| **Groq** | api.groq.com/openai/v1 | Llama 4 Maverick, Llama 4 Scout, Llama 3.3 70B, Mixtral 8x7B, Gemma 2 9B | OpenAI-compatible |
| **xAI (Grok)** | api.x.ai/v1 | Grok 3, Grok 3 Mini | OpenAI-compatible |
| **OpenAI** | api.openai.com/v1 | GPT-4o, GPT-4o Mini, o3 Mini | OpenAI native |
| **Anthropic** | api.anthropic.com/v1 | Claude Sonnet 4, Claude 3.5 Haiku, Claude Opus 4 | Anthropic Messages API (x-api-key, /v1/messages) |

Anthropic uses a different API format — both the backend chatService and the Python ReAct agent detect `anthropic.com` in the URL and switch to the Messages API format automatically.

---

## ReAct Framework

The app includes a ReAct (Reasoning + Acting) agent with 7 tools.

### How it works
1. When "Tools" is enabled in Settings, chat requests route through the ReAct agent
2. The agent sends a system prompt with all tool descriptions to the LLM
3. The LLM can emit `Thought → Action → Action Input` to call a tool
4. The agent executes the tool, returns the `Observation`, and loops
5. Up to 8 tool steps per message; simple questions get direct answers

### Available Tools (all free, no API keys needed)

| Tool | Description | Example Input |
|------|-------------|---------------|
| **web_search** | Search via DuckDuckGo or Google Custom Search | "latest AI news" |
| **wikipedia** | Encyclopedia lookups | "quantum computing" |
| **calculator** | Safe math (ast-based): arithmetic, sqrt, log, trig, factorial | "(45*3) + sqrt(144)" |
| **datetime** | Current time, timezone conversion, date math | "convert EST to IST" |
| **weather** | Current weather via wttr.in (free) | "London" |
| **read_url** | Fetch & extract text from any URL | "https://example.com" |
| **python_executor** | Sandboxed Python (math, statistics, json, re, collections, datetime) | "print(sum(range(100)))" |

### Search Engine Toggle
- **DuckDuckGo** — default, no API key, HTML scraping
- **Google Custom Search** — requires API key + CX ID (entered in Settings UI)
- Falls back to DuckDuckGo if Google credentials missing

### Google Custom Search Setup
1. Google Cloud Console → enable Custom Search API → create API Key
2. Programmable Search Engine → create engine → enable "Search entire web" → copy CX ID
3. Enter both in Settings → ReAct Tools → Google section
4. Free tier: 100 queries/day

### Request Flow
```
Frontend → Backend /api/chat {useTools:true, searchEngine:"duckduckgo"}
  → Backend calls ai-services /api/react/chat with provider credentials
    → ReAct agent calls LLM (OpenAI or Anthropic format)
    → Parses Thought/Action/Action Input
    → Executes tool, feeds Observation back
    → Streams SSE: thinking → tool → observation → chunk → trace → done
  → Backend saves trace as message metadata in PostgreSQL
  → Backend forwards all SSE events to frontend
```

### SSE Event Types
| Type | Description |
|------|-------------|
| thinking | Agent's reasoning (Thought lines) |
| tool | Tool being called ("Using web_search: query") |
| observation | Tool result summary ("web_search returned results (1.2s)") |
| chunk | Final answer content |
| trace | JSON with steps, tool_calls, timing, token counts |
| done | Complete final answer |
| error | Error message |

---

## Metrics & Reasoning Trace (Persisted)

Every assistant message stores its trace in the `metadata` JSON column:

```json
{
  "steps": [
    {"type": "thought", "content": "I need to search...", "duration": 1.5},
    {"type": "action", "tool": "web_search", "input": "latest news"},
    {"type": "observation", "tool": "web_search", "content": "...", "duration": 0.8}
  ],
  "tool_calls": 2,
  "total_time": 4.2,
  "input_tokens": 1500,
  "output_tokens": 800,
  "total_tokens": 2300,
  "db_time": 45
}
```

**Displayed under each response:**
- Total time (seconds)
- Tool call count
- Token breakdown: input / output / total
- Database time (ms)
- Expandable "Reasoning trace" — click to see step-by-step Thought → Action → Observation

**Persisted:** Trace survives page reload, session switching, and days later — it's stored in PostgreSQL alongside the message.

---

## Folder Structure

```
FS_AI-App/
├── frontend/                  # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/          # ChatView, ChatInput, MessageBubble, StreamingBubble
│   │   │   ├── sidebar/       # Sidebar with session list
│   │   │   ├── settings/      # API keys, ReAct tools toggle, Google search config
│   │   │   └── common/        # ThemeToggle, ModelSelector
│   │   ├── services/          # API client (api.ts) — SSE streaming with trace events
│   │   ├── stores/            # Zustand state (appStore.ts)
│   │   ├── types/             # TypeScript interfaces (Message with trace, ReasoningTrace)
│   │   └── styles/            # Tailwind entry CSS
│   ├── Dockerfile             # node:22-alpine build → nginx:alpine serve
│   └── nginx.conf             # SPA + /api/ proxy to backend:4000
│
├── backend/                   # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── config/providers.ts   # 5 providers: OpenRouter, Groq, xAI, OpenAI, Anthropic
│   │   ├── routes/chat.ts        # POST /api/chat — tools/no-tools routing, trace persistence
│   │   ├── services/
│   │   │   ├── chatService.ts    # OpenAI-compatible + Anthropic Messages API streaming
│   │   │   ├── reactService.ts   # Calls ai-services /api/react/chat, forwards SSE
│   │   │   ├── apiKeyService.ts  # AES-256-GCM key encryption
│   │   │   └── sessionService.ts # Prisma CRUD with metadata (trace) support
│   │   └── utils/                # Logger (Pino), crypto
│   ├── prisma/schema.prisma      # Message model has `metadata Json?` for traces
│   └── Dockerfile
│
├── ai-services/               # Python + FastAPI
│   ├── app/
│   │   ├── api/routes/
│   │   │   ├── memory.py      # Embedding + vector search endpoints
│   │   │   └── react.py       # POST /api/react/chat — streaming SSE
│   │   ├── services/
│   │   │   ├── react_agent.py # ReAct loop: LLM → parse → tool → observe → repeat
│   │   │   └── tools/         # 7 tools + web_search (DuckDuckGo/Google)
│   │   │       ├── calculator.py
│   │   │       ├── datetime_tool.py
│   │   │       ├── weather.py
│   │   │       ├── read_url.py
│   │   │       ├── python_executor.py
│   │   │       ├── web_search.py
│   │   │       └── wikipedia.py
│   │   └── main.py
│   └── requirements.txt
│
├── docker-compose.yml         # 5 services: frontend, backend, ai-services, postgres, qdrant
├── docker-compose.dev.yml     # Dev: postgres + qdrant only
└── PROJECT_CONTEXT.md         # This file
```

---

## Database Schema (PostgreSQL)

### Messages table — `metadata` column stores trace
```sql
-- After running: docker compose exec backend npx prisma db push
messages (
  id          UUID PRIMARY KEY,
  session_id  UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        message_role (user/assistant/system),
  content     TEXT,
  tokens      INTEGER,
  metadata    JSONB,          -- ← stores ReasoningTrace for assistant messages
  created_at  TIMESTAMP
)
```

### Other tables
- **chat_sessions** — id, title, provider, model, created_at, updated_at
- **api_keys** — provider (unique), AES-256-GCM encrypted key, label
- **provider_models** — provider, model_id, name, active

---

## API Structure

### Backend (port 4000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/chat | Send message + receive SSE stream. Params: useTools, searchEngine, googleApiKey, googleCx |
| GET | /api/sessions | List sessions |
| GET | /api/sessions/:id | Get session with messages (includes metadata/trace) |
| POST | /api/sessions | Create session |
| PATCH | /api/sessions/:id/title | Update title |
| DELETE | /api/sessions/:id | Delete session |
| GET | /api/providers | List providers with models |
| GET/POST/DELETE | /api/keys | Manage encrypted API keys |
| POST | /api/keys/test | Validate key against provider |

### AI Services (port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| POST | /api/react/chat | ReAct agent — streaming SSE with trace |
| POST | /api/memory/embed | Store embedding in Qdrant |
| POST | /api/memory/search | Semantic search |

---

## Environment Variables

### backend/.env
```
PORT=4000
NODE_ENV=production
DATABASE_URL=postgresql://postgres:localdev123@postgres:5432/fs_ai_chat
AI_SERVICES_URL=http://ai-services:8000
ENCRYPTION_KEY=<openssl rand -hex 32>
```

### ai-services/.env
```
QDRANT_HOST=qdrant
QDRANT_PORT=6333
```

---

## Deployment

### EC2 (current setup)
```bash
cd ~/FS_AI-App
git pull
docker compose up -d --build --force-recreate

# After schema changes:
docker compose exec backend npx prisma db push
```

### Key Infra
- **EC2 IP:** 13.127.237.180 (ap-south-1)
- **Security Group:** BNOVA-Security-Group (ports 22/80/443/8080)
- **Database:** Docker Postgres (local, not RDS — RDS was unreachable)
- **Access:** SSM Session Manager (no .pem file)

---

## Current Status

- [x] Full-stack architecture (React + Express + FastAPI + Docker)
- [x] Chat with SSE streaming (callback pattern, not async generators)
- [x] 5 AI providers: OpenRouter, Groq, xAI, OpenAI, Anthropic
- [x] Anthropic Messages API adapter (both backend + Python agent)
- [x] ReAct agent with 7 tools (all free)
- [x] Search engine toggle (DuckDuckGo/Google) with Google API key input
- [x] Token tracking (input/output/total across all ReAct steps)
- [x] Timing metrics (total, per-step, DB time)
- [x] Reasoning trace — collapsible, persisted in DB
- [x] Metrics persistence — trace survives page reload and session re-open
- [x] Llama 4 Scout + Maverick on both OpenRouter and Groq
- [x] Dark/light mode, session management, API key encryption
- [ ] Domain + SSL (Let's Encrypt)
- [ ] RAG context injection from Qdrant into chat flow
- [ ] File upload for read_file / doc_search tools

---

## Important: After Schema Changes

Since the Prisma schema now has a new `metadata` column on the Message model, you **must** run:

```bash
docker compose exec backend npx prisma db push
```

This adds the `metadata` JSONB column to the existing `messages` table without losing data.
