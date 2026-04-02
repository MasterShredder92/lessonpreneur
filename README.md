# Lessonpreneur

AI-first operating system for music schools. CRM + scheduling + billing + teacher workflow + parent engagement + retention engine + operational intelligence.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Realtime, Storage)
- **AI:** Claude API via Supabase Edge Functions
- **Deployment:** Vercel (or any static host)
- **Mobile:** PWA (installable from browser)

## Local Development

```bash
npm install
npm run dev
```

App runs at http://localhost:5173

## Environment Variables

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SQUARE_ACCESS_TOKEN=your-square-token
VITE_SQUARE_APP_ID=your-square-app-id
VITE_W9_ENCRYPTION_KEY=your-encryption-key
```

## Roles

- **Owner** — Full access, business intelligence, financials
- **Admin** — Operations management
- **Teacher** — Schedule, session quick-input, student list
- **Parent** — Progress updates, session reminders, practice lab
- **Student** — Practice lab
