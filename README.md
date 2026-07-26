# oauth-login

GitHub OAuth login. Tokens stay on the server; the browser only gets a signed `sid` cookie.

Stack: Express (`apps/server`) + React/Vite (`apps/web`). npm workspaces. Node 20+.

## What it does

- OAuth authorization code flow with PKCE, scope `read:user`
- Access token stored in an in-memory session on the server
- Signed HttpOnly cookies: `oauth_state` (login) and `sid` (session)
- Session lasts 8 hours max, or 30 minutes idle
- `/api/me` and `/api/repositories` call GitHub from the server (public repos only); responses never include tokens
- Repo pages cached in the server process (LRU size 5, key `sessionId+page`, header `X-Cache`)

## Setup

1. `npm install`
2. Create a GitHub OAuth App:
   - Homepage: `http://localhost:5173`
   - Callback: `http://localhost:3000/auth/callback`
3. `cp .env.example .env` and fill in client id/secret + a long `SESSION_SECRET` (32+ chars)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

4. Run both apps:

```bash
npm run dev:server
npm run dev:web
```

Open `http://localhost:5173`. Vite forwards `/auth` and `/api` to the server.

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | — |
| GET | `/auth/login` | — |
| GET | `/auth/callback` | — |
| POST | `/auth/logout` | session + same-origin |
| GET | `/api/me` | session |
| GET | `/api/repositories?page=` | session |

User: `{ id, login, name, avatarUrl }`  
Repo: `{ id, name, description, url, private }`

## Notes

- Sessions and rate limits are in-memory (lost on restart, not shared across processes)
- `COOKIE_SECURE=false` for local HTTP; use `true` behind HTTPS
- Missing/weak config fails at boot
- Tests: `npm test` (fake GitHub client, no network)
