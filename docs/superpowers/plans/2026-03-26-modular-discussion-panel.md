# Modular Discussion Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based internal tool where team members can create brainstorming projects, define personas, configure sessions, and run AI-powered multi-agent discussion panels with real-time streaming.

**Architecture:** Next.js frontend on Vercel for UI + API routes, Python FastAPI worker on Railway for running AutoGen panels, Supabase PostgreSQL + Realtime for persistence and live updates. The frontend handles CRUD and triggers the worker; the worker runs panels and writes messages to Supabase row-by-row; the frontend subscribes to Realtime for live streaming.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase JS, Python 3.13+, FastAPI, AutoGen v0.4, Gemini 3.1 Pro

**Spec:** `docs/superpowers/specs/2026-03-26-modular-discussion-panel-design.md`

---

## File Structure

```
lemnisca-panel/
├── apps/
│   ├── web/                              # Next.js frontend (Vercel)
│   │   ├── app/
│   │   │   ├── layout.tsx                # Root layout with providers
│   │   │   ├── page.tsx                  # Dashboard — project list
│   │   │   ├── login/
│   │   │   │   └── page.tsx              # Password + display name login
│   │   │   ├── projects/
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx          # Project detail with tabs
│   │   │   │       └── sessions/
│   │   │   │           ├── new/
│   │   │   │           │   └── page.tsx  # Session config form
│   │   │   │           └── [sid]/
│   │   │   │               ├── page.tsx  # Live session view
│   │   │   │               └── results/
│   │   │   │                   └── page.tsx  # Transcript + synthesis
│   │   │   ├── templates/
│   │   │   │   └── page.tsx              # Global persona template library
│   │   │   ├── shared/
│   │   │   │   └── [sid]/
│   │   │   │       └── page.tsx          # Public read-only session view
│   │   │   └── api/
│   │   │       ├── auth/
│   │   │       │   └── route.ts          # POST: verify password, set cookie
│   │   │       ├── projects/
│   │   │       │   ├── route.ts          # GET: list, POST: create
│   │   │       │   └── [id]/
│   │   │       │       └── route.ts      # GET, PUT, DELETE
│   │   │       ├── personas/
│   │   │       │   ├── route.ts          # GET: list (by project_id), POST: create
│   │   │       │   └── [id]/
│   │   │       │       └── route.ts      # GET, PUT, DELETE
│   │   │       ├── templates/
│   │   │       │   └── route.ts          # GET: list templates, POST: create
│   │   │       └── sessions/
│   │   │           ├── route.ts          # GET: list (by project_id), POST: create
│   │   │           └── [id]/
│   │   │               ├── route.ts      # GET session with messages
│   │   │               ├── start/
│   │   │               │   └── route.ts  # POST: trigger Railway worker
│   │   │               └── stop/
│   │   │                   └── route.ts  # POST: stop Railway worker
│   │   ├── components/
│   │   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── project-card.tsx          # Project card for dashboard
│   │   │   ├── persona-editor.tsx        # Edit persona name/role/description/prompt
│   │   │   ├── persona-picker.tsx        # Template picker dialog
│   │   │   ├── session-config-form.tsx   # Session creation form
│   │   │   ├── live-transcript.tsx        # Real-time message feed
│   │   │   ├── synthesis-view.tsx        # Rendered synthesis markdown
│   │   │   └── export-buttons.tsx        # Download MD/PDF, copy share link
│   │   ├── lib/
│   │   │   ├── supabase-server.ts        # Server-side Supabase client (service role)
│   │   │   ├── supabase-browser.ts       # Browser-side Supabase client (anon key)
│   │   │   └── types.ts                  # TypeScript types matching DB schema
│   │   ├── middleware.ts                  # Auth cookie check, redirect to /login
│   │   ├── package.json
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   ├── next.config.js
│   │   └── .env.local.example            # Template for env vars
│   │
│   └── worker/                           # Python FastAPI worker (Railway)
│       ├── main.py                       # FastAPI app with 3 endpoints
│       ├── runner.py                     # run_panel() async orchestration
│       ├── agents.py                     # make_client(), build_agents()
│       ├── selector.py                   # make_selector_func(), generate_selector_prompt()
│       ├── synthesis.py                  # SYNTHESIS_PROMPT, run_synthesis()
│       ├── db.py                         # Supabase client: fetch config, insert messages
│       ├── requirements.txt
│       ├── Dockerfile
│       └── .env.example                  # Template for env vars
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql        # Tables, indexes, constraints
│       └── 002_seed_templates.sql        # 6 built-in persona templates
│
└── README.md
```

---

### Task 1: Initialize Project & Supabase Schema

**Files:**
- Create: `lemnisca-panel/supabase/migrations/001_initial_schema.sql`
- Create: `lemnisca-panel/supabase/migrations/002_seed_templates.sql`
- Create: `lemnisca-panel/README.md`

- [ ] **Step 1: Create the project root directory**

```bash
mkdir -p lemnisca-panel/supabase/migrations
```

- [ ] **Step 2: Write the database schema migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Projects
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  created_by text DEFAULT 'anonymous',
  created_at timestamptz DEFAULT now()
);

-- Personas (templates have project_id = NULL)
CREATE TABLE personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  system_prompt text NOT NULL DEFAULT '',
  is_template boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_personas_project ON personas(project_id);
CREATE INDEX idx_personas_template ON personas(is_template) WHERE is_template = true;

-- Sessions
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  problem_statement text NOT NULL,
  max_rounds integer NOT NULL DEFAULT 50,
  temperature float NOT NULL DEFAULT 0.7,
  model text NOT NULL DEFAULT 'gemini-3.1-pro-preview',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','cancelled','failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- Session-Persona join
CREATE TABLE session_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  UNIQUE(session_id, persona_id)
);

-- Messages (one per agent turn)
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  persona_id uuid NOT NULL REFERENCES personas(id),
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_messages_session ON messages(session_id);

-- Syntheses (one per session)
CREATE TABLE syntheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Enable Realtime on messages and sessions tables
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
```

- [ ] **Step 3: Write the seed migration for 6 built-in persona templates**

Create `supabase/migrations/002_seed_templates.sql`. This file inserts the 6 personas from the existing v3 code with `is_template = true` and `project_id = NULL`. Each INSERT includes: name, role, description (from the `AssistantAgent` description arg in v3), system_prompt (the full PERSONA_* constant from v3), is_template = true.

The system prompts are very long (150+ lines each). Copy them verbatim from `v3/lemnisca_panelv3.py` lines 609-975 into the INSERT VALUES. The description values come from `build_agents()` at lines 1034-1072.

```sql
INSERT INTO personas (name, role, description, system_prompt, is_template) VALUES
('Fermentation_Veteran',
 'Real plant scale-up expert',
 'Grounds discussion in real plant scale-up and troubleshooting pain. Challenges weak realism.',
 E'<COPY FULL PERSONA_VETERAN FROM v3/lemnisca_panelv3.py lines 610-667>',
 true),
('Ops_Leader',
 'Manufacturing operations director',
 'Represents manufacturing operational pressure and what senior plant leaders actually value.',
 E'<COPY FULL PERSONA_OPS FROM v3/lemnisca_panelv3.py lines 670-726>',
 true),
