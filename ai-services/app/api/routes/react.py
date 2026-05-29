"""
ReAct Agent API Routes

Provides endpoints for the backend to call the ReAct agent
with tool-augmented reasoning.
"""

import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.react_agent import run_react_agent, run_react_agent_stream

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/react", tags=["react"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ReactRequest(BaseModel):
    """Request body for ReAct agent calls."""
    provider_base_url: str
    api_key: str
    model: str
    messages: list[ChatMessage]
    search_engine: str = "duckduckgo"  # "duckduckgo" or "google"
    google_api_key: str | None = None
    google_cx: str | None = None
    stream: bool = True


@router.post("/chat")
async def react_chat(req: ReactRequest):
    """
    Run a ReAct agent conversation.
    If stream=True, returns SSE stream.
    If stream=False, returns JSON with the final answer.
    """
    conversation = [{"role": m.role, "content": m.content} for m in req.messages]

    if req.stream:
        return StreamingResponse(
            _stream_react(req, conversation),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        try:
            result = await run_react_agent(
                base_url=req.provider_base_url,
                api_key=req.api_key,
                model=req.model,
                conversation_messages=conversation,
                search_engine=req.search_engine,
                google_api_key=req.google_api_key,
                google_cx=req.google_cx,
            )
            return {"content": result}
        except Exception as e:
            logger.error("ReAct agent error: %s", e)
            raise HTTPException(status_code=500, detail=str(e))


async def _stream_react(req: ReactRequest, conversation: list[dict]):
    """Generator that yields SSE events from the ReAct agent."""
    try:
        async for event in run_react_agent_stream(
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
        logger.error("ReAct stream error: %s", e)
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
