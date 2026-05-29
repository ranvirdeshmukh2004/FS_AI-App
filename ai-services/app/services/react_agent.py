"""
ReAct (Reasoning + Acting) Agent

Implements a tool-augmented LLM loop:
  1. Send conversation + system prompt (with tool descriptions) to the LLM
  2. Parse LLM response for Thought / Action / Action Input
  3. Execute the requested tool
  4. Feed the Observation back and repeat
  5. When the LLM emits "Final Answer:", return that to the user

Emits detailed trace events for the frontend reasoning trace panel.
"""

import json
import logging
import re
import time
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
    Yields dicts with these event types:

    - "thinking":  Agent's reasoning text
    - "tool":      Tool being called (action + input)
    - "observation": Summarized tool result
    - "chunk":     Final answer content
    - "done":      Final assembled answer
    - "trace":     Complete reasoning trace with timing + tool count
    """
    start_time = time.time()
    system_prompt = _build_system_prompt(search_engine)

    messages = [
        {"role": "system", "content": system_prompt},
        *conversation_messages,
    ]

    # Collect trace steps for the reasoning trace panel
    trace_steps: list[dict] = []
    tool_call_count = 0

    for step in range(MAX_REACT_STEPS):
        step_start = time.time()
        logger.info("ReAct stream step %d/%d", step + 1, MAX_REACT_STEPS)

        # Collect full LLM response (we need to parse it for actions)
        full_response = await _call_llm(base_url, api_key, model, messages)
        llm_duration = round(time.time() - step_start, 2)

        # Check for final answer
        final_answer = _parse_final_answer(full_response)
        if final_answer and not _has_action(full_response.split("Final Answer:")[0]):
            # Extract thought if present
            thought_match = re.search(r"Thought:\s*(.+?)(?=\nFinal Answer:)", full_response, re.DOTALL)
            if thought_match:
                trace_steps.append({
                    "type": "thought",
                    "content": thought_match.group(1).strip(),
                    "duration": llm_duration,
                })

            # Emit final answer
            total_duration = round(time.time() - start_time, 2)
            yield {"type": "chunk", "content": final_answer}
            yield {
                "type": "trace",
                "content": json.dumps({
                    "steps": trace_steps,
                    "tool_calls": tool_call_count,
                    "total_time": total_duration,
                }),
            }
            yield {"type": "done", "content": final_answer}
            return

        # No action = direct answer (LLM didn't use tools at all)
        if not _has_action(full_response):
            total_duration = round(time.time() - start_time, 2)
            yield {"type": "chunk", "content": full_response}
            yield {
                "type": "trace",
                "content": json.dumps({
                    "steps": trace_steps if trace_steps else [{"type": "direct", "content": "Answered directly without tools", "duration": llm_duration}],
                    "tool_calls": 0,
                    "total_time": total_duration,
                }),
            }
            yield {"type": "done", "content": full_response}
            return

        # Parse action
        action, action_input = _parse_action(full_response)
        if not action or not action_input:
            total_duration = round(time.time() - start_time, 2)
            yield {"type": "chunk", "content": full_response}
            yield {
                "type": "trace",
                "content": json.dumps({
                    "steps": trace_steps,
                    "tool_calls": tool_call_count,
                    "total_time": total_duration,
                }),
            }
            yield {"type": "done", "content": full_response}
            return

        # Extract and emit thinking
        thought_match = re.search(r"Thought:\s*(.+?)(?=\nAction:)", full_response, re.DOTALL)
        thought_text = thought_match.group(1).strip() if thought_match else ""
        if thought_text:
            yield {"type": "thinking", "content": thought_text}
            trace_steps.append({
                "type": "thought",
                "content": thought_text,
                "duration": llm_duration,
            })

        # Emit tool call
        yield {"type": "tool", "content": f"Searching {action}: {action_input}"}
        trace_steps.append({
            "type": "action",
            "tool": action,
            "input": action_input,
        })

        # Execute tool with timing
        tool_start = time.time()
        try:
            observation = await _execute_tool(
                action, action_input, search_engine, google_api_key, google_cx
            )
        except Exception as e:
            observation = f"Tool execution failed: {str(e)}"
        tool_duration = round(time.time() - tool_start, 2)
        tool_call_count += 1

        # Summarize observation for trace (truncate to keep it readable)
        obs_summary = observation[:300] + "..." if len(observation) > 300 else observation
        trace_steps.append({
            "type": "observation",
            "tool": action,
            "content": obs_summary,
            "duration": tool_duration,
        })

        # Emit observation event so frontend can show tool status
        yield {"type": "observation", "content": f"{action} returned results ({tool_duration}s)"}

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

    total_duration = round(time.time() - start_time, 2)
    yield {"type": "chunk", "content": final_answer}
    yield {
        "type": "trace",
        "content": json.dumps({
            "steps": trace_steps,
            "tool_calls": tool_call_count,
            "total_time": total_duration,
        }),
    }
    yield {"type": "done", "content": final_answer}
