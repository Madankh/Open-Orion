# Orion Project


Orion is a collaborative AI workspace where teams can chat with AI, work on documents/whiteboards, and manage project notes in one place.

This README is written for both:
1. Non-technical users who just want to run and use the app.
2. Technical users who want backend/frontend/agent details.

## What this project includes

The full app is made of 4 running services:
1. Frontend (`frontend`, Next.js) on port `3000`.
2. Node backend (`Backend`, Express) on port `5000`.
3. Python AI backend (`main.py`, FastAPI + WebSocket) on port `8000`.
4. Redis (for caching/rate limiting/session-related tasks).

It also uses MongoDB (external connection from environment variables).
## 🎥 Demo Video

[![Watch Orion Demo]([https://vimeo.com/1167596581](https://vimeo.com/1167596581?share=copy&fl=sv&fe=ci)]
## High-level architecture (simple)

1. You open the web app in your browser (`http://localhost:3000`).
2. Frontend talks to Node backend for auth/account/billing style endpoints.
3. Frontend also talks to Python AI service for AI chat, agent operations, WebSocket streaming, and canvas APIs.
4. Redis supports rate limit and fast state operations.
5. MongoDB stores users, projects, notes, canvas data, and workspace metadata.

## Backend details

There are two backend applications in this repo.

### 1) Node backend (`/Backend`)
Purpose:
1. Authentication and session handling.
2. Google OAuth flow.
3. User profile and plan/token credit operations.
4. Billing webhook and recovery-related routes.

Entry point:
1. `Backend/index.js`.

Main route groups:
1. `/api/auth/*`
2. `/api/user/*`
3. `/api/token/*`
4. `/api/paddle/*`
5. Health: `GET /health`

Port:
1. `5000`

### 2) Python AI backend (repo root)
Purpose:
1. AI agent orchestration.
2. Real-time communication (WebSocket).
3. Yjs collaboration socket.
4. Project/core APIs and canvas/node APIs.
5. File upload/download and workspace management.

Entry point:
1. `main.py`

Main interfaces:
1. WebSocket: `/ws`
2. Yjs socket: `/yjs`
3. REST health: `GET /health`
4. REST API routers under `/api/*` from:
   1. `App/routers/api_routes_core.py`
   2. `App/routers/api_routes_canvas.py`

Port:
1. `8000`

## Frontend details (`/frontend`)

Framework:
1. Next.js (App Router)
2. React
3. Tailwind

Purpose:
1. User interface for chat, workspace, whiteboard/canvas, and collaboration.
2. Calls Node backend for account/auth/token operations.
3. Calls Python backend and WebSocket for AI interactions.

Default URL:
1. `http://localhost:3000`

## Agent system details (`/agents`)

Main agent files:
1. `agents/MainAgent.py`: Base plugin marker class.
2. `agents/AgentExecutor.py`: General-purpose task agent for complex workflows.
3. `agents/CanvasAgentExecutor.py`: Canvas/node-focused agent.
4. `agents/TodoTrackingSystem.py`: Tracks todo/checkpoint workflow during long tasks.
5. `agents/TokenTracker.py`: Token usage estimation/tracking helper. which need to fix token calculation

In simple words:
1. `AgentExecutor` is the general AI worker.
2. `CanvasAgentExecutor` is specialized for whiteboard/canvas context.
3. Both connect to tool modules (`/lab`) and stream progress via WebSocket events.

## Project structure

```text
Orion_project/
├── frontend/                  # Next.js UI
├── Backend/                   # Node.js backend (auth/billing/user)
├── agents/                    # Agent executors and agent helpers
├── App/routers/               # FastAPI REST routes (core + canvas)
├── main.py                    # Python AI backend entrypoint
├── websocket.py               # WebSocket request handling
├── deepsearcher/              # Deep research modules
├── Mongodb/                   # DB manager/helpers
├── docker-compose.yml         # Multi-service local orchestration
├── .env                       # Python AI service environment
├── .env.backend               # Node backend environment
├── .env.frontend              # Frontend environment (compose)
└── README.md
```

## Fastest way to run (recommended for non-technical users)

This method uses Docker so you do not install Python/Node manually.

### Step 1: Install required apps

1. Install Docker Desktop.
2. Open Docker Desktop and ensure it is running.
3. Install Git (if not already installed).

### Step 2: Open terminal in project folder

```bash
cd /home/curiosity/Downloads/Orion_project
```

### Step 3: Configure environment files

This repo already has `.env`, `.env.backend`, `.env.frontend` files.
You should replace sensitive values with your own before production use.

Minimum you should check:
1. `.env` (Python AI service): MongoDB URI, Redis settings, AI provider keys, JWT secret.
2. `.env.backend` (Node backend): Mongo URL, JWT/session secrets, Google OAuth keys, Paddle keys.
3. `.env.frontend` (Frontend): public URLs for Node/Python/WebSocket and Paddle client token.

### Step 4: Build and start all services

```bash
docker compose up --build
```

Wait until logs stabilize. First build can take several minutes.

### Step 5: Open the app

1. Frontend: `http://localhost:3000`
2. Node backend health: `http://localhost:5000/health`
3. Python backend health: `http://localhost:8000/health`

### Step 6: Stop services

In the same terminal press `Ctrl + C`, then run:

```bash
docker compose down
```

## Local development run (without Docker)

Use this only if you are comfortable with Node/Python setup.

### Prerequisites

1. Node.js 20+ (recommended).
2. Python 3.11+.
3. Redis server running locally.
4. MongoDB connection string (Atlas or local).

### Terminal A: start Node backend

```bash
cd /home/curiosity/Downloads/Orion_project/Backend
yarn install
yarn start
```

Expected:
1. Service on `http://localhost:5000`.
2. Health endpoint works on `/health`.

### Terminal B: start Python AI backend

```bash
cd /home/curiosity/Downloads/Orion_project
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py --host 0.0.0.0 --port 8000
```

Expected:
1. Service on `http://localhost:8000`.
2. WebSocket endpoint on `ws://localhost:8000/ws`.

### Terminal C: start frontend

```bash
cd /home/curiosity/Downloads/Orion_project/frontend
npm install
npm run dev
```

Open:
1. `http://localhost:3000`

## Environment variable reference (safe template)

Do not commit real secrets to git.

### `.env` (Python AI backend)

```env
MONGODB_URI=<your_mongodb_uri>
MONGODB_DATABASE=<db_name>
JWT_SEC=<jwt_secret>
SECRETACCESS=<secondary_secret>
DEFAULT_MODEL=<model_id>
WORKSPACE_PATH=./workspace

OPENAI_API_KEY=<optional>
OPENAI_BASE_URL=<optional>
OPENROUTER=<optional_base_url>
OPENROUTER_KEY=<optional>
TOGETHER=<optional_base_url>
TOGETHER_KEY=<optional>
DEEPSEEK=<optional_base_url>
DEEPSEEK_KEY=<optional>
NOVITA=<optional_base_url>
NOVITA_KEY=<optional>
GROQ_API_KEY=<optional>
COHERE_API_KEY=<optional>
TAVILY_API_KEY_SEARCH=<optional>
FIRECRAWL_API_KEY=<optional>
REPLICATE_API_TOKEN=<optional>
FAL_KEY=<optional>

SEARCH_PROVIDER=tavily
SCRAPER_PROVIDER=firecrawl
SEARCH_PROCESS_TIMEOUT=300
SEARCH_QUERY_TIMEOUT=20
SCRAPE_URL_TIMEOUT=30

NODE_API_BASE_URL=http://localhost:5000/api/token

BUCKET_NAME=<optional_s3_bucket>
BUCKET_REGION=<optional_s3_region>
ACCESS_KEY=<optional_s3_access_key>
Secret_access_key=<optional_s3_secret>

QDRANT_URL=<optional>
QDRANT_API_KEY=<optional>

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<redis_password>
REDIS_DB=0

CLAMAV_HOST=localhost
CLAMAV_PORT=3310
CLAMAV_TIMEOUT=30
```

### `.env.backend` (Node backend)

```env
NODE_ENV=development
MONGO_URL=<your_mongodb_uri>
JWT_SEC=<jwt_secret>
SESSION_SECRET=<session_secret>
SECRETACCESS=<secondary_secret>
COOKIE_KEY=<cookie_key>

GOOGLE_CLIENT_ID=<google_oauth_client_id>
GOOGLE_CLIENT_SEC=<google_oauth_client_secret>

PADDLE_SECRET_TOKEN=<paddle_secret>
PADDLE_WEBHOOK_SECRET=<paddle_webhook_secret>
PADDLE_ENVIRONMENT=sandbox

RESENDAPI=<resend_api_key>
```

### `.env.frontend` (compose) or `frontend/.env.local` (local)

```env
NODE_ENV=development
NEXT_PUBLIC_NODE_URL=http://localhost:5000
NEXT_PUBLIC_PYTHON_URL=http://localhost:8000
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8000
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=<paddle_client_token>
```

## Health checks and verification

After startup, run these checks:

```bash
curl http://localhost:5000/health
curl http://localhost:8000/health
```

Expected:
1. Node returns status ok.
2. Python returns JSON with `{"status":"ok"...}`.

Then open `http://localhost:3000` and verify the UI loads.

## Common user workflows (non-technical)

1. Open the app in browser.
2. Sign in (if auth is enabled in your environment).
3. Create a project.
4. Add topics and work items.
5. Open a canvas/document and interact with AI.
6. Keep browser tab open while long AI tasks run.

## Troubleshooting

### App does not open on localhost:3000

1. Confirm Docker containers are running: `docker compose ps`.
2. Check frontend logs: `docker compose logs frontend`.
3. Ensure port `3000` is not already occupied.

### Backend health endpoint fails

1. Check Node logs: `docker compose logs backend`.
2. Confirm `.env.backend` has valid `MONGO_URL` and secrets.
3. Verify MongoDB network/IP allowlist if using cloud Mongo.

### AI chat/WebSocket issues

1. Check Python service logs: `docker compose logs ai-agent`.
2. Confirm frontend websocket URL points to `ws://localhost:8000`.
3. Ensure JWT and token validation settings match between services.

### Redis errors

1. Confirm Redis container is healthy: `docker compose ps`.
2. Ensure `REDIS_PASSWORD` in `.env` matches compose settings.

## Security notes (important)

1. Rotate any exposed keys/secrets before production use.
2. Never commit real credentials in `.env` files.
3. Use separate dev/staging/prod credentials.
4. Restrict CORS origins and secure cookie settings in production.
5. Use HTTPS and proper secret management when deploying publicly.

## How to restart cleanly

```bash
docker compose down
docker compose up --build
```

If you need to remove old containers/networks:

```bash
docker compose down --remove-orphans
```

## Production deployment checklist

1. Replace all secrets with production values.
2. Set production URLs in frontend env.
3. Ensure MongoDB and Redis are production-grade and backed up.
4. Configure TLS/HTTPS reverse proxy.
5. Configure monitoring and log retention.
6. Test Google OAuth and billing webhooks with production callback URLs.

## Quick command summary

```bash
# Start all services
docker compose up --build

# Stop all services
docker compose down

# See running status
docker compose ps

# Tail logs
docker compose logs -f

# Health checks
curl http://localhost:5000/health
curl http://localhost:8000/health
```

## Notes for maintainers

If you update service ports, route prefixes, or env var names, update this README immediately so non-technical users can continue to run the project without confusion.

![View]([https://ph-files.imgix.net/4be203a4-dbae-47a7-89c9-76e9a6911615.png?... ](https://ph-files.imgix.net/f412e6d4-4885-4693-98ea-b6e72c171734.png?auto=compress&codec=mozjpeg&cs=strip&auto=format&fm=pjpg&w=1100&h=619&fit=max&frame=1&dpr=1))

![View]([https://ph-files.imgix.net/82977fe9-3cc2-4ebf-aded-0e5d6895aa5b.png?... )](https://ph-files.imgix.net/82977fe9-3cc2-4ebf-aded-0e5d6895aa5b.png?auto=compress&codec=mozjpeg&cs=strip&auto=format&fm=pjpg&w=1100&h=619&fit=max&frame=1&dpr=1)

![Overview]([https://ph-files.imgix.net/f97ebcde-0665-4639-83dc-8e5fd0573ec8.png?... ](https://ph-files.imgix.net/f97ebcde-0665-4639-83dc-8e5fd0573ec8.png?auto=compress&codec=mozjpeg&cs=strip&auto=format&fm=pjpg&w=1100&h=619&fit=max&frame=1&dpr=1))
