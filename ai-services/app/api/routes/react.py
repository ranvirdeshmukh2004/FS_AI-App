"""
Agent API Route — supports Orchestrator and plain ReAct modes.
Passes session_id for document search context.
"""

import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.orchestrator import run_orchestrator_stream
from app.services.react_agent import run_react_agent_stream
from app.services.tools.doc_search import set_doc_search_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/react", tags=["react"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ReactRequest(BaseModel):
    provider_base_url: str
    api_key: str
    model: str
    messages: list[ChatMessage]
    search_engine: str = "duckduckgo"
    google_api_key: str | None = None
    google_cx: str | None = None
    use_orchestrator: bool = True
    session_id: str | None = None
    embedding_api_key: str | None = None
    stream: bool = True


@router.post("/chat")
async def react_chat(req: ReactRequest):
    conversation = [{"role": m.role, "content": m.content} for m in req.messages]

    # Set document search context so the doc_search tool can access Qdrant
    if req.session_id and req.embedding_api_key:
        set_doc_search_context(req.session_id, req.embedding_api_key)

    if req.use_orchestrator:
        generator = _stream_orchestrated(req, conversation)
    else:
        generator = _stream_react(req, conversation)

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _stream_orchestrated(req: ReactRequest, conversation: list[dict]):
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


async def _stream_react(req: ReactRequest, conversation: list[dict]):
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
