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