('MSAT_Lead',
 'Technical Services/Troubleshooting expert',
 'Defends the primary working user — MSAT/technical services — who frames messy incidents.',
 E'<COPY FULL PERSONA_MSAT FROM v3/lemnisca_panelv3.py lines 729-787>',
 true),
('Product_Thinker',
 'Digital product designer',
 'Translates industrial pain into named, concrete digital product forms with low friction.',
 E'<COPY FULL PERSONA_PRODUCT FROM v3/lemnisca_panelv3.py lines 790-848>',
 true),
('First_Principles_Outsider',
 'Non-domain first-principles expert',
 'Challenges hidden assumptions and breaks industry pattern-lock from outside the domain.',
 E'<COPY FULL PERSONA_OUTSIDER FROM v3/lemnisca_panelv3.py lines 851-907>',
 true),
('BioChem_Professor',
 'Biochemical engineering professor-practitioner',
 'Enforces scientific rigor and first-principles biochemical engineering logic.',
 E'<COPY FULL PERSONA_PROFESSOR FROM v3/lemnisca_panelv3.py lines 910-975>',
 true);
```

**Note to implementer:** The `<COPY FULL ...>` placeholders above must be replaced with the actual full system prompt text from the v3 file. Escape single quotes as `''` in SQL.

- [ ] **Step 4: Write README.md**

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add supabase/ README.md
git commit -m "feat: add database schema and seed migrations"
```

---

### Task 2: Python Worker — Core Modules (db, agents, selector, synthesis)

**Files:**
- Create: `lemnisca-panel/apps/worker/db.py`
- Create: `lemnisca-panel/apps/worker/agents.py`
- Create: `lemnisca-panel/apps/worker/selector.py`
- Create: `lemnisca-panel/apps/worker/synthesis.py`
- Create: `lemnisca-panel/apps/worker/requirements.txt`
- Create: `lemnisca-panel/apps/worker/.env.example`

- [ ] **Step 1: Create directory and requirements.txt**

```bash
mkdir -p lemnisca-panel/apps/worker
```

```
# requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.34.0
pyautogen>=0.4
autogen-ext[openai]
supabase>=2.0.0
python-dotenv>=1.0.0
```

```
# .env.example
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
API_SECRET=your-shared-secret
```

- [ ] **Step 2: Write db.py — Supabase client wrapper**

```python
import os
from supabase import create_client, Client

_client: Client | None = None

def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _client

def fetch_session_config(session_id: str) -> dict:
    """Fetch session + joined personas ordered by position."""
    client = get_client()
    session = client.table("sessions").select("*").eq("id", session_id).single().execute()
    personas = (
        client.table("session_personas")
        .select("position, personas(*)")
        .eq("session_id", session_id)
        .order("position")
        .execute()
    )
    return {
        "session": session.data,
        "personas": [p["personas"] for p in personas.data],
    }

def update_session_status(session_id: str, status: str, **kwargs):
    client = get_client()
    data = {"status": status, **kwargs}
    client.table("sessions").update(data).eq("id", session_id).execute()

def insert_message(session_id: str, turn_number: int, persona_id: str, content: str):
    client = get_client()
    client.table("messages").insert({
        "session_id": session_id,
        "turn_number": turn_number,
        "persona_id": persona_id,
        "content": content,
    }).execute()

def insert_synthesis(session_id: str, content: str):
    client = get_client()
    client.table("syntheses").insert({
        "session_id": session_id,
        "content": content,
    }).execute()
```

- [ ] **Step 3: Write agents.py — client and agent builder**

```python
import os
from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient

def make_client(model: str = "gemini-3.1-pro-preview", temperature: float = 0.7):
    return OpenAIChatCompletionClient(
        model=model,
        api_key=os.environ["GEMINI_API_KEY"],
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        temperature=temperature,
        model_capabilities={
            "vision": False,
            "function_calling": False,
            "json_output": False,
        },
    )

def build_agents(personas: list[dict], client) -> list[AssistantAgent]:
    """Build AutoGen agents from persona DB records.

    Each persona dict has: id, name, role, description, system_prompt
    """
    agents = []
    for p in personas:
        agents.append(
            AssistantAgent(
                name=p["name"],
                description=p["description"],
                system_message=p["system_prompt"],
                model_client=client,
            )
        )
    return agents
```

- [ ] **Step 4: Write selector.py — rotation logic + dynamic selector prompt**

```python
from collections import defaultdict

def make_selector_func(persona_names: list[str]):
    """Returns a rotation-enforcing selector function.

    Adapated from v3/lemnisca_panelv3.py make_selector_func().
    Works with any list of persona names.
    """
    last_spoke = defaultdict(int)
    turn_counter = [0]

    def selector_func(messages):
        turn_counter[0] += 1
        current_turn = turn_counter[0]

        last_speaker = None
        for msg in reversed(messages):
            source = getattr(msg, "source", None)
            if source in persona_names:
                last_speaker = source
                break

        candidates = [p for p in persona_names if p != last_speaker]
        candidates.sort(key=lambda p: last_spoke[p])
        chosen = candidates[0]
        last_spoke[chosen] = current_turn
        return chosen

    return selector_func

def generate_selector_prompt(persona_names: list[str], persona_descriptions: dict[str, str], max_rounds: int) -> str:
    """Dynamically generate the selector prompt based on session config.

    Phase boundaries are proportional to max_rounds.
    """
    participants_block = "\n".join(
        f"- {name}: {persona_descriptions[name]}" for name in persona_names
    )
    n = len(persona_names)

    # Proportional phase boundaries
    p1_end = max(1, int(max_rounds * 0.30))
    p2_end = max(p1_end + 1, int(max_rounds * 0.60))
    p3_end = max(p2_end + 1, int(max_rounds * 0.84))
    p4_start = p3_end + 1

    return f"""You are selecting the next speaker in an expert brainstorming panel.

The participants are:
{participants_block}

STRICT ROTATION RULE — THIS IS YOUR MOST IMPORTANT INSTRUCTION:
Look at the last {n} messages in the conversation history and identify which participants
have spoken. DO NOT select anyone who has spoken in the last {max(2, n // 2)} messages.
Prioritize participants who have NOT spoken recently.

SELECTION RULES (apply after rotation rule):
1. If a strong claim was just made, select someone who would DISAGREE with it
2. If a product idea was proposed, select someone who would stress-test it
3. If discussion gets abstract, select someone who would ground it
4. If the group is converging too fast, select someone who would challenge
5. ALL {n} participants must speak in every {n}-message window — no exceptions

CRITICAL: You MUST select a different participant than the last speaker.
You MUST ensure all {n} participants get roughly equal airtime.

PHASE AWARENESS:
- Turns 1-{p1_end}:     Each persona stakes their position
- Turns {p1_end+1}-{p2_end}:   Cross-debate — challenge each other
- Turns {p2_end+1}-{p3_end}:   Converge on specific, named concepts
- Turns {p4_start}-{max_rounds}:  Stress-test and rank the shortlist

Select only ONE participant name from the list above.
"""
```

- [ ] **Step 5: Write synthesis.py — synthesis generation**

