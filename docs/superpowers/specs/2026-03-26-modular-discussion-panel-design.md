# Lemnisca Discussion Panel — Modular Web App Design Spec

*Created: 2026-03-26*

---

## 1. Overview

Transform the existing hardcoded Python brainstorming panel into a modular, web-based internal tool. Any team member can create projects, define custom personas, write problem statements, configure session parameters, and run AI-powered multi-agent discussion panels — all from a browser.

### Goals

- Decouple personas, problem statements, and configuration from code
- Provide a web UI for project and session management
- Stream panel discussions in real-time
- Support reusable persona templates
- Enable result sharing and export

### Non-Goals

- Multi-tenant SaaS with billing
- Support for multiple LLM providers (Gemini only)
- Public-facing product

---

## 2. Architecture

### System Components

```
┌─────────────────────────┐       ┌──────────────────────────┐
│     Vercel (Next.js)    │       │  Railway (Python/FastAPI) │
│                         │       │                           │
│  Pages:                 │       │  Endpoints:               │
│  - Login (password)     │       │  - POST /sessions/{id}/   │
│  - Dashboard (projects) │       │    start                  │
│  - Project detail       │       │  - POST /sessions/{id}/   │
│  - Persona editor       │       │    stop                   │
│  - Session config       │       │  - GET  /health           │
│  - Live session view    │       │                           │
│  - Results & synthesis  │       │  On start:                │
│                         │       │  1. Fetch session config   │
│  API Routes:            │       │     from Supabase         │
│  - CRUD projects        │       │  2. Build AutoGen agents  │
│  - CRUD personas        │       │  3. Run panel             │
│  - CRUD sessions        │       │  4. Insert messages to    │
│  - Trigger session      │◄──────┤     Supabase row-by-row   │
│    (calls Railway)      │───────►  5. Generate synthesis     │
│                         │       │  6. Update session status  │
└──────────┬──────────────┘       └──────────┬────────────────┘
           │                                  │
           │         ┌──────────────┐         │
           └────────►│   Supabase   │◄────────┘
                     │              │
                     │  - PostgreSQL│
                     │  - Realtime  │
                     └──────────────┘
```

### Communication Flow

1. User configures session in Next.js (picks personas, sets rounds/temperature, writes problem statement)
2. Next.js API route creates session record in Supabase, then calls Railway `POST /sessions/{id}/start`
3. Railway fetches full session config + persona system prompts from Supabase
4. Railway builds AutoGen agents, runs the panel
5. After each agent turn (one message from one persona), Railway inserts a row into Supabase `messages` table
6. Frontend subscribes to Supabase Realtime on `messages` where `session_id = X` — messages appear live
7. When panel finishes, Railway runs synthesis, saves it, updates session status to `completed`
8. Frontend detects status change via Realtime subscription on `sessions`, shows synthesis view

### Service Authentication

- **Frontend ↔ Supabase:** Supabase anon key (no RLS, internal tool)
- **Frontend ↔ Railway:** Shared API secret in `X-API-Secret` header
- **Railway ↔ Supabase:** Supabase service role key
- **User ↔ Frontend:** Shared team password, stored as HTTP-only cookie
- **Browser ↔ Railway:** No direct communication. All Railway calls go through Next.js API routes (no CORS needed)
- **Security note:** Supabase anon key is exposed in the browser with no RLS. This means anyone with dev tools can read/write all tables directly. Acceptable for an internal tool behind a team password, but documented as a known tradeoff.

---

## 3. Data Model

### `projects`

| Column       | Type        | Notes                    |
|--------------|-------------|--------------------------|
| id           | uuid (PK)   | Default `gen_random_uuid()` |
| name         | text        | Required                 |
| description  | text        | Optional                 |
| created_by   | text        | Free-text display name entered at login (no user accounts — just for attribution) |
| created_at   | timestamptz | Default `now()`          |

### `personas`

