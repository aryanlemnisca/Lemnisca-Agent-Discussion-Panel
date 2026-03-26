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