```python
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.messages import TextMessage
from autogen_core import CancellationToken

SYNTHESIS_PROMPT = """
You are a Senior Strategy Synthesizer reading a complete expert panel discussion
transcript. Produce a structured, actionable final report. Every sentence must
earn its place. Use any domain-specific classification frameworks referenced
in the discussion where relevant (e.g., lifecycle contexts, problem hierarchies).

## 1. Consensus Areas
What did the panel genuinely agree on? Which pain areas and directions
had multi-persona support? Be specific about which categories converged.

## 2. Key Tensions and Unresolved Debates
What were the most important disagreements? Where did personas clash most
productively? What remains unresolved and why does it matter?

## 3. Shortlisted Concepts
List the 2-4 strongest concepts that emerged. For each:
  - Name / working title
  - Product form (triage tool / diagnostic framework / assessment calculator / etc.)
  - Which user pain it addresses
  - Why it works as a top-of-funnel wedge (if applicable)
  - Strongest objection raised by the panel
  - Confidence: High / Medium / Exploratory

## 4. Explicitly Rejected Directions
What ideas did the panel dismiss and why? Be blunt.

## 5. Recommended First Move
One concrete recommendation specific enough to brief a product team tomorrow.

## 6. Open Questions That Would Change the Direction
What do we still not know that could significantly alter the recommendation?
"""

async def run_synthesis(messages_text: str, client) -> str:
    """Run the synthesizer agent on the transcript and return the synthesis text."""
    synthesizer = AssistantAgent(
        name="Synthesizer",
        description="Produces the final structured synthesis report.",
        system_message=SYNTHESIS_PROMPT,
        model_client=client,
    )

    response = await synthesizer.on_messages(
        [TextMessage(
            content=(
                "Here is the complete panel discussion transcript:\n\n"
                + messages_text
                + "\n\nPlease produce the full structured synthesis report now."
            ),
            source="user",
        )],
        cancellation_token=CancellationToken(),
    )

    return response.chat_message.content if response.chat_message else ""
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/
git commit -m "feat: add worker core modules — db, agents, selector, synthesis"
```

---

### Task 3: Python Worker — Runner & FastAPI Endpoints

**Files:**
- Create: `lemnisca-panel/apps/worker/runner.py`
- Create: `lemnisca-panel/apps/worker/main.py`
- Create: `lemnisca-panel/apps/worker/Dockerfile`

- [ ] **Step 1: Write runner.py — panel orchestration**

```python
import asyncio
from datetime import datetime, timezone
from autogen_agentchat.teams import SelectorGroupChat
from autogen_agentchat.conditions import MaxMessageTermination
from agents import make_client, build_agents
from selector import make_selector_func, generate_selector_prompt
from synthesis import run_synthesis
from db import fetch_session_config, update_session_status, insert_message, insert_synthesis

async def run_panel(session_id: str, cancel_event: asyncio.Event):
    """Run a full panel session. Called as an asyncio background task."""
    try:
        update_session_status(session_id, "running", started_at=datetime.now(timezone.utc).isoformat())

        config = fetch_session_config(session_id)
        session = config["session"]
        personas = config["personas"]

        if len(personas) < 2:
            update_session_status(session_id, "failed", error_message="At least 2 personas required")
            return

        client = make_client(
            model=session["model"],
            temperature=session["temperature"],
        )
        agents = build_agents(personas, client)

        persona_names = [p["name"] for p in personas]
        persona_descriptions = {p["name"]: p["description"] for p in personas}
        # Map persona name -> persona id for message inserts
        persona_id_map = {p["name"]: p["id"] for p in personas}

        max_rounds = session["max_rounds"]

        selector_prompt = generate_selector_prompt(persona_names, persona_descriptions, max_rounds)
        termination = MaxMessageTermination(max_rounds)

        team = SelectorGroupChat(
            participants=agents,
            model_client=client,
            termination_condition=termination,
            selector_prompt=selector_prompt,
            selector_func=make_selector_func(persona_names),
        )

        turn = 0
        collected_messages = []

        # run_stream() yields various event types. We use Console to process
        # the stream (same as v3) but also intercept messages for DB inserts.
        # Alternative: iterate the stream directly and filter for agent messages.
        from autogen_agentchat.ui import Console

        result = await Console(team.run_stream(task=session["problem_statement"]))

        # Process result.messages to insert into DB
        for message in result.messages:
            # Check cancellation between messages
            if cancel_event.is_set():
                break

            source = getattr(message, "source", None)
            content = getattr(message, "content", None)

            if source in persona_names and isinstance(content, str) and content.strip():
                turn += 1
                persona_id = persona_id_map.get(source)
                if persona_id:
                    try:
                        insert_message(session_id, turn, persona_id, content.strip())
                    except Exception:
                        try:
                            # Retry once on failure
                            insert_message(session_id, turn, persona_id, content.strip())
                        except Exception:
                            pass  # Don't halt panel over DB write failure
                collected_messages.append(f"[{source}]:\n{content.strip()}")

        # Run synthesis
        transcript_text = "\n\n".join(collected_messages)
        try:
            synthesis_content = await run_synthesis(transcript_text, client)
            insert_synthesis(session_id, synthesis_content)
        except Exception as e:
            # Synthesis failure is non-fatal — transcript is already saved
            pass

        final_status = "cancelled" if cancel_event.is_set() else "completed"
        update_session_status(
            session_id,
            final_status,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

    except Exception as e:
        update_session_status(
            session_id,
            "failed",
            error_message=str(e)[:1000],
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
```

**Important note to implementer:** The code now uses `Console(team.run_stream())` like the v3 code, then iterates `result.messages` to insert into the DB. This means messages are inserted after the panel completes (not live during execution). For true real-time streaming, you'll need to iterate the async stream directly instead of using Console, and handle the various event types AutoGen yields. The current approach is simpler and matches v3 — real-time streaming can be added as a follow-up by replacing the Console wrapper with direct stream iteration and inserting messages one-by-one as each agent finishes speaking.

- [ ] **Step 2: Write main.py — FastAPI app**

```python
import asyncio
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header

load_dotenv()

from runner import run_panel

# Track active sessions: session_id -> (asyncio.Task, asyncio.Event)
active_sessions: dict[str, tuple[asyncio.Task, asyncio.Event]] = {}

def verify_secret(x_api_secret: str = Header(...)):
    if x_api_secret != os.environ["API_SECRET"]:
        raise HTTPException(status_code=401, detail="Invalid API secret")

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Cancel all running sessions on shutdown
    for session_id, (task, event) in active_sessions.items():
        event.set()
        task.cancel()

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "active_sessions": list(active_sessions.keys()),
    }

@app.post("/sessions/{session_id}/start", status_code=202)
async def start_session(session_id: str, x_api_secret: str = Header(...)):
    verify_secret(x_api_secret)

    if session_id in active_sessions:
        raise HTTPException(status_code=409, detail="Session already running")

    cancel_event = asyncio.Event()
    task = asyncio.create_task(run_panel(session_id, cancel_event))

    active_sessions[session_id] = (task, cancel_event)

    # Clean up when task completes
    def on_done(_):
        active_sessions.pop(session_id, None)
    task.add_done_callback(on_done)

    return {"message": "Panel started", "session_id": session_id}

@app.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str, x_api_secret: str = Header(...)):
    verify_secret(x_api_secret)

    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not running")

    _, cancel_event = active_sessions[session_id]
    cancel_event.set()

    return {"message": "Stop signal sent", "session_id": session_id}
```

