# CodeCollab

A real-time collaborative code review platform where developers submit code, review each other's work, and write code together live.

## Features

### Collaboration
- Real-time collaborative code editor with live cursors — see exactly where others are typing
- Live presence indicators showing who is currently viewing a submission
- Shared countdown timer synced across all viewers in a review session

### Code Review
- Submit code for review with title, language, and problem description
- Inline comments on specific line numbers with threaded replies
- Edit and delete your own comments
- Status tracking: Open → In Review → Resolved
- Emoji reactions on submissions 🔥 💡 ✅ 🐛

### Communication
- Global chat with real-time messaging
- Edit, delete, and react to chat messages
- Organisation private chat — only visible to org members
- Direct messaging between users with unread indicators

### Code Execution
- Run Python, JavaScript, and SQL code directly in the browser
- Sandboxed execution with 5 second timeout
- Output panel with stdout, stderr, and execution history

### Organisations
- Create an organisation and get a unique 8-character invite code
- Share invite code with teammates to let them join
- Private org chat separate from global chat

### Discovery
- Leaderboard showing top contributors by submissions, comments, and reactions
- User profiles with submission and comment history
- Real-time activity feed on dashboard

### Auth
- Email and password signup/login
- GitHub OAuth
- Forgot password and reset password flow

## Tech Stack

**Frontend**
- Next.js 14 (TypeScript)
- Tailwind CSS
- CodeMirror 6
- Recharts
- Supabase JS SDK
- Lucide React

**Backend**
- FastAPI (Python)
- Uvicorn
- Supabase Python SDK
- RestrictedPython (sandboxed code execution)

**Database & Auth**
- Supabase (PostgreSQL)
- Supabase Auth
- Supabase Realtime
- Row Level Security

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase account

### Installation

1. Clone the repository
```bash
git clone https://github.com/ashah5123/CodeCollab.git
cd CodeCollab
```

2. Set up the backend
```bash
cd backend
pip install -r requirements.txt
```

3. Set up the frontend
```bash
cd frontend
npm install --legacy-peer-deps
```

4. Create environment files

Backend `.env`:
```
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_KEY=your-service-role-key
FRONTEND_URL=http://localhost:3000
```

Frontend `.env`:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

5. Run the SQL schema in your Supabase SQL editor (see `supabase/schema.sql`)

6. Start the backend
```bash
cd backend
uvicorn app.main:app --reload
```

7. Start the frontend
```bash
cd frontend
npm run dev
```

8. Open http://localhost:3000

## Environment Variables

### Backend
| Variable | Description |
|----------|-------------|
| SUPABASE_URL | Your Supabase project URL |
| SUPABASE_SERVICE_KEY | Supabase service role key (keep secret) |
| FRONTEND_URL | Frontend URL for CORS |

### Frontend
| Variable | Description |
|----------|-------------|
| NEXT_PUBLIC_SUPABASE_URL | Your Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon/public key |
| NEXT_PUBLIC_BACKEND_URL | Backend API URL |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

## License

MIT
