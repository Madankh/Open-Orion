# Orion Frontend Guide

This is the web application for Orion (AgentFlow). It is the part users open in the browser.

It provides:
1. Login and account pages.
2. Main AI workspace page.
3. Canvas/whiteboard interface.
4. Profile, subscription, success, terms, and bug-report pages.
5. Client UI that connects to Node backend (`:5000`) and Python AI backend (`:8000`).

## Who this README is for

1. Non-technical users who want to run the frontend safely.
2. Developers who need setup and architecture details.

## Quick start (non-technical, recommended)

If your full project is already running with Docker from the repo root, you usually do not need to run frontend manually.

If you want to run only the frontend locally:

1. Open terminal.
2. Go to frontend folder:

```bash
cd /home/curiosity/Downloads/Orion_project/frontend
```

3. Install dependencies:

```bash
npm install
```

4. Start development server:

```bash
npm run dev
```

5. Open in browser:

```text
http://localhost:3000
```

## Frontend requirements

1. Node.js 20+ recommended.
2. npm 10+ recommended.
3. Python backend running on `http://localhost:8000`.
4. Node backend running on `http://localhost:5000`.

Without backend services, the UI will load but many actions (chat, workspace, auth, files) will fail.

## Available scripts

From `frontend/package.json`:

```bash
npm run dev     # Development server (Turbopack)
npm run build   # Create production build
npm run start   # Run production server
npm run lint    # Lint the codebase
```

## How frontend talks to backend

The UI communicates with:
1. Node backend for auth/user/token/billing related APIs (`http://localhost:5000`).
2. Python backend for AI/chat/workspace APIs and websocket (`http://localhost:8000`, `ws://localhost:8000`).

Important current behavior:
1. Backend URLs are currently hardcoded in `frontend/apiurl.jsx`.
2. That means changing `.env` alone may not change runtime API URL usage everywhere.

Current hardcoded values in `frontend/apiurl.jsx`:
1. `pythonUrl = http://localhost:8000`
2. `nodeUrl = http://localhost:5000`
3. `websocketUrl = ws://localhost:8000`

## Environment variables

You may still keep a local env file for compatibility and future use.

Create `frontend/.env.local`:

```env
NODE_ENV=development
NEXT_PUBLIC_NODE_URL=http://localhost:5000
NEXT_PUBLIC_PYTHON_URL=http://localhost:8000
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8000
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=<your_token>
```

Notes:
1. Do not commit real tokens/secrets.
2. `NEXT_PUBLIC_*` variables are exposed to browser-side code.

## Build for production

1. Install dependencies:

```bash
npm install
```

2. Build:

```bash
npm run build
```

3. Start production server:

```bash
npm run start
```

4. Open:

```text
http://localhost:3000
```

## Folder overview

```text
frontend/
├── app/                     # Next.js App Router pages and API routes
│   ├── page.tsx             # Main entry page
│   ├── canvas/              # Canvas page
│   ├── login/               # Login page
│   ├── profile/             # Profile page
│   ├── subscription/        # Subscription page
│   ├── bug-report/          # Bug report page
│   └── api/files/route.ts   # Files API bridge inside Next app
├── components/              # Reusable UI + feature components
├── providers/               # React providers/state wrappers
├── lib/                     # Shared helper logic
├── utils/                   # Utilities
├── public/                  # Static assets
├── typings/                 # TypeScript types
├── apiurl.jsx               # Backend URL constants
├── next.config.ts           # Next.js config
└── package.json             # Scripts/dependencies
```

## Tech stack

1. Next.js 15
2. React 19
3. TypeScript
4. Tailwind CSS
5. Framer Motion
6. Redux Toolkit + redux-persist
7. Tiptap editor
8. tldraw (canvas)
9. Monaco editor
10. Yjs + y-protocols for collaboration features

## Troubleshooting

### `npm run dev` fails

1. Check Node version: `node -v`.
2. Delete `node_modules` and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

### App opens, but AI/chat fails

1. Confirm Python backend is running on `http://localhost:8000`.
2. Confirm websocket endpoint is reachable at `ws://localhost:8000/ws`.
3. Check browser console and backend logs.

### Login/account actions fail

1. Confirm Node backend is running on `http://localhost:5000`.
2. Verify CORS/session/auth settings in backend environment.

### File/workspace operations fail

1. Check `app/api/files/route.ts` logs in terminal.
2. Verify Python backend workspace API is reachable.

## Development notes

1. Keep frontend and backend URL configuration consistent.
2. If you move backend ports or domain, update `frontend/apiurl.jsx` and your env files.
3. Run lint before merging:

```bash
npm run lint
```

## Security notes

1. Never store private keys in frontend code.
2. Never commit real `.env.local` secrets.
3. Treat all `NEXT_PUBLIC_*` values as publicly visible.

## Command cheat sheet

```bash
cd /home/curiosity/Downloads/Orion_project/frontend
npm install
npm run dev
npm run build
npm run start
npm run lint
```
