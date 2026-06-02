"""
ReAct (Reasoning + Acting) Agent — 8 tools, Anthropic support, token tracking.
"""

import json
import logging
import re
import time
from typing import AsyncGenerator

import httpx

from app.services.tools.web_search import web_search
from app.services.tools.wikipedia import wikipedia_search
from app.services.tools.calculator import calculator
from app.services.tools.datetime_tool import datetime_tool
from app.services.tools.weather import weather
from app.services.tools.read_url import read_url
from app.services.tools.python_executor import python_executor
from app.services.tools.doc_search import doc_search

logger = logging.getLogger(__name__)

MAX_REACT_STEPS = 8

TOOL_DESCRIPTIONS = """You have access to the following tools:

1. web_search — Search the web for current information, news, or facts.
   Input: A search query string.  Example: web_search("latest Tesla stock price")

2. wikipedia — Look up encyclopedic information on Wikipedia.
   Input: A topic.  Example: wikipedia("quantum computing")

3. calculator — Safe math: arithmetic, powers, sqrt, log, trig, factorial.
   Input: A math expression.  Example: calculator("(45 * 3) + sqrt(144)")

4. datetime — Current date/time, timezone conversions, date calculations.
   Input: A query.  Example: datetime("current time") or datetime("convert EST to IST")

5. weather — Current weather for any city (free, no API key).
   Input: City name.  Example: weather("London")

6. read_url — Fetch and read text content of a web page.
   Input: A URL.  Example: read_url("https://example.com/article")

7. python_executor — Execute Python code in a sandbox.
   Input: Python code.  Example: python_executor("import statistics; print(statistics.mean([10,20,30]))")

8. doc_search — Search uploaded PDF documents for relevant information. ALWAYS use this when the user asks about uploaded documents, PDFs, or files. Returns passages with page numbers and filenames.
   Input: A search query.  Example: doc_search("system architecture overview")

RULES:
- ALWAYS use doc_search when the user asks about uploaded documents/PDFs.
- Only cite information that doc_search actually returns. Never invent page numbers.
- If doc_search returns no results, say "I could not find supporting information for this in the uploaded document."
- For general questions unrelated to documents, use other tools or respond directly.
- Use calculator for math, datetime for time questions.
- You can chain multiple tools."""

REACT_SYSTEM_PROMPT = """You are a helpful AI assistant with access to external tools.

{tool_descriptions}

When you use a tool, follow this EXACT format:

Thought: [your reasoning]
Action: [tool name]
Action Input: [input for the tool]

After an Observation, either use another tool or give your final answer:

Thought: I now have enough information.
Final Answer: [your complete answer]

If you do NOT need tools, respond normally without the Thought/Action format."""


def _build_system_prompt(search_engine: str = "duckduckgo") -> str:
    engine_note = f"\nNote: Web search uses {search_engine}."
    return REACT_SYSTEM_PROMPT.format(tool_descriptions=TOOL_DESCRIPTIONS) + engine_note


def _parse_action(text: str) -> tuple[str | None, str | None]:
    m = re.search(r"Action:\s*(\w+)\s*\n\s*Action Input:\s*(.+?)(?:\n(?:Thought:|Action:|$)|\Z)", text, re.IGNORECASE | re.DOTALL)
    if m:
        return m.group(1).strip().lower(), m.group(2).strip().strip('"\'')
    return None, None


def _parse_final_answer(text: str) -> str | None:
    m = re.search(r"Final Answer:\s*(.+)", text, re.IGNORECASE | re.DOTALL)
    return m.group(1).strip() if m else None


def _has_action(text: str) -> bool:
    return bool(re.search(r"Action:\s*\w+", text, re.IGNORECASE))


def _is_anthropic(base_url: str) -> bool:
    return "anthropic.com" in base_url


async def _execute_tool(action: str, action_input: str, search_engine: str = "duckduckgo",
                        google_api_key: str | None = None, google_cx: str | None = None) -> str:
    if action in ("web_search", "websearch", "search"):
        return await web_search(query=action_input, engine=search_engine,
                                google_api_key=google_api_key, google_cx=google_cx, max_results=5)
    elif action in ("wikipedia", "wiki"):
        return await wikipedia_search(query=action_input, max_results=3)
    elif action in ("calculator", "calc", "math"):
        return await calculator(action_input)
    elif action in ("datetime", "date", "time"):
        return await datetime_tool(action_input)
    elif action == "weather":
        return await weather(action_input)
    elif action in ("read_url", "readurl", "url", "fetch"):
        return await read_url(action_input)
    elif action in ("python_executor", "python", "code", "execute"):
        return await python_executor(action_input)
    elif action in ("doc_search", "docsearch", "document_search", "pdf_search"):
        return await doc_search(action_input)
    else:
        return f"Unknown tool: {action}. Available: web_search, wikipedia, calculator, datetime, weather, read_url, python_executor, doc_search"


async def _call_llm(base_url: str, api_key: str, model: str, messages: list[dict]) -> tuple[str, dict]:
    """Call LLM (OpenAI-compatible or Anthropic). Returns (content, usage)."""
    if _is_anthropic(base_url):
        return await _call_anthropic(base_url, api_key, model, messages)

    url = f"{base_url}/chat/completions"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }, json={"model": model, "messages": messages, "max_tokens": 2048, "temperature": 0.3})

        if resp.status_code != 200:
            raise Exception(f"LLM API returned {resp.status_code}: {resp.text}")

        data = resp.json()
        content = data["choices"][0]["message"]["content"] or ""
        usage = data.get("usage", {})
        return content, {"prompt_tokens": usage.get("prompt_tokens", 0),
                         "completion_tokens": usage.get("completion_tokens", 0)}


