"""
Orchestrated ReAct Agent API Route

Routes queries through the orchestrator which classifies and dispatches:
  - DIRECT: Simple queries → LLM only
  - SINGLE: One-tool queries → direct tool call + synthesis
  - REACT:  Complex queries → full multi-step reasoning loop
"""

import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.orchestrator import run_orchestrator_stream

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/react", tags=["react"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ReactRequest(BaseModel):
    """Request body for orchestrated agent calls."""
    provider_base_url: str
    api_key: str
    model: str
    messages: list[ChatMessage]
    search_engine: str = "duckduckgo"
    google_api_key: str | None = None
    google_cx: str | None = None
    stream: bool = True


@router.post("/chat")
async def react_chat(req: ReactRequest):
    """
    Orchestrated agent conversation with streaming SSE.
    The orchestrator classifies the query and routes to the optimal path.
    """
    conversation = [{"role": m.role, "content": m.content} for m in req.messages]

    return StreamingResponse(
        _stream_orchestrated(req, conversation),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _stream_orchestrated(req: ReactRequest, conversation: list[dict]):
    """Generator that yields SSE events from the orchestrator."""
    try:
        async for event in run_orchestrator_stream(
            base_url=req.provider_base_url,
            api_key=req.api_key,
            model=req.model,
            conversation_messages=conversation,
            search_engine=req.search_engine,
            google_api_key=req.google_api_key,
            google_cx=req.google_cx,
        ):
            yield f"data: {json.dumps(event)}\n\n"
    except Exception as e:
        logger.error("Orchestrator stream error: %s", e)
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
