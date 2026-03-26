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