- [ ] **Step 3: Write Dockerfile**

```dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 4: Test locally**

```bash
cd lemnisca-panel/apps/worker
pip install -r requirements.txt
# Set env vars
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GEMINI_API_KEY=... API_SECRET=test
uvicorn main:app --port 8000
# In another terminal:
curl http://localhost:8000/health
```

Expected: `{"status": "ok", "active_sessions": []}`

- [ ] **Step 5: Commit**

```bash
git add apps/worker/
git commit -m "feat: add FastAPI worker with runner, endpoints, and Dockerfile"
```

---

### Task 4: Next.js Project Scaffold & Auth

**Files:**
- Create: `lemnisca-panel/apps/web/` (Next.js project via `create-next-app`)
- Create: `apps/web/lib/supabase-server.ts`
- Create: `apps/web/lib/supabase-browser.ts`
- Create: `apps/web/lib/types.ts`
- Create: `apps/web/middleware.ts`
- Create: `apps/web/app/api/auth/route.ts`
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/.env.local.example`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd lemnisca-panel/apps
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --no-git
cd web
npx shadcn@latest init -d
npx shadcn@latest add button input label card tabs dialog textarea slider badge
npm install @supabase/supabase-js react-markdown js-cookie
npm install -D @types/js-cookie
```

- [ ] **Step 2: Create .env.local.example**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RAILWAY_WORKER_URL=http://localhost:8000
RAILWAY_API_SECRET=your-shared-secret
APP_PASSWORD=your-team-password
```

- [ ] **Step 3: Write Supabase clients**

`lib/supabase-browser.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

`lib/supabase-server.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

- [ ] **Step 4: Write TypeScript types**

`lib/types.ts`:
```typescript
export interface Project {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
}

export interface Persona {
  id: string;
  project_id: string | null;
  name: string;
  role: string;
  description: string;
  system_prompt: string;
  is_template: boolean;
  created_at: string;
}

export interface Session {
  id: string;
  project_id: string;
  problem_statement: string;
  max_rounds: number;
  temperature: number;
  model: string;
  status: "pending" | "running" | "completed" | "cancelled" | "failed";
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface SessionPersona {
  id: string;
  session_id: string;
  persona_id: string;
  position: number;
}

export interface Message {
  id: string;
  session_id: string;
  turn_number: number;
  persona_id: string;
  content: string;
  created_at: string;
}

export interface Synthesis {
  id: string;
  session_id: string;
  content: string;
  created_at: string;
}
```

- [ ] **Step 5: Write auth middleware**

`middleware.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for login page, shared links, and API auth route
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/shared/") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get("lemnisca-auth");
  if (!authCookie || authCookie.value !== "authenticated") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Write auth API route**

`app/api/auth/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password, displayName } = await request.json();

  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set("lemnisca-auth", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  if (displayName) {
    response.cookies.set("lemnisca-user", displayName, {
      httpOnly: false, // Readable by client for display
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }

  return response;
}
```

- [ ] **Step 7: Write login page**

`app/login/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, displayName }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      setError("Invalid password");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Lemnisca Discussion Panel</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Display Name (optional)</Label>
              <Input
                id="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 8: Verify the app runs**

```bash
cd lemnisca-panel/apps/web
cp .env.local.example .env.local
# Fill in real values in .env.local
npm run dev
```

Visit `http://localhost:3000` — should redirect to `/login`. Enter password — should redirect to `/`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/
git commit -m "feat: scaffold Next.js app with auth, Supabase clients, and types"
```

---

### Task 5: API Routes — Projects, Personas, Templates

**Files:**
- Create: `apps/web/app/api/projects/route.ts`
- Create: `apps/web/app/api/projects/[id]/route.ts`
- Create: `apps/web/app/api/personas/route.ts`
- Create: `apps/web/app/api/personas/[id]/route.ts`
- Create: `apps/web/app/api/templates/route.ts`

- [ ] **Step 1: Write projects API routes**

`app/api/projects/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, sessions(count)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const displayName = request.cookies.get("lemnisca-user")?.value || "anonymous";

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: body.name, description: body.description || "", created_by: displayName })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

`app/api/projects/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ name: body.name, description: body.description })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 2: Write personas API routes**

`app/api/personas/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const supabase = getServiceClient();

  let query = supabase.from("personas").select("*").order("created_at");
  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("personas").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

`app/api/personas/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("personas").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("personas")
    .update({ name: body.name, role: body.role, description: body.description, system_prompt: body.system_prompt })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();
  const { error } = await supabase.from("personas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 3: Write templates API route**

`app/api/templates/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("personas")
    .select("*")
    .eq("is_template", true)
    .is("project_id", null)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("personas")
    .insert({
      name: body.name,
      role: body.role,
      description: body.description,
      system_prompt: body.system_prompt,
      is_template: true,
      project_id: null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/
git commit -m "feat: add API routes for projects, personas, and templates"
```

---

### Task 6: API Routes — Sessions (CRUD, Start, Stop)

**Files:**
- Create: `apps/web/app/api/sessions/route.ts`
- Create: `apps/web/app/api/sessions/[id]/route.ts`
- Create: `apps/web/app/api/sessions/[id]/start/route.ts`
- Create: `apps/web/app/api/sessions/[id]/stop/route.ts`

- [ ] **Step 1: Write sessions list/create routes**

`app/api/sessions/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const supabase = getServiceClient();

  let query = supabase.from("sessions").select("*").order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getServiceClient();

  // Create session
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      project_id: body.project_id,
      problem_statement: body.problem_statement,
      max_rounds: body.max_rounds || 50,
      temperature: body.temperature || 0.7,
      model: body.model || "gemini-3.1-pro-preview",
    })
    .select()
    .single();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  // Create session_personas join records
  if (body.persona_ids && body.persona_ids.length >= 2) {
    const joins = body.persona_ids.map((pid: string, i: number) => ({
      session_id: session.id,
      persona_id: pid,
      position: i + 1,
    }));
    const { error: joinError } = await supabase.from("session_personas").insert(joins);
    if (joinError) return NextResponse.json({ error: joinError.message }, { status: 500 });
  }

  return NextResponse.json(session, { status: 201 });
}
```

- [ ] **Step 2: Write session detail route**

`app/api/sessions/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();

  const [sessionRes, messagesRes, synthesisRes, personasRes] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", id).single(),
    supabase.from("messages").select("*, personas(name)").eq("session_id", id).order("turn_number"),
    supabase.from("syntheses").select("*").eq("session_id", id).maybeSingle(),
    supabase.from("session_personas").select("*, personas(*)").eq("session_id", id).order("position"),
  ]);

  if (sessionRes.error) return NextResponse.json({ error: sessionRes.error.message }, { status: 404 });

  return NextResponse.json({
    session: sessionRes.data,
    messages: messagesRes.data || [],
    synthesis: synthesisRes.data,
    personas: personasRes.data?.map((sp: any) => ({ ...sp.personas, position: sp.position })) || [],
  });
}
```

- [ ] **Step 3: Write start/stop routes**

`app/api/sessions/[id]/start/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const res = await fetch(`${process.env.RAILWAY_WORKER_URL}/sessions/${id}/start`, {
      method: "POST",
      headers: { "X-API-Secret": process.env.RAILWAY_API_SECRET! },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.detail || "Failed to start session" },
        { status: res.status },
      );
    }

    return NextResponse.json({ started: true });
  } catch {
    return NextResponse.json(
      { error: "Panel worker is currently unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
```

`app/api/sessions/[id]/stop/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const res = await fetch(`${process.env.RAILWAY_WORKER_URL}/sessions/${id}/stop`, {
      method: "POST",
      headers: { "X-API-Secret": process.env.RAILWAY_API_SECRET! },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.detail || "Failed to stop session" },
        { status: res.status },
      );
    }

    return NextResponse.json({ stopped: true });
  } catch {
    return NextResponse.json(
      { error: "Panel worker is currently unavailable." },
      { status: 503 },
    );
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/sessions/
git commit -m "feat: add session API routes with start/stop worker integration"
```

---

### Task 7: Dashboard & Project Detail Pages

**Files:**
- Create: `apps/web/components/project-card.tsx`
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/app/projects/[id]/page.tsx`
- Create: `apps/web/components/persona-editor.tsx`
- Create: `apps/web/components/persona-picker.tsx`

- [ ] **Step 1: Write project-card component**

`components/project-card.tsx`:
```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import type { Project } from "@/lib/types";

export function ProjectCard({ project, sessionCount }: { project: Project; sessionCount: number }) {
  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader>
          <CardTitle className="text-lg">{project.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {project.description || "No description"}
          </p>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span>{sessionCount} sessions</span>
            <span>by {project.created_by}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Write dashboard page**

`app/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ProjectCard } from "@/components/project-card";

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then(setProjects);
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) {
      setName("");
      setDescription("");
      setOpen(false);
      fetch("/api/projects").then((r) => r.json()).then(setProjects);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>New Project</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
            </DialogHeader>
            <form onSubmit={createProject} className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <Button type="submit">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} sessionCount={p.sessions?.[0]?.count || 0} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write persona-editor component**

