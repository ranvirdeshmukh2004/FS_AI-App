"""
ReAct (Reasoning + Acting) Agent

Implements a tool-augmented LLM loop:
  1. Send conversation + system prompt (with tool descriptions) to the LLM
  2. Parse LLM response for Thought / Action / Action Input
  3. Execute the requested tool
  4. Feed the Observation back and repeat
  5. When the LLM emits "Final Answer:", return that to the user
"""

import json
import logging
import re
from typing import AsyncGenerator

import httpx

from app.services.tools.web_search import web_search
from app.services.tools.wikipedia import wikipedia_search

logger = logging.getLogger(__name__)

MAX_REACT_STEPS = 6  # safety limit to prevent infinite loops

TOOL_DESCRIPTIONS = """You have access to the following tools:

1. web_search
   Description: Search the web for current information. Use this when you need up-to-date facts, news, or information not in your training data.
   Input: A search query string
   Example: web_search("latest SpaceX launch date 2026")

2. wikipedia
   Description: Search Wikipedia for detailed encyclopedic information about topics, people, places, events, and concepts.
   Input: A search query string
   Example: wikipedia("quantum computing")

IMPORTANT RULES:
- Only use tools when you genuinely need external information you don't have.
- For general conversation, greetings, opinions, coding help, math, or creative tasks, respond directly WITHOUT using any tools.
- Do NOT use tools for basic knowledge questions you can already answer well.
"""

REACT_SYSTEM_PROMPT = """You are a helpful AI assistant with access to external tools.

{tool_descriptions}

When you decide to use a tool, you MUST follow this EXACT format:

Thought: [your reasoning about what to do]
Action: [tool name - either "web_search" or "wikipedia"]
Action Input: [the search query]

After receiving an Observation (tool result), you can either:
- Use another tool with the same Thought/Action/Action Input format
- Provide your final answer with:

Thought: I now have enough information to answer.
Final Answer: [your complete answer to the user, using the information gathered]

If you do NOT need any tools, simply respond normally without the Thought/Action format.

Remember: Be concise in your reasoning. Always provide a Final Answer when you have enough information."""


def _build_system_prompt(search_engine: str = "duckduckgo") -> str:
    """Build the system prompt, noting which search engine is active."""
    engine_note = f"\nNote: Web search is currently using {search_engine} as the search engine."
    return REACT_SYSTEM_PROMPT.format(tool_descriptions=TOOL_DESCRIPTIONS) + engine_note


def _parse_action(text: str) -> tuple[str | None, str | None]:
    """
    Parse the LLM output to extract Action and Action Input.
    Returns (action_name, action_input) or (None, None) if not found.
    """
    action_match = re.search(
        r"Action:\s*(\w+)\s*\n\s*Action Input:\s*(.+?)(?:\n|$)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if action_match:
        action_name = action_match.group(1).strip().lower()
        action_input = action_match.group(2).strip().strip('"\'')
        return action_name, action_input
    return None, None


def _parse_final_answer(text: str) -> str | None:
    """Extract the Final Answer from LLM output, if present."""
    match = re.search(r"Final Answer:\s*(.+)", text, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return None


def _has_action(text: str) -> bool:
    """Check if the text contains an Action directive."""
    return bool(re.search(r"Action:\s*\w+", text, re.IGNORECASE))


async def _execute_tool(
    action: str,
    action_input: str,
    search_engine: str = "duckduckgo",
    google_api_key: str | None = None,
    google_cx: str | None = None,
) -> str:
    """Execute a tool and return the result as a string."""
    if action in ("web_search", "websearch", "search"):
        return await web_search(
            query=action_input,
            engine=search_engine,
            google_api_key=google_api_key,
            google_cx=google_cx,
            max_results=5,
        )
    elif action in ("wikipedia", "wiki"):
        return await wikipedia_search(query=action_input, max_results=3)
    else:
        return f"Unknown tool: {action}. Available tools: web_search, wikipedia"


async def _call_llm(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
) -> str:
    """Call the LLM (OpenAI-compatible API) and return the full response text."""
    url = f"{base_url}/chat/completions"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "model": model,
                "messages": messages,
                "max_tokens": 2048,
                "temperature": 0.3,  # lower temp for more reliable tool parsing
            },
        )
        if resp.status_code != 200:
            error_text = resp.text
            logger.error("LLM API error %d: %s", resp.status_code, error_text)
            raise Exception(f"LLM API returned {resp.status_code}: {error_text}")

        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return content or ""


async def _call_llm_stream(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """Call the LLM with streaming and yield content chunks."""
    url = f"{base_url}/chat/completions"
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "model": model,
                "messages": messages,
                "max_tokens": 2048,
                "temperature": 0.3,
                "stream": True,
            },
        ) as resp:
            if resp.status_code != 200:
                error_text = await resp.aread()
                raise Exception(f"LLM API returned {resp.status_code}: {error_text.decode()}")

            buffer = ""
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    content = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue


async def run_react_agent(
    base_url: str,
    api_key: str,
    model: str,
    conversation_messages: list[dict],
    search_engine: str = "duckduckgo",
    google_api_key: str | None = None,
    google_cx: str | None = None,
) -> str:
    """
    Run the ReAct agent loop (non-streaming).
    Returns the final answer string.
    """
    system_prompt = _build_system_prompt(search_engine)

    # Build messages with system prompt
    messages = [
        {"role": "system", "content": system_prompt},
        *conversation_messages,
    ]

    for step in range(MAX_REACT_STEPS):
        logger.info("ReAct step %d/%d", step + 1, MAX_REACT_STEPS)

        # Call the LLM
        response_text = await _call_llm(base_url, api_key, model, messages)
        logger.debug("LLM response: %s", response_text[:200])

        # Check for final answer first
        final_answer = _parse_final_answer(response_text)
        if final_answer and not _has_action(response_text.split("Final Answer:")[0]):
            return final_answer

        # Check if the response has no action - treat as direct answer
        if not _has_action(response_text):
            return response_text

        # Parse the action
        action, action_input = _parse_action(response_text)
        if not action or not action_input:
            # Malformed action, return whatever we got
            return response_text

        # Execute the tool
        logger.info("Executing tool: %s(%s)", action, action_input[:50])
        try:
            observation = await _execute_tool(
                action, action_input, search_engine, google_api_key, google_cx
            )
        except Exception as e:
            observation = f"Tool execution failed: {str(e)}"
            logger.error("Tool execution failed: %s", e)

        # Add the assistant response and observation to messages
        messages.append({"role": "assistant", "content": response_text})
        messages.append({
            "role": "user",
            "content": f"Observation: {observation}\n\nBased on this observation, continue your reasoning. If you have enough information, provide your Final Answer. If not, use another tool.",
        })

    # If we exhausted steps, ask LLM for final answer
    messages.append({
        "role": "user",
        "content": "You have used all available tool steps. Please provide your Final Answer now based on all the information gathered.",
    })
    final_response = await _call_llm(base_url, api_key, model, messages)
    final_answer = _parse_final_answer(final_response)
    return final_answer or final_response


async def run_react_agent_stream(
    base_url: str,
    api_key: str,
    model: str,
    conversation_messages: list[dict],
    search_engine: str = "duckduckgo",
    google_api_key: str | None = None,
    google_cx: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Run the ReAct agent with streaming.
    Yields dicts: {"type": "thinking"|"tool"|"chunk"|"done", "content": str}

    - "thinking": The agent's reasoning (Thought lines)
    - "tool": Tool being called and its results
    - "chunk": Streaming text of the final answer
    - "done": Final assembled answer
    """
    system_prompt = _build_system_prompt(search_engine)

    messages = [
        {"role": "system", "content": system_prompt},
        *conversation_messages,
    ]

    for step in range(MAX_REACT_STEPS):
        logger.info("ReAct stream step %d/%d", step + 1, MAX_REACT_STEPS)

        # Collect full LLM response (we need to parse it for actions)
        full_response = await _call_llm(base_url, api_key, model, messages)

        # Check for final answer
        final_answer = _parse_final_answer(full_response)
        if final_answer and not _has_action(full_response.split("Final Answer:")[0]):
            # Stream the final answer
            yield {"type": "chunk", "content": final_answer}
            yield {"type": "done", "content": final_answer}
            return

        # No action = direct answer
        if not _has_action(full_response):
            yield {"type": "chunk", "content": full_response}
            yield {"type": "done", "content": full_response}
            return

        # Parse action
        action, action_input = _parse_action(full_response)
        if not action or not action_input:
            yield {"type": "chunk", "content": full_response}
            yield {"type": "done", "content": full_response}
            return

        # Emit thinking
        thought_match = re.search(r"Thought:\s*(.+?)(?=\nAction:)", full_response, re.DOTALL)
        if thought_match:
            yield {"type": "thinking", "content": thought_match.group(1).strip()}

        # Emit tool call
        yield {"type": "tool", "content": f"Searching {action}: {action_input}"}

        # Execute tool
        try:
            observation = await _execute_tool(
                action, action_input, search_engine, google_api_key, google_cx
            )
        except Exception as e:
            observation = f"Tool execution failed: {str(e)}"

        # Add to message history
        messages.append({"role": "assistant", "content": full_response})
        messages.append({
            "role": "user",
            "content": f"Observation: {observation}\n\nBased on this observation, continue your reasoning. If you have enough information, provide your Final Answer. If not, use another tool.",
        })

    # Exhausted steps - force final answer
    messages.append({
        "role": "user",
        "content": "You have used all available tool steps. Please provide your Final Answer now based on all the information gathered.",
    })
    final_response = await _call_llm(base_url, api_key, model, messages)
    final_answer = _parse_final_answer(final_response) or final_response
    yield {"type": "chunk", "content": final_answer}
    yield {"type": "done", "content": final_answer}