| Column        | Type        | Notes                                      |
|---------------|-------------|---------------------------------------------|
| id            | uuid (PK)   | Default `gen_random_uuid()`                 |
| project_id    | uuid (FK)   | Nullable — null means global template       |
| name          | text        | e.g., "Fermentation Veteran"               |
| role          | text        | One-line role description                   |
| description   | text        | Short description for the agent selector LLM (AutoGen `description` param) |
| system_prompt | text        | Full system prompt (the persona definition) |
| is_template   | boolean     | Default `false`                             |
| created_at    | timestamptz | Default `now()`                             |

### `sessions`

| Column            | Type        | Notes                                          |
|-------------------|-------------|------------------------------------------------|
| id                | uuid (PK)   | Default `gen_random_uuid()`                    |
| project_id        | uuid (FK)   | Required                                       |
| problem_statement | text        | The full problem/prompt for the panel          |
| max_rounds        | integer     | Default `50`                                   |
| temperature       | float       | Default `0.7`                                  |
| model             | text        | Default `gemini-3.1-pro-preview`               |
| status            | text        | Enum: `pending`, `running`, `completed`, `cancelled`, `failed` |
| error_message     | text        | Nullable — populated on failure                |
| created_at        | timestamptz | Default `now()`                                |
| started_at        | timestamptz | Nullable — set when panel starts               |
| completed_at      | timestamptz | Nullable — set when panel finishes             |

### `session_personas`

| Column     | Type      | Notes                         |
|------------|-----------|-------------------------------|
| id         | uuid (PK) | Default `gen_random_uuid()`   |
| session_id | uuid (FK) | Required                      |
| persona_id | uuid (FK) | Required                      |

| position   | integer   | Display/rotation order (1-indexed)  |

Unique constraint on `(session_id, persona_id)`.

### `messages`

| Column       | Type        | Notes                       |
|--------------|-------------|-----------------------------|
| id           | uuid (PK)   | Default `gen_random_uuid()` |
| session_id   | uuid (FK)   | Required                    |
| turn_number  | integer     | 1-indexed. Each agent message = 1 turn (not a full rotation of all speakers) |
| persona_id   | uuid (FK)   | Who spoke                   |
| content      | text        | Message content (markdown)  |
| created_at   | timestamptz | Default `now()`             |

### `syntheses`

| Column     | Type        | Notes                       |
|------------|-------------|-----------------------------|
| id         | uuid (PK)   | Default `gen_random_uuid()` |
| session_id | uuid (FK)   | Unique — one per session    |
| content    | text        | Full synthesis (markdown)   |
| created_at | timestamptz | Default `now()`             |

---

## 4. Frontend (Next.js on Vercel)

### Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- `@supabase/supabase-js` for DB + Realtime
- `react-markdown` for rendering content
- `html2pdf.js` for PDF export
- `js-cookie` for session management

### Pages

**`/login`** — Password input + optional "Display name" text field (stored in cookie, used for `created_by` on projects). On match, sets HTTP-only cookie via API route. Redirects to dashboard.

**`/` (Dashboard)** — Grid of project cards showing name, description, session count, last activity. "New Project" button opens a modal (name + description).

**`/projects/[id]`** — Tabbed layout:

- **Personas tab:** List of personas in project. "Add from templates" button opens template library picker. "Create custom" button opens persona editor. Each persona card shows name, role, and edit/delete actions. Click to expand and edit system prompt.
- **Sessions tab:** Table of sessions with status badge, round count, date. Click row to view results. "New Session" button navigates to config page. "Duplicate" button on each session to clone its config (same personas, problem statement, rounds, temperature) into a new session for re-runs.
- **Settings tab:** Edit project name/description. Delete project (with confirmation).

**`/projects/[id]/sessions/new`** — Session configuration form:

- Problem statement: large textarea with markdown preview toggle
- Persona selection: checkboxes from project's persona list (minimum 2 required)
- Rounds: number input with preset buttons (20, 50, 70, 100), custom allowed (1-200)
- Temperature: slider with value display (0.3–1.0, step 0.05, default 0.7)
- "Start Panel" button — validates, creates session, triggers Railway, redirects to live view

**`/sessions/[id]`** — Live session view:

- Top bar: "Turn 23/50" progress text + progress bar, elapsed time, "Stop" button
- Main area: chat-style message feed. Each message shows persona name with a colored dot, round number badge, and content rendered as markdown. New messages animate in from Supabase Realtime subscription.
- On completion: banner appears with "View Synthesis" link

**`/sessions/[id]/results`** — Results view with two tabs:

- **Transcript tab:** Full scrollable transcript with persona indicators, round separators, and text search (client-side filter)
- **Synthesis tab:** Rendered synthesis report
- Action bar: "Download Markdown" (transcript + synthesis as .md files), "Download PDF" (synthesis as styled PDF), "Copy Share Link"

**`/shared/[sid]`** — Public read-only view. Shows transcript + synthesis for a session. No password required — UUID acts as unguessable token. No navigation to other projects/sessions.

**`/templates`** — Global persona template library. Grid of template cards. "Create Template" button. Ships with 6 built-in templates (the existing personas). Users can also "Save as template" from any project persona.

### Auth Middleware

Next.js middleware checks for the password cookie on all routes except `/login` and `/shared/*`. Missing or invalid cookie redirects to `/login`.

---

## 5. Backend Worker (Python on Railway)

### Tech Stack

- Python 3.13+
- FastAPI + Uvicorn
- `pyautogen` + `autogen-ext[openai]`
- `supabase-py`

### Module Structure

```
worker/
├── main.py              # FastAPI app, endpoint definitions
├── runner.py            # Panel orchestration (run_panel async function)
├── agents.py            # build_agents() from DB persona data
├── selector.py          # make_selector_func() rotation logic
├── synthesis.py         # run_synthesis() generates final report
├── db.py                # Supabase client wrapper
├── requirements.txt
└── Dockerfile
```

### Endpoints

**`POST /sessions/{session_id}/start`**
- Validates `X-API-Secret` header
- Returns `202 Accepted` immediately
- Launches `run_panel()` as a background task via `asyncio`
- `run_panel()`:
  1. Updates session status to `running`, sets `started_at`
  2. Fetches session config + persona system prompts from Supabase
  3. Creates OpenAI-compatible Gemini client
  4. Builds AutoGen `AssistantAgent` instances from persona data
  5. Creates `SelectorGroupChat` with rotation-enforcing selector
  6. Runs panel with `MaxMessageTermination(max_rounds)`
  7. After each agent message: inserts row into `messages` table
  8. On completion: runs synthesis via separate synthesizer agent
  9. Saves synthesis to `syntheses` table
  10. Updates session status to `completed`, sets `completed_at`
  11. On error: updates status to `failed`, saves `error_message`

**`POST /sessions/{session_id}/stop`**
- Validates `X-API-Secret` header
- Sets a cancellation flag for the running session
- Panel checks flag after each round; if set, stops gracefully
- Runs synthesis on completed rounds
- Updates session status to `completed` with actual round count

**`GET /health`**
- Returns `200 OK` with worker status

### Key Adaptations from Existing Code

The existing `lemnisca_panelv3.py` maps to the worker modules as follows:

- `PROBLEM_STATEMENT` constant → fetched from `sessions.problem_statement` in Supabase
- `PERSONA_*` constants → fetched from `personas.system_prompt` via `session_personas` join
- `MAX_ROUNDS`, `TEMPERATURE` → fetched from `sessions` record
- `make_client()` → stays the same in `agents.py`
- `build_agents()` → dynamically creates agents from DB data instead of hardcoded prompts
- `make_selector_func()` → moves to `selector.py`, works with dynamic persona names
- `save_transcript()` → replaced by per-message inserts to Supabase
- `run_synthesis()` → moves to `synthesis.py`, saves to `syntheses` table
- `SELECTOR_PROMPT` → dynamically generated by `selector.py` at runtime from session parameters. The template is stored in code but persona names, round ranges for phase awareness (e.g., "Rounds 1-15" becomes proportional to `max_rounds`), and rotation rules are injected based on the session's persona list and round count.
- `SYNTHESIS_PROMPT` → stored as a constant in `synthesis.py`. Stable across sessions — does not reference persona names or round counts.
- Problem statement injection: `runner.py` passes `sessions.problem_statement` as the `task` argument to `team.run_stream(task=...)`, which becomes the initial message that kicks off the panel.

