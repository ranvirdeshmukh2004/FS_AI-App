<div align="center">

# FS AI Chat

**A multi-provider AI chat platform with a ReAct agent, PDF retrieval, and vector memory.**

[![CI](https://github.com/ranvirdeshmukh2004/FS_AI-App/actions/workflows/ci.yml/badge.svg)](https://github.com/ranvirdeshmukh2004/FS_AI-App/actions/workflows/ci.yml)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Express 5](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Bring your own API key, pick a model from any of five providers, and chat with
streaming responses — or hand the model a set of tools and watch it reason its
way to an answer. Upload a PDF and ask questions about it. Run it entirely on
your own machine against a local Ollama model, with no cloud provider at all.

</div>

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [How the ReAct agent works](#how-the-react-agent-works)
- [Tech stack](#tech-stack)
- [Running it locally](#running-it-locally)
- [Deploying it for free](#deploying-it-for-free)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Security model](#security-model)
- [Known limits](#known-limits)
- [Project layout](#project-layout)
- [License](#license)

---

## What it does

| | |
|---|---|
| **Five providers, one interface** | OpenRouter, Groq, xAI, OpenAI and Anthropic, plus local Ollama models and any OpenAI-compatible endpoint you host yourself. Switch mid-conversation. |
| **Streaming responses** | Server-Sent Events, token by token. Closing the tab aborts the upstream request so you stop paying for output nobody will read. |
| **ReAct agent** | A reason–act–observe loop with seven tools enabled by default — web search, Wikipedia, a calculator, URL reading, weather, date/time and document search — plus an opt-in Python executor. Every step is captured in a trace you can expand. |
| **PDF retrieval** | Upload a document; it is chunked, embedded and stored in Qdrant. The agent searches it as a tool. Works without an embedding key via a local hash fallback. |
| **Vector memory** | Conversation turns are embedded so the agent can recall earlier context semantically rather than by recency alone. |
| **Runs fully offline** | Point it at Ollama and nothing leaves your machine — no API key, no provider, no network. |
| **Bring your own key** | On a public deployment, keys live in the visitor's browser for the life of the tab. The server stores nothing. |

---

## Architecture

```
                    ┌──────────────────────────────┐
   Browser  ──────► │  React 19 + Vite  (frontend) │
                    │  Zustand · Tailwind          │
                    └───────────────┬──────────────┘
                                    │  JSON + SSE
                                    │  x-provider-key (BYOK)
                    ┌───────────────▼──────────────┐
                    │  Express 5  (backend)        │◄──── PostgreSQL
                    │  sessions · keys · routing   │      (Prisma)
                    │  rate limiting · SSRF guard  │
                    └───────┬───────────────┬──────┘
                            │               │
              provider API  │               │  tool calls
                            │               │
          ┌─────────────────▼──┐   ┌────────▼─────────────┐
          │ OpenAI · Anthropic │   │  FastAPI (ai-services)│◄──── Qdrant
          │ Groq · xAI         │   │  ReAct loop · tools   │      (vectors)
          │ OpenRouter         │   │  PDF pipeline         │
          │ Ollama · self-host │   └───────────────────────┘
          └────────────────────┘
```

**Why three services.** The browser never holds a provider connection, so
streaming, retries and key handling stay in one place. Express owns
conversation state and provider routing. The Python service exists because the
agent loop and the PDF pipeline lean on the Python ecosystem — PyMuPDF for
extraction, the Qdrant client for vectors. They talk over plain HTTP, so any
one of them can be replaced without touching the others.

A TypeScript implementation of the agent ([`reactAgentTs.ts`](backend/src/services/reactAgentTs.ts))
also lives in the backend, for running the whole thing without the Python
service at all.

---

## How the ReAct agent works

The model is given a tool catalogue and asked to work in a loop. Each turn it
either calls a tool or produces a final answer:

```
Question: What is the population of Tokyo divided by the population of Paris?

Thought:      I need both populations. Start with Tokyo.
Action:       wikipedia("Tokyo")
Observation:  Tokyo ... population 14.09 million (2023) ...

Thought:      Now Paris.
Action:       wikipedia("Paris")
Observation:  Paris ... population 2.1 million (2023) ...

Thought:      Divide them.
Action:       calculator("14090000 / 2100000")
Observation:  6.709...

Final Answer: Tokyo's population is roughly 6.7× that of Paris.
```

Every thought, action and observation is streamed to the browser as it
happens and stored with the message, so a trace can be reopened later.

**Tools available**

| Tool | What it does | Needs a key? |
|---|---|---|
| `web_search` | DuckDuckGo (default) or Google Custom Search | Only for Google |
| `wikipedia` | Article summaries | No |
| `calculator` | Arithmetic without the model guessing | No |
| `read_url` | Fetches and extracts a page's text | No |
| `weather` | Current conditions via wttr.in | No |
| `datetime` | Current date and time | No |
| `doc_search` | Semantic search over uploaded PDFs | Optional |
| `python` | Runs Python in a restricted subprocess | Off by default — see [Security](#security-model) |

---

## Tech stack

**Frontend** — React 19, TypeScript, Vite 6, Tailwind 3, Zustand, react-pdf,
react-markdown. No routing library: a single view driven by store state.

**Backend** — Node 22, Express 5, TypeScript (ESM), Prisma 6, Zod, Pino.

**AI service** — Python 3.12, FastAPI, PyMuPDF, Qdrant client, httpx.

**Data** — PostgreSQL 16 for conversations and keys, Qdrant for vectors.

**Infrastructure** — Docker Compose locally; Vercel, Render, Neon and Qdrant
Cloud when hosted. GitHub Actions for CI.

---

## Running it locally

### Option 1 — Docker (everything at once)

```bash
git clone https://github.com/ranvirdeshmukh2004/FS_AI-App.git
cd FS_AI-App

cp backend/.env.example backend/.env
# Set ENCRYPTION_KEY in backend/.env:
openssl rand -hex 32

docker compose up --build
docker compose exec backend npx prisma db push   # first run only
```

Open <http://localhost>, go to **Settings**, and add a provider key.

### Option 2 — No Docker, no cloud (SQLite + Ollama)

The lightest way to run it. Nothing leaves your machine.

```bash
# 1. A local model
ollama serve
ollama pull llama3.2

# 2. Backend on SQLite
cd backend
npm install
npm run db:local        # creates the database and its matching client
npm run dev:local

# 3. AI service (optional — only needed for tools and PDFs)
cd ../ai-services
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8001

# 4. Frontend
cd ../frontend
npm install
npm run dev
```

Open <http://localhost:3000> and pick a model under **Ollama (Local)**.

### Option 3 — Services individually against Postgres

```bash
docker compose up postgres qdrant -d
cd backend    && npm install && npm run db:push && npm run dev
cd ai-services && uvicorn app.main:app --port 8000
cd frontend   && npm install && npm run dev
```

### Tests

```bash
cd backend     && npm test                              # 14 tests
cd ai-services && python -m unittest discover -s tests  # 15 tests
```

---

## Deploying it for free

Four free tiers, no card required, roughly 15 minutes end to end. Every
visitor supplies their own API key, so the running cost is zero.

| Piece | Host | Free tier |
|---|---|---|
| Frontend | Vercel | Static hosting, generous bandwidth |
| API | Render | 750 instance-hours/month; sleeps when idle |
| AI service | Render | Same |
| Database | Neon | 0.5 GB PostgreSQL |
| Vectors | Qdrant Cloud | 1 GB cluster |

### 1. Database (Neon)

Create a project at [neon.tech](https://neon.tech) and copy the connection
string. Push the schema once from your machine:

```bash
cd backend
DATABASE_URL="postgresql://...?sslmode=require" npm run db:deploy
```

### 2. Vectors (Qdrant Cloud)

Create a free cluster at [cloud.qdrant.io](https://cloud.qdrant.io) and note
its URL and API key. You can skip this — chat and tools work without it; only
PDF search and semantic memory go quiet.

### 3. Backend and AI service (Render)

In Render, choose **New → Blueprint** and point it at your fork. The included
[`render.yaml`](render.yaml) defines both services. Fill in:

| Service | Variable | Value |
|---|---|---|
| `fs-ai-backend` | `DATABASE_URL` | Neon string, with `?sslmode=require` |
| `fs-ai-backend` | `CORS_ORIGINS` | Your Vercel URL (add it after step 4) |
| `fs-ai-services` | `QDRANT_URL` | Qdrant cluster URL |
| `fs-ai-services` | `QDRANT_API_KEY` | Qdrant API key |
| `fs-ai-services` | `CORS_ORIGINS` | The backend's Render URL |

`DEMO_MODE` is already set to `true` in the blueprint. Leave it that way on a
public URL — see [Security](#security-model).

### 4. Frontend (Vercel)

Import the repository. [`vercel.json`](vercel.json) supplies the build
settings. Add one environment variable:

```
VITE_API_URL = https://fs-ai-backend.onrender.com
```

Deploy, then go back and set `CORS_ORIGINS` on the backend to the Vercel URL
you just got.

### About the cold start

Render's free instances sleep after about 15 minutes idle and take roughly 50
seconds to wake. The app expects this: the UI says the server is waking rather
than showing an error, and chat works with tools switched off while the AI
service starts. A free uptime pinger avoids it entirely if you would rather
not wait.

---

## Configuration

### Backend

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Assigned by the host in production |
| `DATABASE_URL` | — | **Required.** PostgreSQL, or `file:` for SQLite |
| `AI_SERVICES_URL` | `http://localhost:8000` | Where the Python service lives |
| `DEMO_MODE` | `false` | `true` = BYOK, store nothing. Use on public URLs |
| `CORS_ORIGINS` | `*` | Comma-separated allow-list |
| `ENCRYPTION_KEY` | — | 64 hex chars. Required when `DEMO_MODE=false` |
| `MAX_UPLOAD_MB` | `10` | Upload cap; uploads are buffered in memory |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama daemon |

### AI service

| Variable | Default | Purpose |
|---|---|---|
| `QDRANT_URL` | — | Managed cluster URL; takes precedence over host/port |
| `QDRANT_API_KEY` | — | Required with `QDRANT_URL` |
| `QDRANT_HOST` / `QDRANT_PORT` | `localhost` / `6333` | Local Docker Qdrant |
| `CORS_ORIGINS` | `*` | Comma-separated allow-list |
| `ENABLE_PYTHON_TOOL` | `false` | Runs model-authored code. Keep off publicly |

### Frontend

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | same-origin | Set only when the API is on another host. Build-time |

---

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Status plus a real database check |
| `GET` | `/api/config` | Server capabilities (demo mode, limits) |
| `GET` | `/api/sessions` | List conversations |
| `POST` | `/api/sessions` | Create one |
| `GET` | `/api/sessions/:id` | One conversation with messages |
| `PATCH` | `/api/sessions/:id/title` | Rename |
| `PATCH` | `/api/sessions/:id/model` | Switch provider or model |
| `DELETE` | `/api/sessions/:id` | Delete |
| `POST` | `/api/chat` | Send a message; responds with an SSE stream |
| `GET` | `/api/providers` | Providers and their models |
| `GET` | `/api/providers/:id/models` | Live model list from the provider |
| `GET` | `/api/keys` | Stored keys, masked (empty in demo mode) |
| `POST` | `/api/keys` | Store a key (refused in demo mode) |
| `POST` | `/api/keys/test` | Validate a key against the provider |
| `DELETE` | `/api/keys/:provider` | Remove a key |
| `GET` | `/api/custom-endpoints` | Self-hosted endpoints |
| `POST` | `/api/custom-endpoints` | Add one |
| `POST` | `/api/custom-endpoints/test` | Check reachability |
| `POST` | `/api/pdf/upload` | Upload and index a PDF |
| `GET` | `/api/ollama/status` | Is a local Ollama running |
| `POST` | `/api/ollama/pull` | Pull a model, streaming progress |

**SSE event types:** `chunk`, `thinking`, `tool`, `observation`, `trace`,
`done`, `error`.

---

## Security model

**Two modes, and the difference matters.**

`DEMO_MODE=true` (public deployments) — the visitor's key is held in their
browser's `sessionStorage` and sent as an `x-provider-key` header with their
own requests. It is never written to the database, never logged, and
disappears when the tab closes. The key-storage endpoints refuse writes. Each
visitor pays their own provider bill, and there is nothing on the server worth
stealing.

`DEMO_MODE=false` (local and self-hosted) — keys are stored in PostgreSQL,
encrypted with AES-256-GCM under `ENCRYPTION_KEY`. This assumes you are the
only person who can reach the URL. **There is no login.** Do not expose a
deployment in this mode to the internet.

**Other measures**

- **SSRF guard** — the self-hosted-endpoint feature fetches a URL you supply.
  In production, private ranges, loopback, link-local and cloud metadata
  (`169.254.169.254`) are refused, and only `https` is allowed. Private
  targets stay permitted in development, since pointing at a local vLLM box is
  the point of the feature.
- **Rate limiting** — a fixed window per IP: 120 requests/minute overall,
  20 for chat, 10 for uploads.
- **Error sanitising** — provider error bodies can echo the request back,
  including the key, so they are mapped to safe messages before reaching the
  browser.
- **CORS** — an explicit allow-list rather than `*`.
- **Containers** — both images run as a non-root user.
- **The Python tool** is disabled unless `ENABLE_PYTHON_TOOL=true`. Its
  sandbox is a blocklist over source text plus a stripped `__builtins__`,
  which stops casual misuse but is **not a security boundary**. It runs in a
  killable subprocess with memory and CPU limits so a runaway cannot take the
  service down. Leave it off anywhere strangers can reach.

---

## Known limits

Worth stating plainly rather than discovering later.

- **No user accounts.** Conversations are global to a deployment; anyone with
  the URL sees the same list. Fine for a personal instance or a BYOK demo,
  not for multiple users sharing one URL.
- **Free instances sleep.** First request after idle takes ~50 seconds.
- **Rate limiting is per-instance and in-memory.** It resets on restart and
  would not survive horizontal scaling.
- **Uploads are buffered in memory**, hence the 10MB default. Streaming
  straight to the AI service would lift it.
- **Scanned PDFs need OCR**, which is not wired up — text-layer PDFs only.
- **Ollama and self-hosted endpoints are local-only** by nature. They appear
  in the picker only when reachable from the backend.
- **Without an embedding key**, PDF search falls back to hash-based
  embeddings: it works, but retrieval quality is well below a real model.

---

## Project layout

```
├── frontend/              React 19 + Vite SPA
│   └── src/
│       ├── components/    chat, pdf, settings, sidebar
│       ├── services/      API client, BYOK key store
│       └── stores/        Zustand state
├── backend/               Express 5 API
│   └── src/
│       ├── routes/        sessions, chat, keys, providers, pdf, ollama
│       ├── services/      provider routing, ReAct (TS), tools
│       ├── middleware/    errors, rate limiting
│       ├── utils/         crypto, SSRF guard, logging
│       └── __tests__/     node:test suites
├── ai-services/           FastAPI service
│   ├── app/services/      orchestrator, ReAct agent, PDF, vectors
│   │   └── tools/         the tool implementations
│   └── tests/             unittest suites
├── docker/nginx/          reverse proxy config
├── .github/workflows/     CI
├── render.yaml            Render blueprint (API + AI service)
├── vercel.json            Vercel build config (frontend)
└── docker-compose.yml     full local stack
```

---

## License

MIT — see [LICENSE](LICENSE).
