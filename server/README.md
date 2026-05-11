# MUD Backend

Express + PostgreSQL backend for the MUD game. Handles player accounts, save persistence, rotating marketplace, player notes, and ghost recordings.

## Deploy to Railway

1. In your Railway project, add a **PostgreSQL** plugin (this auto-sets `DATABASE_URL`)
2. Set environment variables in Railway dashboard:
   - `JWT_SECRET` — a strong random string (e.g., `openssl rand -hex 32`)
   - `NODE_ENV` — set to `production`
3. Deploy this `server/` directory as a service
4. After first deploy, run the migration:
   ```
   railway run npm run migrate
   ```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/login | No | Get JWT token |
| GET | /api/saves | Yes | Load player save |
| PUT | /api/saves | Yes | Store player save |
| GET | /api/marketplace | No | Get rotating shop stock |
| POST | /api/marketplace/buy | Yes | Purchase item |
| GET | /api/notes/:room | No | Get notes in room |
| POST | /api/notes | Yes | Leave a note |
| GET | /api/ghosts/:room | Yes | Get ghost recordings |
| POST | /api/ghosts | Yes | Record ghost action |

## Local Development

```bash
cd server
npm install
export DATABASE_URL="postgresql://localhost:5432/mud"
export JWT_SECRET="dev-secret"
npm run migrate
npm run dev
```
