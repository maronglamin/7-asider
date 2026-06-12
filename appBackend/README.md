# 7a-side Backend

Node/Express backend (TypeScript) with email auth, Google OAuth token verification, and JWT issuance.

## Auth

- Email: `POST /auth/register-email`, `POST /auth/login-email`
- Google: `POST /auth/google` with `{ idToken }` — requires `GOOGLE_CLIENT_IDS` in `.env` (see `.env.example`)
- Public OAuth config: `GET /auth/public-config` — returns `googleWebClientId` for the web app (not a secret; client IDs are public)
- Apple / Facebook routes exist but are not wired in the frontend

See `appFrontend/GOOGLE_OAUTH_SETUP.md` for Google Cloud Console and EAS build steps.

## Scripts
- dev: nodemon src/index.ts
- build: tsc -p .
- start: node dist/index.js

## Getting Started
1. Install dependencies:
```
npm install
```
2. Start development server:
```
npm run dev
```

Health check: http://localhost:4000/health
