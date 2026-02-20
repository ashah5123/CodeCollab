# CodeCollab

Real-time collaborative coding platform — like Google Docs for code.

## Features

- **Rooms** — Create coding rooms and invite others via shareable link
- **Live editing** — Edit code together with real-time sync (Supabase Realtime, no polling)
- **Line comments** — Leave comments on specific lines
- **In-room chat** — Chat with collaborators
- **Auth** — Supabase Auth with JWT validation on the backend

## Tech Stack

| Layer        | Stack |
|-------------|--------|
| Frontend    | Next.js (App Router), TypeScript, Tailwind CSS, CodeMirror 6, Supabase client |
| Backend     | FastAPI, Pydantic, JWT validation (Supabase tokens) |
| Database & Realtime | Supabase (PostgreSQL, Auth, Realtime), RLS enabled |
| Deployment  | Railway (backend), Vercel or Railway (frontend) |

## Project structure

```
CodeCollab/
├── supabase/
│   └── migrations/     # SQL schema, RLS, Realtime publication
├── backend/            # FastAPI app
│   ├── app/
│   │   ├── auth.py     # JWT validation
│   │   ├── config.py
│   │   ├── main.py     # Routes: rooms, join
│   │   ├── schemas.py
│   │   └── supabase_client.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── railway.json
│   └── Procfile
├── frontend/           # Next.js app
│   ├── src/
│   │   ├── app/        # App Router pages
│   │   ├── components/ # CodeEditor (CodeMirror 6)
│   │   └── lib/        # Supabase client, API client
│   ├── .env.local.example
│   └── package.json
└── README.md
```

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the migration:
   - Open `supabase/migrations/20250219000001_initial_schema.sql`
   - Copy its contents and run in the SQL Editor.
3. In **Settings → API**, note:
   - Project URL
   - `anon` (public) key
   - `service_role` key  
   In **Settings → JWT**, note the JWT secret (used to verify tokens in the backend).

### 2. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Supabase URL, service_role key, and JWT secret
uvicorn app.main:app --reload --port 8000
```

Health check: [http://localhost:8000/health](http://localhost:8000/health)

### 3. Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, create a room, and share the invite link.

### 4. Realtime

Document content, comments, and chat use **Supabase Realtime** (PostgreSQL changes). The migration adds the relevant tables to the `supabase_realtime` publication. No polling or Socket.io.

## Deployment

### Backend (Railway)

1. Create a new project on [Railway](https://railway.app).
2. Add a service, connect the repo, set root to `backend`.
3. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `CORS_ORIGINS` (include your frontend URL).
4. Deploy; Railway will use `railway.json` / `Procfile` for start command.

### Frontend (Vercel)

1. Import the repo in [Vercel](https://vercel.com).
2. Set root to `frontend`.
3. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (your Railway backend URL).
4. Deploy.

## API (Backend)

- `POST /rooms` — Create room (body: `{ "name": "..." }`), requires Bearer token.
- `GET /rooms` — List current user’s rooms.
- `GET /rooms/{id}` — Get room and document (must be member).
- `POST /rooms/join` — Join by invite slug (body: `{ "invite_slug": "..." }`).

Documents, comments, and chat are read/written by the frontend via the Supabase client (with RLS).

## License

MIT
