# Lemnisca Discussion Panel

Internal tool for running AI-powered multi-agent brainstorming sessions.

## Setup

1. Create a Supabase project and run the migrations in `supabase/migrations/`
2. Set up the Next.js frontend — see `apps/web/`
3. Set up the Python worker — see `apps/worker/`

## Architecture

- **Frontend:** Next.js on Vercel
- **Worker:** Python FastAPI on Railway
- **Database:** Supabase (PostgreSQL + Realtime)
