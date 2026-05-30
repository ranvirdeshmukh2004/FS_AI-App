"""
Shared LLM client — supports OpenAI-compatible and Anthropic APIs.
Used by orchestrator and react_agent.
"""

import json
import logging

import httpx

logger = logging.getLogger(__name__)


def _is_anthropic(base_url: str) -> bool:
    return "anthropic.com" in base_url


async def call_llm(base_url: str, api_key: str, model: str,
                   messages: list[dict], max_tokens: int = 2048,
                   temperature: float = 0.3) -> tuple[str, dict]:
    """
    Call LLM (OpenAI-compatible or Anthropic Messages API).
    Returns (content_text, usage_dict).
    usage_dict has keys: prompt_tokens, completion_tokens
    """
    if _is_anthropic(base_url):
        return await _call_anthropic(base_url, api_key, model, messages, max_tokens, temperature)

    url = f"{base_url}/chat/completions"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }, json={
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        })

        if resp.status_code != 200:
            raise Exception(f"LLM API returned {resp.status_code}: {resp.text}")

        data = resp.json()
        content = data["choices"][0]["message"]["content"] or ""
        usage = data.get("usage", {})
        return content, {
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
        }


async def _call_anthropic(base_url: str, api_key: str, model: str,
                          messages: list[dict], max_tokens: int = 2048,
                          temperature: float = 0.3) -> tuple[str, dict]:
    """Call Anthropic Messages API."""
    url = f"{base_url}/messages"
    system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
    conv = [m for m in messages if m["role"] != "system"]

    body: dict = {"model": model, "messages": conv, "max_tokens": max_tokens, "temperature": temperature}
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
        return content, {
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
        }


def build_trace_json(steps: list, tool_calls: int, total_time: float,
                     in_tokens: int, out_tokens: int) -> str:
    """Build the trace JSON string for SSE events."""
    return json.dumps({
        "steps": steps,
        "tool_calls": tool_calls,
        "total_time": total_time,
        "input_tokens": in_tokens,
        "output_tokens": out_tokens,
        "total_tokens": in_tokens + out_tokens,
    })