async def _call_anthropic(base_url: str, api_key: str, model: str, messages: list[dict]) -> tuple[str, dict]:
    """Call Anthropic Messages API."""
    url = f"{base_url}/messages"
    system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
    conv = [m for m in messages if m["role"] != "system"]

    body: dict = {"model": model, "messages": conv, "max_tokens": 2048, "temperature": 0.3}
    if system_msg:
        body["system"] = system_msg

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }, json=body)

        if resp.status_code != 200:
            raise Exception(f"Anthropic API returned {resp.status_code}: {resp.text}")

        data = resp.json()
        content = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                content += block.get("text", "")

        usage = data.get("usage", {})
        return content, {"prompt_tokens": usage.get("input_tokens", 0),
                         "completion_tokens": usage.get("output_tokens", 0)}


def _build_trace(steps, tool_calls, total_time, in_tok, out_tok):
    return json.dumps({
        "steps": steps, "tool_calls": tool_calls, "total_time": total_time,
        "input_tokens": in_tok, "output_tokens": out_tok,
        "total_tokens": in_tok + out_tok,
    })


async def run_react_agent_stream(
    base_url: str, api_key: str, model: str,
    conversation_messages: list[dict],
    search_engine: str = "duckduckgo",
    google_api_key: str | None = None,
    google_cx: str | None = None,
) -> AsyncGenerator[dict, None]:
    start_time = time.time()
    system_prompt = _build_system_prompt(search_engine)
    messages = [{"role": "system", "content": system_prompt}, *conversation_messages]

    trace_steps: list[dict] = []
    tool_call_count = 0
    total_in = 0
    total_out = 0

    for step in range(MAX_REACT_STEPS):
        step_start = time.time()
        full_response, usage = await _call_llm(base_url, api_key, model, messages)
        llm_dur = round(time.time() - step_start, 2)
        total_in += usage.get("prompt_tokens", 0)
        total_out += usage.get("completion_tokens", 0)

        final = _parse_final_answer(full_response)
        if final and not _has_action(full_response.split("Final Answer:")[0]):
            tm = re.search(r"Thought:\s*(.+?)(?=\nFinal Answer:)", full_response, re.DOTALL)
            if tm:
                trace_steps.append({"type": "thought", "content": tm.group(1).strip(), "duration": llm_dur})
            td = round(time.time() - start_time, 2)
            yield {"type": "chunk", "content": final}
            yield {"type": "trace", "content": _build_trace(trace_steps, tool_call_count, td, total_in, total_out)}
            yield {"type": "done", "content": final}
            return

        if not _has_action(full_response):
            td = round(time.time() - start_time, 2)
            yield {"type": "chunk", "content": full_response}
            yield {"type": "trace", "content": _build_trace(
                trace_steps or [{"type": "direct", "content": "Answered directly without tools", "duration": llm_dur}],
                0, td, total_in, total_out)}
            yield {"type": "done", "content": full_response}
            return

        action, action_input = _parse_action(full_response)
        if not action or not action_input:
            td = round(time.time() - start_time, 2)
            yield {"type": "chunk", "content": full_response}
            yield {"type": "trace", "content": _build_trace(trace_steps, tool_call_count, td, total_in, total_out)}
            yield {"type": "done", "content": full_response}
            return

        tm = re.search(r"Thought:\s*(.+?)(?=\nAction:)", full_response, re.DOTALL)
        if tm:
            yield {"type": "thinking", "content": tm.group(1).strip()}
            trace_steps.append({"type": "thought", "content": tm.group(1).strip(), "duration": llm_dur})

        yield {"type": "tool", "content": f"Using {action}: {action_input}"}
        trace_steps.append({"type": "action", "tool": action, "input": action_input})

        tool_start = time.time()
        try:
            observation = await _execute_tool(action, action_input, search_engine, google_api_key, google_cx)
        except Exception as e:
            observation = f"Tool execution failed: {str(e)}"
        tool_dur = round(time.time() - tool_start, 2)
        tool_call_count += 1

        obs_summary = observation[:300] + "..." if len(observation) > 300 else observation
        trace_steps.append({"type": "observation", "tool": action, "content": obs_summary, "duration": tool_dur})
        yield {"type": "observation", "content": f"{action} returned results ({tool_dur}s)"}

        messages.append({"role": "assistant", "content": full_response})
        messages.append({"role": "user", "content": f"Observation: {observation}\n\nContinue reasoning. Provide Final Answer if ready, or use another tool."})

    messages.append({"role": "user", "content": "Provide your Final Answer now."})
    final_response, usage = await _call_llm(base_url, api_key, model, messages)
    total_in += usage.get("prompt_tokens", 0)
    total_out += usage.get("completion_tokens", 0)
    final = _parse_final_answer(final_response) or final_response

    td = round(time.time() - start_time, 2)
    yield {"type": "chunk", "content": final}
    yield {"type": "trace", "content": _build_trace(trace_steps, tool_call_count, td, total_in, total_out)}
    yield {"type": "done", "content": final}