### Concurrency

The worker supports multiple concurrent panels using `asyncio` tasks. Each panel is I/O-bound (waiting on Gemini API calls), so a single Railway instance can handle several sessions simultaneously. Active sessions are tracked in an in-memory dict of `session_id → asyncio.Task`. The `/start` endpoint rejects duplicate starts for the same session (returns `409 Conflict`) but allows different sessions to run in parallel.

### Cancellation

The stop mechanism uses an in-memory `asyncio.Event` per session. When `/stop` is called, the event is set. `runner.py` checks the event after each agent turn. If set, the panel stops gracefully, runs synthesis on completed turns, and updates the session status to `cancelled`. This approach is simple and works with a single Railway instance. If horizontal scaling is needed later, move the cancel flag to a `cancel_requested` boolean column on the `sessions` table and have the worker poll it.

### Retry & Error Handling

- Gemini API calls: exponential backoff, 3 retries per agent turn
- On 3 consecutive failures: mark session as `failed` with error details
- Supabase inserts: retry once on failure, log and continue if still failing (don't halt the panel over a DB write)

---

## 6. Persona Templates

### Built-in Templates (shipped with the app)

Six templates ported from the existing codebase:

1. **Fermentation Veteran** — Real plant scale-up expert. Grounds discussion in actual fermentation troubleshooting.
2. **Ops Leader** — Manufacturing operations director. Represents operational pressure and senior leadership priorities.
3. **MSAT Lead** — Technical Services expert. Defends the working user who must frame messy incidents early.
4. **Product Thinker** — Digital product designer. Translates industrial pain into digital product forms.
5. **First Principles Outsider** — Non-domain expert. Challenges assumptions, breaks industry pattern-lock.
6. **BioChem Professor** — Biochemical engineering authority. Enforces scientific rigor and first-principles logic.

### Template Mechanics

- Templates stored with `is_template = true`, `project_id = null`
- Adding a template to a project clones it: creates a new persona record with `project_id` set, `is_template = false`
- Editing a cloned persona does not affect the original template
- Users can create new global templates from the `/templates` page
- Users can "Save as template" from any project persona (clones it with `project_id = null`, `is_template = true`)

---

## 7. Shareable Links & Export

### Shareable Links

- URL format: `/shared/[session_id]`
- Read-only view: transcript + synthesis rendered in browser
- No authentication required — UUID v4 session ID acts as unguessable token
- No access to dashboard, projects, or other sessions from this page

### Markdown Export

- Downloads two files: `transcript.md` and `synthesis.md`
- Transcript format matches existing output: `### [Round#] Speaker_Name\n\nContent\n\n---`
- Synthesis format matches existing output structure

### PDF Export

- Client-side generation using `html2pdf.js`
- Exports the synthesis report as a styled PDF
- Includes session metadata (project name, date, round count, personas used)

---

## 8. Environment Variables

### Vercel

| Variable                        | Description                          |
|---------------------------------|--------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service role key (API routes) |
| `RAILWAY_WORKER_URL`            | Railway service URL                  |
| `RAILWAY_API_SECRET`            | Shared secret for Railway auth       |
| `APP_PASSWORD`                  | Team shared password                 |

### Railway

| Variable                   | Description                         |
|----------------------------|-------------------------------------|
| `SUPABASE_URL`             | Supabase project URL                |
| `SUPABASE_SERVICE_ROLE_KEY`| Supabase service role key           |
| `GEMINI_API_KEY`           | Google Gemini API key               |
| `API_SECRET`               | Must match Vercel's `RAILWAY_API_SECRET` |

---

## 9. Project Structure

```
lemnisca-panel/
├── apps/
│   ├── web/                              # Next.js (Vercel)
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                  # Dashboard
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── projects/
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx          # Project detail (tabs)
│   │   │   │       └── sessions/
│   │   │   │           ├── new/
│   │   │   │           │   └── page.tsx  # Session config
│   │   │   │           └── [sid]/
│   │   │   │               ├── page.tsx  # Live view
│   │   │   │               └── results/
│   │   │   │                   └── page.tsx
│   │   │   ├── templates/
│   │   │   │   └── page.tsx              # Persona template library
│   │   │   ├── shared/
│   │   │   │   └── [sid]/
│   │   │   │       └── page.tsx          # Public shareable view
│   │   │   └── api/
│   │   │       ├── auth/
│   │   │       │   └── route.ts          # Password verify, cookie set
│   │   │       ├── projects/
│   │   │       │   ├── route.ts          # List, create
│   │   │       │   └── [id]/
│   │   │       │       └── route.ts      # Get, update, delete
│   │   │       ├── personas/
│   │   │       │   ├── route.ts          # List, create
│   │   │       │   └── [id]/
│   │   │       │       └── route.ts      # Get, update, delete
│   │   │       ├── templates/
│   │   │       │   └── route.ts          # List, create templates
│   │   │       └── sessions/
│   │   │           ├── route.ts          # List, create
│   │   │           └── [id]/
│   │   │               ├── route.ts      # Get, update
│   │   │               ├── start/
│   │   │               │   └── route.ts  # Trigger Railway
│   │   │               └── stop/
│   │   │                   └── route.ts  # Stop Railway
│   │   ├── components/
│   │   │   ├── ui/                       # shadcn components
│   │   │   ├── project-card.tsx
│   │   │   ├── persona-editor.tsx
│   │   │   ├── persona-picker.tsx
│   │   │   ├── session-config-form.tsx
│   │   │   ├── live-transcript.tsx
│   │   │   ├── synthesis-view.tsx
│   │   │   ├── export-buttons.tsx
│   │   │   └── auth-guard.tsx
│   │   ├── lib/
│   │   │   ├── supabase.ts              # Client setup
│   │   │   ├── auth.ts                  # Password middleware
│   │   │   └── types.ts                 # Shared TypeScript types
│   │   ├── middleware.ts                 # Auth check on routes
│   │   ├── package.json
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── next.config.js
│   │
│   └── worker/                           # Python FastAPI (Railway)
│       ├── main.py                       # FastAPI app, endpoints
│       ├── runner.py                     # Panel orchestration
│       ├── agents.py                     # Build AutoGen agents from DB
│       ├── selector.py                   # Rotation-enforcing selector
│       ├── synthesis.py                  # Synthesis generation
│       ├── db.py                         # Supabase client wrapper
│       ├── requirements.txt
│       └── Dockerfile
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql        # All tables + indexes
│       └── 002_seed_templates.sql        # INSERT statements for 6 built-in persona templates
│
└── README.md
```

---

## 10. Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Railway down mid-panel | Session stays `running`. Frontend compares `now()` to the `created_at` of the last received Realtime message — if >5 min gap, shows "Session may have stalled" warning with a "Retry" button. |
| Gemini rate limit | Worker retries with exponential backoff (3 attempts). Fails session after 3 consecutive errors. |
| User clicks Stop | Railway stops after current turn. Synthesis runs on completed turns. Status → `cancelled` (distinguishable from natural completion). |
| Less than 2 personas selected | Frontend validation prevents submission. Worker also validates on start (minimum 2 personas) to guard against direct API misuse. |
| Empty problem statement | Frontend validation prevents submission. |
| Panel already running on worker | Railway returns `409 Conflict`. Frontend shows message to wait. |
| Supabase write failure during panel | Retry once, log error, continue panel. Message may be missing from transcript but panel doesn't halt. |
| Shared link for deleted/failed session | Show appropriate error page with context. |

### Error UI States

- **Failed session:** Results page shows error banner with `error_message` from the session record, plus any turns that completed before failure.
- **Cancelled session:** Results page shows info banner "Session was stopped after turn X of Y" with available transcript + synthesis from partial data.
- **Stalled session:** Live view shows warning after 5 min of no messages: "This session may have stalled. You can wait or retry."
- **Worker unavailable:** When triggering a new session and Railway is unreachable, show toast error: "Panel worker is currently unavailable. Please try again later."