`components/persona-editor.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Persona } from "@/lib/types";

interface Props {
  persona?: Persona;
  projectId?: string;
  onSave: (persona?: Persona) => void;
  onDelete?: () => void;
}

export function PersonaEditor({ persona, projectId, onSave, onDelete }: Props) {
  const [name, setName] = useState(persona?.name || "");
  const [role, setRole] = useState(persona?.role || "");
  const [description, setDescription] = useState(persona?.description || "");
  const [systemPrompt, setSystemPrompt] = useState(persona?.system_prompt || "");
  const [expanded, setExpanded] = useState(!persona);

  async function handleSave() {
    const body = { name, role, description, system_prompt: systemPrompt, project_id: projectId };
    const url = persona ? `/api/personas/${persona.id}` : "/api/personas";
    const method = persona ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const saved = await res.json();
      onSave(saved);
      if (!persona) {
        setName("");
        setRole("");
        setDescription("");
        setSystemPrompt("");
      }
    }
  }

  async function handleSaveAsTemplate() {
    if (!persona) return;
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, description, system_prompt: systemPrompt }),
    });
    alert("Saved as template!");
  }

  async function handleDelete() {
    if (persona && onDelete) {
      await fetch(`/api/personas/${persona.id}`, { method: "DELETE" });
      onDelete();
    }
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => persona && setExpanded(!expanded)}
      >
        <CardTitle className="text-base flex items-center justify-between">
          <span>{persona ? persona.name : "New Persona"}</span>
          {persona && (
            <span className="text-xs text-muted-foreground font-normal">{persona.role}</span>
          )}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Role (one-line)</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div>
            <Label>Description (for agent selector)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>System Prompt</Label>
            <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={12} className="font-mono text-xs" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave}>{persona ? "Save" : "Create"}</Button>
            {persona && persona.project_id && (
              <Button variant="outline" onClick={handleSaveAsTemplate}>Save as Template</Button>
            )}
            {persona && onDelete && (
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Write persona-picker component**

`components/persona-picker.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Persona } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onAdd: (persona: Persona) => void;
}

export function PersonaPicker({ open, onOpenChange, projectId, onAdd }: Props) {
  const [templates, setTemplates] = useState<Persona[]>([]);

  useEffect(() => {
    if (open) {
      fetch("/api/templates").then((r) => r.json()).then(setTemplates);
    }
  }, [open]);

  async function cloneTemplate(template: Persona) {
    const res = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: template.name,
        role: template.role,
        description: template.description,
        system_prompt: template.system_prompt,
        project_id: projectId,
        is_template: false,
      }),
    });
    if (res.ok) {
      const cloned = await res.json();
      onAdd(cloned);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add from Templates</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{t.name}</span>
                  <Button size="sm" onClick={() => cloneTemplate(t)}>Add</Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p className="text-xs text-muted-foreground">{t.role} — {t.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Write project detail page**

`app/projects/[id]/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PersonaEditor } from "@/components/persona-editor";
import { PersonaPicker } from "@/components/persona-picker";
import Link from "next/link";
import type { Project, Persona, Session } from "@/lib/types";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showNewPersona, setShowNewPersona] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${id}`).then((r) => r.json()).then(setProject);
    fetch(`/api/personas?project_id=${id}`).then((r) => r.json()).then(setPersonas);
    fetch(`/api/sessions?project_id=${id}`).then((r) => r.json()).then(setSessions);
  }, [id]);

  function refreshPersonas() {
    fetch(`/api/personas?project_id=${id}`).then((r) => r.json()).then(setPersonas);
  }

  async function duplicateSession(session: Session) {
    // Fetch original session's persona IDs
    const detailRes = await fetch(`/api/sessions/${session.id}`);
    const detail = await detailRes.json();
    const personaIds = detail.personas?.map((p: any) => p.id) || [];

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: id,
        problem_statement: session.problem_statement,
        max_rounds: session.max_rounds,
        temperature: session.temperature,
        model: session.model,
        persona_ids: personaIds,
      }),
    });
    if (res.ok) {
      fetch(`/api/sessions?project_id=${id}`).then((r) => r.json()).then(setSessions);
    }
  }

  async function deleteProject() {
    if (!confirm("Delete this project and all its data?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!project) return <div className="p-8">Loading...</div>;

  const statusColor: Record<string, string> = {
    pending: "bg-gray-200",
    running: "bg-blue-200 text-blue-800",
    completed: "bg-green-200 text-green-800",
    cancelled: "bg-yellow-200 text-yellow-800",
    failed: "bg-red-200 text-red-800",
  };

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            &larr; Projects
          </Link>
          <h1 className="text-2xl font-bold mt-1">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.description}</p>
        </div>
      </div>

      <Tabs defaultValue="personas">
        <TabsList>
          <TabsTrigger value="personas">Personas ({personas.length})</TabsTrigger>
          <TabsTrigger value="sessions">Sessions ({sessions.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="personas" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <Button onClick={() => setPickerOpen(true)}>Add from Templates</Button>
            <Button variant="outline" onClick={() => setShowNewPersona(true)}>Create Custom</Button>
          </div>
          <PersonaPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            projectId={id}
            onAdd={() => refreshPersonas()}
          />
          {showNewPersona && (
            <PersonaEditor
              projectId={id}
              onSave={() => { setShowNewPersona(false); refreshPersonas(); }}
            />
          )}
          {personas.map((p) => (
            <PersonaEditor
              key={p.id}
              persona={p}
              projectId={id}
              onSave={refreshPersonas}
              onDelete={refreshPersonas}
            />
          ))}
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <div className="mb-4">
            <Link href={`/projects/${id}/sessions/new`}>
              <Button>New Session</Button>
            </Link>
          </div>
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 border rounded">
                <Link href={s.status === "running" ? `/sessions/${s.id}` : `/sessions/${s.id}/results`}
                  className="flex items-center gap-3 flex-1 hover:underline">
                  <Badge className={statusColor[s.status]}>{s.status}</Badge>
                  <span className="text-sm">{s.max_rounds} turns</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => duplicateSession(s)}>
                  Duplicate
                </Button>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No sessions yet.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4 max-w-md">
          <div>
            <Label>Project Name</Label>
            <Input defaultValue={project.name} onBlur={(e) => {
              fetch(`/api/projects/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: e.target.value, description: project.description }),
              });
            }} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea defaultValue={project.description} onBlur={(e) => {
              fetch(`/api/projects/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: project.name, description: e.target.value }),
              });
            }} />
          </div>
          <Button variant="destructive" onClick={deleteProject}>Delete Project</Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/page.tsx apps/web/app/projects/ apps/web/components/
