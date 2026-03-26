import asyncio
from datetime import datetime, timezone
from autogen_agentchat.teams import SelectorGroupChat
from autogen_agentchat.conditions import MaxMessageTermination
from autogen_agentchat.ui import Console
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

        client = make_client(model=session["model"], temperature=session["temperature"])
        agents = build_agents(personas, client)

        persona_names = [p["name"] for p in personas]
        persona_descriptions = {p["name"]: p["description"] for p in personas}
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

        result = await Console(team.run_stream(task=session["problem_statement"]))

        turn = 0
        collected_messages = []
        for message in result.messages:
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
                            insert_message(session_id, turn, persona_id, content.strip())
                        except Exception:
                            pass
                collected_messages.append(f"[{source}]:\n{content.strip()}")

        transcript_text = "\n\n".join(collected_messages)
        try:
            synthesis_content = await run_synthesis(transcript_text, client)
            insert_synthesis(session_id, synthesis_content)
        except Exception:
            pass

        final_status = "cancelled" if cancel_event.is_set() else "completed"
        update_session_status(session_id, final_status, completed_at=datetime.now(timezone.utc).isoformat())

    except Exception as e:
        update_session_status(session_id, "failed", error_message=str(e)[:1000], completed_at=datetime.now(timezone.utc).isoformat())
