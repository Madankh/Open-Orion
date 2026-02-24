# Orion Backend Guide

This folder contains the Node.js backend service for Orion.

It is responsible for:
1. Authentication (including Google login).
2. User account APIs.
3. Token/credit deduction APIs.
4. Paddle webhook processing for billing/subscription events.
5. Session handling and recovery monitoring endpoints.

## Who should use this README

1. Non-technical users who want to run backend safely.
2. Developers who need backend architecture and setup details.

## What this backend does (simple explanation)

When a user opens the Orion web app:
1. Frontend sends account/auth requests to this backend.
2. This backend validates sessions and JWT tokens.
3. This backend reads/writes user data in MongoDB.
4. Billing updates (Paddle webhook) are processed here.
5. Token credits are updated here for AI usage accounting.

## Service basics

1. Runtime: Node.js + Express.
2. Main file: `Backend/index.js`.
3. Default port: `5000`.
4. Health endpoint: `GET /health`.
5. Database: MongoDB via `MONGO_URL`.

## Route map (currently mounted)

In `index.js`, these route groups are active:

1. `/api/auth/*` from `router/auth.js`
2. `/api/paddle/*` from `router/webhook.js`
3. `/api/user/*` from `router/user.js`
4. `/api/token/*` from `router/DailyTokenRouter.js`

Important examples:
1. `GET /health`
2. `GET /api/auth/login/google`
3. `GET /api/auth/google/callback`
4. `GET /api/auth/login/success`
5. `GET /api/auth/logout`
6. `POST /api/auth/bug/report`
7. `POST /api/paddle/webhook`
8. `POST /api/token/deduct-credits`

Note:
1. `router/tokenLimiter.js` exists, but it is not mounted in `index.js` currently.

## Folder overview

```text
Backend/
├── index.js                      # Express server entry point
├── package.json                  # Scripts and dependencies
├── Dockerfile                    # Backend container image
├── .env                          # Backend environment (local in this folder)
├── README.md                     # This guide
├── models/                       # MongoDB models
│   ├── User.js
│   ├── verificationToken.js
│   ├── UsersPerformance.js
│   └── ...
├── router/                       # API route handlers
│   ├── auth.js
│   ├── webhook.js
│   ├── DailyTokenRouter.js
│   ├── PassportGoogleAuto.js
│   ├── verifyToken.js
│   └── ...
├── utils/                        # Utility functions
└── view/                         # Email templates
```

## Quick start (non-technical)

If you are running the full project with Docker from repo root, backend starts automatically.

If you want to run backend only:

1. Open terminal.
2. Go to backend folder:

```bash
cd /home/curiosity/Downloads/Orion_project/Backend
```

3. Install dependencies:

```bash
yarn install
```

4. Start server:

```bash
yarn start
```

5. Test health:

```bash
curl http://localhost:5000/health
```

Expected result:
1. JSON response with status `ok`.

## Requirements

1. Node.js 20+ recommended.
2. Yarn 1.x (project lockfile uses yarn classic).
3. MongoDB connection string.
4. Valid environment variables in `.env`.

## Scripts

From `Backend/package.json`:

```bash
yarn start
```

That runs:

```bash
node index.js
```

## Environment variables

Use a safe template like this in `Backend/.env`:

```env
NODE_ENV=development
MONGO_URL=<your_mongodb_connection_string>

JWT_SEC=<jwt_secret>
SESSION_SECRET=<session_secret>
SECRETACCESS=<secondary_secret>
COOKIE_KEY=<cookie_key>

GOOGLE_CLIENT_ID=<google_oauth_client_id>
GOOGLE_CLIENT_SEC=<google_oauth_client_secret>

PADDLE_SECRET_TOKEN=<paddle_secret_token>
PADDLE_WEBHOOK_SECRET=<paddle_webhook_secret>
PADDLE_ENVIRONMENT=sandbox

RESENDAPI=<resend_api_key>

# Optional / if used in your setup
BASE_URL=http://localhost:3000
RECOVERY_MODE=normal
RECOVERY_BATCH_SIZE=20
GRACE_PERIOD_DAYS=7

# Optional SMTP (used by sendEmail.js if your flows call it)
SMPT_HOST=<smtp_host>
SMPT_PORT=<smtp_port>
SMPT_SERVICE=<smtp_service>
SMPT_MAIL=<smtp_user>
SMPT_PASSWORD=<smtp_password>
```

Important:
1. Do not commit real secrets.
2. Rotate exposed credentials before production.

## Google OAuth setup (basic)

This backend expects:
1. Callback path: `/api/auth/google/callback`
2. Local callback URL in code: `http://localhost:5000/api/auth/google/callback`

For local testing:
1. Add this exact callback URL in your Google Cloud OAuth app.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SEC` in `.env`.

## Paddle webhook setup (basic)

Webhook route:
1. `POST /api/paddle/webhook`

You must set:
1. `PADDLE_SECRET_TOKEN`
2. `PADDLE_WEBHOOK_SECRET`
3. `PADDLE_ENVIRONMENT`

If webhooks fail:
1. Check signature configuration.
2. Check backend logs.
3. Confirm public URL tunneling in local dev (for external webhook delivery).

## How to run with Docker (backend-only)

From repo root:

```bash
docker build -t orion-backend ./Backend
docker run --rm -p 5000:5000 --env-file /home/curiosity/Downloads/Orion_project/.env.backend orion-backend
```

Then test:

```bash
curl http://localhost:5000/health
```

## How to run in full stack Docker

From repo root:

```bash
docker compose up --build
```

Backend will be exposed at:
1. `http://localhost:5000`

## Troubleshooting

### Server does not start

1. Check Node version: `node -v`.
2. Reinstall dependencies:

```bash
rm -rf node_modules yarn.lock
yarn install
```

3. Ensure `.env` exists with required variables.

### MongoDB connection failed

1. Verify `MONGO_URL` is correct.
2. If using MongoDB Atlas, allow your IP/network.
3. Check username/password in connection string.

### CORS or cookie/session issues in browser

1. Ensure frontend is running at `http://localhost:3000` (allowed origin in `index.js`).
2. Confirm session/JWT secrets are present.
3. Ensure browser is not blocking third-party cookies for your setup.

### Google login fails

1. Verify Google OAuth callback URL matches exactly.
2. Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SEC`.
3. Check backend logs for Passport errors.

### Webhook not processing

1. Confirm Paddle webhook is pointed to `/api/paddle/webhook`.
2. Verify `PADDLE_WEBHOOK_SECRET`.
3. Check logs for signature mismatch.

## Security checklist

Before production:
1. Replace all dev/test secrets.
2. Set secure cookie behavior for HTTPS deployments.
3. Restrict CORS to real frontend domains.
4. Enable production-grade logging/monitoring.
5. Ensure webhook endpoints are protected by signature verification (already implemented).

## Command cheat sheet

```bash
# Run backend locally
cd /home/curiosity/Downloads/Orion_project/Backend
yarn install
yarn start

# Health check
curl http://localhost:5000/health

# Backend Docker image
cd /home/curiosity/Downloads/Orion_project
docker build -t orion-backend ./Backend

# Run backend Docker container
docker run --rm -p 5000:5000 --env-file .env.backend orion-backend
```