git commit -m "feat: add dashboard, project detail, persona editor and template picker"
```

---

### Task 8: Session Config & Live Session Pages

**Files:**
- Create: `apps/web/components/session-config-form.tsx`
- Create: `apps/web/app/projects/[id]/sessions/new/page.tsx`
- Create: `apps/web/components/live-transcript.tsx`
- Create: `apps/web/app/sessions/[id]/page.tsx` (Note: top-level route, not under projects)

**Important:** The live session page needs a top-level `app/sessions/[sid]/page.tsx` route (not nested under projects) so the URL is clean for sharing. Add this directory.

- [ ] **Step 1: Write session-config-form component**

`components/session-config-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Persona } from "@/lib/types";

interface Props {
  projectId: string;
  personas: Persona[];
}

export function SessionConfigForm({ projectId, personas }: Props) {
  const router = useRouter();
  const [problemStatement, setProblemStatement] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [maxRounds, setMaxRounds] = useState(50);
  const [temperature, setTemperature] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function togglePersona(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length < 2) {
      setError("Select at least 2 personas");
      return;
    }
    if (!problemStatement.trim()) {
      setError("Problem statement is required");
      return;
    }
    setLoading(true);
    setError("");

    // Create session
    const sessionRes = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        problem_statement: problemStatement,
        max_rounds: maxRounds,
        temperature,
        persona_ids: selectedIds,
      }),
    });

    if (!sessionRes.ok) {
      setError("Failed to create session");
      setLoading(false);
      return;
    }

    const session = await sessionRes.json();

    // Trigger worker
    const startRes = await fetch(`/api/sessions/${session.id}/start`, { method: "POST" });
    if (!startRes.ok) {
      const data = await startRes.json();
      setError(data.error || "Failed to start panel");
      setLoading(false);
      return;
    }

    router.push(`/sessions/${session.id}`);
  }

  const presets = [20, 50, 70, 100];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <Label>Problem Statement</Label>
        <Textarea
          value={problemStatement}
          onChange={(e) => setProblemStatement(e.target.value)}
          rows={12}
          placeholder="Describe the problem for the panel to brainstorm..."
          className="font-mono text-sm"
          required
        />
      </div>

      <div>
        <Label>Personas (select at least 2)</Label>
        <div className="space-y-2 mt-2">
          {personas.map((p) => (
            <label key={p.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => togglePersona(p.id)}
              />
              <span className="font-medium text-sm">{p.name}</span>
              <span className="text-xs text-muted-foreground">— {p.role}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>Rounds: {maxRounds}</Label>
        <div className="flex gap-2 mt-2">
          {presets.map((n) => (
            <Button
              key={n}
              type="button"
              variant={maxRounds === n ? "default" : "outline"}
              size="sm"
              onClick={() => setMaxRounds(n)}
            >
              {n}
            </Button>
          ))}
          <Input
            type="number"
            min={1}
            max={200}
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
            className="w-20"
          />
        </div>
      </div>

      <div>
        <Label>Temperature: {temperature.toFixed(2)}</Label>
        <input
          type="range"
          min={0.3}
          max={1.0}
          step={0.05}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
          className="w-full mt-2"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? "Starting..." : "Start Panel"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Write new session page**

`app/projects/[id]/sessions/new/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SessionConfigForm } from "@/components/session-config-form";
import type { Persona } from "@/lib/types";

export default function NewSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [personas, setPersonas] = useState<Persona[]>([]);

  useEffect(() => {
    fetch(`/api/personas?project_id=${id}`).then((r) => r.json()).then(setPersonas);
  }, [id]);

  return (
    <div className="max-w-5xl mx-auto p-8">
      <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:underline">
        &larr; Back to project
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">New Session</h1>
      {personas.length < 2 ? (
        <p className="text-muted-foreground">
          You need at least 2 personas in this project to start a session.{" "}
          <Link href={`/projects/${id}`} className="underline">Add personas first.</Link>
        </p>
      ) : (
        <SessionConfigForm projectId={id} personas={personas} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write live-transcript component**

`components/live-transcript.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import ReactMarkdown from "react-markdown";
import type { Message, Persona } from "@/lib/types";

// Deterministic colors for personas
const COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500",
  "bg-orange-500", "bg-pink-500", "bg-teal-500",
  "bg-red-500", "bg-indigo-500",
];

interface Props {
  sessionId: string;
  initialMessages: (Message & { personas?: { name: string } })[];
  personas: Persona[];
}

export function LiveTranscript({ sessionId, initialMessages, personas }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);

  const personaMap = Object.fromEntries(personas.map((p, i) => [p.id, { name: p.name, color: COLORS[i % COLORS.length] }]));

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as any]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="space-y-4">
      {messages.map((msg) => {
        const persona = personaMap[msg.persona_id] || { name: "Unknown", color: "bg-gray-500" };
        return (
          <div key={msg.id} className="flex gap-3">
            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${persona.color}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm">{persona.name}</span>
                <span className="text-xs text-muted-foreground">Turn {msg.turn_number}</span>
              </div>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 4: Write live session page**

Create directory `app/sessions/[sid]/` (note: top-level, not under projects).

`app/sessions/[sid]/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { LiveTranscript } from "@/components/live-transcript";
import Link from "next/link";
import type { Session, Message, Persona } from "@/lib/types";

export default function LiveSessionPage() {
  const { sid } = useParams<{ sid: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [lastMessageAt, setLastMessageAt] = useState<Date | null>(null);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    fetch(`/api/sessions/${sid}`)
      .then((r) => r.json())
      .then((data) => {
        setSession(data.session);
        setMessages(data.messages);
        setPersonas(data.personas);
        if (data.messages.length > 0) {
          setLastMessageAt(new Date(data.messages[data.messages.length - 1].created_at));
        }
      });
  }, [sid]);

  // Subscribe to session status changes
  useEffect(() => {
    const channel = supabase
      .channel(`session-${sid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sid}` },
        (payload) => {
          setSession(payload.new as Session);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sid]);

  // Track messages for stale detection
  useEffect(() => {
    const channel = supabase
      .channel(`msg-track-${sid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sid}` },
        () => { setLastMessageAt(new Date()); setStalled(false); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sid]);

  // Elapsed time + stale detection
  useEffect(() => {
    const interval = setInterval(() => {
      if (session?.started_at) {
        setElapsed(Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
      }
      if (lastMessageAt && Date.now() - lastMessageAt.getTime() > 5 * 60 * 1000) {
        setStalled(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.started_at, lastMessageAt]);

  async function handleStop() {
    await fetch(`/api/sessions/${sid}/stop`, { method: "POST" });
  }

  if (!session) return <div className="p-8">Loading...</div>;

  const isActive = session.status === "running";
  const isDone = ["completed", "cancelled", "failed"].includes(session.status);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm">
            Turn {messages.length}/{session.max_rounds}
          </span>
          <div className="w-48 h-2 bg-gray-200 rounded-full">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${(messages.length / session.max_rounds) * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
        </div>
        {isActive && (
          <Button variant="destructive" size="sm" onClick={handleStop}>
            Stop
          </Button>
        )}
      </div>

      {stalled && isActive && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
          This session may have stalled. You can wait or try stopping and restarting.
        </div>
      )}

      {isDone && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm flex items-center justify-between">
          <span>
            Session {session.status}.{" "}
            {session.status === "cancelled" && `Stopped after turn ${messages.length} of ${session.max_rounds}.`}
          </span>
          <Link href={`/sessions/${sid}/results`}>
            <Button size="sm">View Results</Button>
          </Link>
        </div>
      )}

      {session.status === "failed" && session.error_message && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
          Error: {session.error_message}
        </div>
      )}

      <LiveTranscript sessionId={sid} initialMessages={messages} personas={personas} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/session-config-form.tsx apps/web/components/live-transcript.tsx
git add apps/web/app/projects/ apps/web/app/sessions/
git commit -m "feat: add session config, live session view with real-time streaming"
```

---

### Task 9: Results Page, Synthesis View, & Export

**Files:**
- Create: `apps/web/app/sessions/[sid]/results/page.tsx`
- Create: `apps/web/components/synthesis-view.tsx`
- Create: `apps/web/components/export-buttons.tsx`

- [ ] **Step 1: Write synthesis-view component**

`components/synthesis-view.tsx`:
```tsx
"use client";

import ReactMarkdown from "react-markdown";

export function SynthesisView({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: Write export-buttons component**

`components/export-buttons.tsx`:
```tsx
"use client";

import { Button } from "@/components/ui/button";
import type { Message, Persona, Synthesis } from "@/lib/types";

interface Props {
  sessionId: string;
  messages: (Message & { personas?: { name: string } })[];
  synthesis: Synthesis | null;
  personas: Persona[];
}

export function ExportButtons({ sessionId, messages, synthesis, personas }: Props) {
  const personaMap = Object.fromEntries(personas.map((p) => [p.id, p.name]));

  function downloadMarkdown(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTranscript() {
    const lines = messages.map((m) => {
      const name = personaMap[m.persona_id] || "Unknown";
      return `### [${m.turn_number}] ${name}\n\n${m.content}\n\n---\n`;
    });
    downloadMarkdown("transcript.md", `# Discussion Transcript\n\n${lines.join("\n")}`);
  }

  function downloadSynthesis() {
    if (synthesis) {
      downloadMarkdown("synthesis.md", `# Synthesis Report\n\n${synthesis.content}`);
    }
  }

  function copyShareLink() {
    const url = `${window.location.origin}/shared/${sessionId}`;
    navigator.clipboard.writeText(url);
  }

  async function downloadPdf() {
    if (!synthesis) return;
    const html2pdf = (await import("html2pdf.js")).default;
    const el = document.getElementById("synthesis-content");
    if (el) {
      html2pdf().set({ margin: 1, filename: "synthesis.pdf" }).from(el).save();
    }
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={downloadTranscript}>
        Download Transcript (.md)
      </Button>
      {synthesis && (
        <>
          <Button variant="outline" size="sm" onClick={downloadSynthesis}>
            Download Synthesis (.md)
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            Download Synthesis (.pdf)
          </Button>
        </>
      )}
      <Button variant="outline" size="sm" onClick={copyShareLink}>
        Copy Share Link
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Write results page**

`app/sessions/[sid]/results/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SynthesisView } from "@/components/synthesis-view";
import { ExportButtons } from "@/components/export-buttons";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import type { Session, Message, Persona, Synthesis } from "@/lib/types";

const COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500",
  "bg-orange-500", "bg-pink-500", "bg-teal-500",
  "bg-red-500", "bg-indigo-500",
];

export default function ResultsPage() {
  const { sid } = useParams<{ sid: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`/api/sessions/${sid}`)
      .then((r) => r.json())
      .then((data) => {
        setSession(data.session);
        setMessages(data.messages);
        setSynthesis(data.synthesis);
        setPersonas(data.personas);
      });
  }, [sid]);

  if (!session) return <div className="p-8">Loading...</div>;

  const personaMap = Object.fromEntries(personas.map((p, i) => [p.id, { name: p.name, color: COLORS[i % COLORS.length] }]));

  const filteredMessages = search
    ? messages.filter((m) => {
        const persona = personaMap[m.persona_id];
        return (
          m.content.toLowerCase().includes(search.toLowerCase()) ||
          persona?.name.toLowerCase().includes(search.toLowerCase())
        );
      })
    : messages;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <Link href={`/projects/${session.project_id}`} className="text-sm text-muted-foreground hover:underline">
        &larr; Back to project
      </Link>

      <div className="flex items-center gap-3 mt-2 mb-6">
        <h1 className="text-2xl font-bold">Session Results</h1>
        <Badge>{session.status}</Badge>
        <span className="text-sm text-muted-foreground">{messages.length} turns</span>
      </div>

      {session.status === "failed" && session.error_message && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
          Error: {session.error_message}
        </div>
      )}
      {session.status === "cancelled" && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
          Session was stopped after turn {messages.length} of {session.max_rounds}.
        </div>
      )}

      <ExportButtons sessionId={sid} messages={messages} synthesis={synthesis} personas={personas} />

      <Tabs defaultValue={synthesis ? "synthesis" : "transcript"} className="mt-6">
        <TabsList>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="synthesis" disabled={!synthesis}>Synthesis</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="mt-4">
          <Input
            placeholder="Search transcript..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 max-w-sm"
          />
          <div className="space-y-4">
            {filteredMessages.map((msg) => {
              const persona = personaMap[msg.persona_id] || { name: "Unknown", color: "bg-gray-500" };
              return (
                <div key={msg.id} className="flex gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${persona.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{persona.name}</span>
                      <span className="text-xs text-muted-foreground">Turn {msg.turn_number}</span>
                    </div>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="synthesis" className="mt-4">
          {synthesis && (
            <div id="synthesis-content">
              <SynthesisView content={synthesis.content} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/sessions/ apps/web/components/synthesis-view.tsx apps/web/components/export-buttons.tsx
git commit -m "feat: add results page with transcript, synthesis, search, and export"
```

---

### Task 10: Shared View & Templates Page

**Files:**
- Create: `apps/web/app/shared/[sid]/page.tsx`
- Create: `apps/web/app/templates/page.tsx`

- [ ] **Step 1: Write shared (public) view page**

`app/shared/[sid]/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SynthesisView } from "@/components/synthesis-view";
import ReactMarkdown from "react-markdown";

const COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500",
  "bg-orange-500", "bg-pink-500", "bg-teal-500",
];

export default function SharedSessionPage() {
  const { sid } = useParams<{ sid: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: session, error: sErr } = await supabase
        .from("sessions").select("*").eq("id", sid).single();
      if (sErr) { setError("Session not found"); return; }

      const [msgRes, synRes, personaRes] = await Promise.all([
        supabase.from("messages").select("*").eq("session_id", sid).order("turn_number"),
        supabase.from("syntheses").select("*").eq("session_id", sid).maybeSingle(),
        supabase.from("session_personas").select("*, personas(*)").eq("session_id", sid).order("position"),
      ]);

      setData({
        session,
        messages: msgRes.data || [],
        synthesis: synRes.data,
        personas: personaRes.data?.map((sp: any) => sp.personas) || [],
      });
    }
    load();
  }, [sid]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return <div className="p-8">Loading...</div>;

  const personaMap = Object.fromEntries(
    data.personas.map((p: any, i: number) => [p.id, { name: p.name, color: COLORS[i % COLORS.length] }])
  );

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">Discussion Session</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {data.messages.length} turns &middot; {data.session.status} &middot;{" "}
        {new Date(data.session.created_at).toLocaleDateString()}
      </p>

      <Tabs defaultValue={data.synthesis ? "synthesis" : "transcript"}>
        <TabsList>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="synthesis" disabled={!data.synthesis}>Synthesis</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="mt-4 space-y-4">
          {data.messages.map((msg: any) => {
            const persona = personaMap[msg.persona_id] || { name: "Unknown", color: "bg-gray-500" };
            return (
              <div key={msg.id} className="flex gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${persona.color}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{persona.name}</span>
                    <span className="text-xs text-muted-foreground">Turn {msg.turn_number}</span>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="synthesis" className="mt-4">
          {data.synthesis && <SynthesisView content={data.synthesis.content} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Write templates page**

`app/templates/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PersonaEditor } from "@/components/persona-editor";
import type { Persona } from "@/lib/types";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Persona[]>([]);
  const [showNew, setShowNew] = useState(false);

  function refresh() {
    fetch("/api/templates").then((r) => r.json()).then(setTemplates);
  }

  useEffect(() => { refresh(); }, []);

  async function handleNewSave() {
    // PersonaEditor already created the persona via POST /api/personas.
    // But for templates page, we need to use POST /api/templates instead.
    // So we use PersonaEditor in "no-auto-save" mode — it calls onSave with
    // the form data, and we handle the API call here.
    setShowNew(false);
    refresh();
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Persona Templates</h1>
        <Button onClick={() => setShowNew(true)}>Create Template</Button>
      </div>

      {showNew && (
        <div className="mb-4">
          <PersonaEditor onSave={handleNewSave} />
        </div>
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <PersonaEditor
            key={t.id}
            persona={t}
            onSave={refresh}
            onDelete={refresh}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add navigation layout**

Update `app/layout.tsx` to include a simple nav bar with links to Dashboard and Templates:

```tsx
// Add to the body inside layout.tsx, above {children}:
<nav className="border-b px-8 py-3 flex items-center gap-6">
  <Link href="/" className="font-bold">Lemnisca Panel</Link>
  <Link href="/templates" className="text-sm text-muted-foreground hover:text-foreground">Templates</Link>
</nav>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/shared/ apps/web/app/templates/ apps/web/app/layout.tsx
git commit -m "feat: add shared session view, templates page, and navigation"
```

---

### Task 11: End-to-End Testing & Deployment Config

**Files:**
- Modify: `apps/web/next.config.js` (if needed)
- Create: `apps/worker/.dockerignore`

- [ ] **Step 1: Create .dockerignore for worker**

```
__pycache__
*.pyc
.env
.git
```

- [ ] **Step 2: Verify Supabase schema**

Run the SQL migrations against your Supabase project:
1. Go to Supabase Dashboard → SQL Editor
2. Paste and run `001_initial_schema.sql`
3. Paste and run `002_seed_templates.sql`
4. Verify tables in Table Editor
5. Verify Realtime is enabled: Database → Replication → check `messages` and `sessions` tables

- [ ] **Step 3: Test worker locally**

```bash
cd lemnisca-panel/apps/worker
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GEMINI_API_KEY=... API_SECRET=test123
uvicorn main:app --port 8000

# Test health
curl http://localhost:8000/health
```

- [ ] **Step 4: Test frontend locally**

```bash
cd lemnisca-panel/apps/web
# .env.local should point to local worker: RAILWAY_WORKER_URL=http://localhost:8000
npm run dev
```

Test the full flow:
1. Login with password
2. Create a project
3. Add personas from templates
4. Create a new session with 5 rounds (quick test)
5. Verify live streaming works
6. Check results page after completion
7. Test share link
8. Test markdown export

- [ ] **Step 5: Deploy worker to Railway**

```bash
# From lemnisca-panel/apps/worker
railway init
railway up
# Set env vars in Railway dashboard:
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, API_SECRET
```

- [ ] **Step 6: Deploy frontend to Vercel**

```bash
cd lemnisca-panel/apps/web
vercel
# Set env vars in Vercel dashboard:
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, RAILWAY_WORKER_URL (Railway public URL),
# RAILWAY_API_SECRET, APP_PASSWORD
```

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: add deployment configs and dockerignore"
```

---

## Task Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Supabase schema + seed data | None |
| 2 | Worker core modules (db, agents, selector, synthesis) | Task 1 |
| 3 | Worker runner + FastAPI endpoints + Dockerfile | Task 2 |
| 4 | Next.js scaffold + auth | Task 1 |
| 5 | API routes — projects, personas, templates | Task 4 |
| 6 | API routes — sessions (CRUD, start, stop) | Task 4 |
| 7 | Dashboard + project detail pages | Task 5 |
| 8 | Session config + live session pages | Tasks 5, 6 |
| 9 | Results page, synthesis view, export | Task 6 |
| 10 | Shared view + templates page | Tasks 5, 9 |
| 11 | E2E testing + deployment | All above |

**Parallelizable:** Tasks 2-3 (worker) and Tasks 4-6 (frontend scaffold + API) can be done in parallel since they're independent codebases.
