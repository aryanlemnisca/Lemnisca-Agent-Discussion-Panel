import asyncio
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header

load_dotenv()

from runner import run_panel

active_sessions: dict[str, tuple[asyncio.Task, asyncio.Event]] = {}

def verify_secret(x_api_secret: str = Header(...)):
    if x_api_secret != os.environ["API_SECRET"]:
        raise HTTPException(status_code=401, detail="Invalid API secret")

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for session_id, (task, event) in active_sessions.items():
        event.set()
        task.cancel()

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "ok", "active_sessions": list(active_sessions.keys())}

@app.post("/sessions/{session_id}/start", status_code=202)
async def start_session(session_id: str, x_api_secret: str = Header(...)):
    verify_secret(x_api_secret)
    if session_id in active_sessions:
        raise HTTPException(status_code=409, detail="Session already running")

    cancel_event = asyncio.Event()
    task = asyncio.create_task(run_panel(session_id, cancel_event))
    active_sessions[session_id] = (task, cancel_event)

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
