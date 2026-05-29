"""
ReAct (Reasoning + Acting) Agent

Implements a tool-augmented LLM loop with 8 tools:
  web_search, wikipedia, calculator, datetime, weather,
  read_url, python_executor

Tracks token usage and timing across all steps.
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

logger = logging.getLogger(__name__)

MAX_REACT_STEPS = 8

TOOL_DESCRIPTIONS = """You have access to the following tools:

1. web_search
   Search the web for current information, news, or facts not in your training data.
   Input: A search query string
   Example: web_search("latest Tesla stock price")

2. wikipedia
   Look up detailed encyclopedic information on Wikipedia.
   Input: A topic to search
   Example: wikipedia("quantum computing")

3. calculator
   Perform mathematical calculations. Supports arithmetic, powers, sqrt, log, trig, factorial, etc.
   Input: A math expression
   Example: calculator("(45 * 3) + sqrt(144) / 2")

4. datetime
   Get current date/time, timezone conversions, and date calculations.
   Input: A date/time query
   Example: datetime("current time") or datetime("convert EST to IST") or datetime("30 days from now")

5. weather
   Get current weather for any city worldwide (free, no API key needed).
   Input: City name
   Example: weather("London")

6. read_url
   Fetch and read the text content of a web page URL.
   Input: A URL
   Example: read_url("https://example.com/article")

7. python_executor
   Execute Python code for data analysis, calculations, or text processing. Safe sandbox with math, statistics, json, re, collections, datetime modules available.
   Input: Python code to execute
   Example: python_executor("import statistics; data = [10, 20, 30, 40]; print(statistics.mean(data))")

IMPORTANT RULES:
- Only use tools when you genuinely need external information or computation.
- For general conversation, greetings, opinions, or creative tasks, respond directly WITHOUT tools.
- Do NOT use tools for basic knowledge questions you can already answer well.
- Use calculator for math instead of computing in your head.
- Use datetime for any time-related questions to ensure accuracy.
- You can chain multiple tools in sequence to answer complex questions.
"""

REACT_SYSTEM_PROMPT = """You are a helpful AI assistant with access to external tools.

{tool_descriptions}

When you decide to use a tool, you MUST follow this EXACT format:

Thought: [your reasoning about what to do]
Action: [tool name - one of: web_search, wikipedia, calculator, datetime, weather, read_url, python_executor]
Action Input: [the input for the tool]

After receiving an Observation (tool result), you can either:
- Use another tool with the same Thought/Action/Action Input format
- Provide your final answer with:

Thought: I now have enough information to answer.
Final Answer: [your complete answer to the user, using the information gathered]

If you do NOT need any tools, simply respond normally without the Thought/Action format.

Remember: Be concise in your reasoning. Always provide a Final Answer when you have enough information."""


def _build_system_prompt(search_engine: str = "duckduckgo") -> str:
    engine_note = f"\nNote: Web search is currently using {search_engine} as the search engine."
    return REACT_SYSTEM_PROMPT.format(tool_descriptions=TOOL_DESCRIPTIONS) + engine_note


def _parse_action(text: str) -> tuple[str | None, str | None]:
    action_match = re.search(
        r"Action:\s*(\w+)\s*\n\s*Action Input:\s*(.+?)(?:\n(?:Thought:|Action:|$)|\Z)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if action_match:
        action_name = action_match.group(1).strip().lower()
        action_input = action_match.group(2).strip().strip('"\'')
        return action_name, action_input
    return None, None


def _parse_final_answer(text: str) -> str | None:
    match = re.search(r"Final Answer:\s*(.+)", text, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return None


def _has_action(text: str) -> bool:
    return bool(re.search(r"Action:\s*\w+", text, re.IGNORECASE))


async def _execute_tool(
    action: str,
    action_input: str,
    search_engine: str = "duckduckgo",
    google_api_key: str | None = None,
    google_cx: str | None = None,
) -> str:
    if action in ("web_search", "websearch", "search"):
        return await web_search(
            query=action_input, engine=search_engine,
            google_api_key=google_api_key, google_cx=google_cx, max_results=5,
        )
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
    else:
        return f"Unknown tool: {action}. Available: web_search, wikipedia, calculator, datetime, weather, read_url, python_executor"


async def _call_llm(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
) -> tuple[str, dict]:
    """Call the LLM and return (content, usage_dict)."""
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
                "temperature": 0.3,
            },
        )
        if resp.status_code != 200:
            error_text = resp.text
            logger.error("LLM API error %d: %s", resp.status_code, error_text)
            raise Exception(f"LLM API returned {resp.status_code}: {error_text}")

        data = resp.json()
        content = data["choices"][0]["message"]["content"] or ""
        usage = data.get("usage", {})
        return content, usage


async def run_react_agent_stream(
    base_url: str,
    api_key: str,
    model: str,
    conversation_messages: list[dict],
    search_engine: str = "duckduckgo",
    google_api_key: str | None = None,
    google_cx: str | None = None,
) -> AsyncGenerator[dict, None]:
    start_time = time.time()
    system_prompt = _build_system_prompt(search_engine)

    messages = [
        {"role": "system", "content": system_prompt},
        *conversation_messages,
    ]

    trace_steps: list[dict] = []
    tool_call_count = 0
    total_input_tokens = 0
    total_output_tokens = 0

    for step in range(MAX_REACT_STEPS):
        step_start = time.time()
        logger.info("ReAct step %d/%d", step + 1, MAX_REACT_STEPS)

        full_response, usage = await _call_llm(base_url, api_key, model, messages)
        llm_duration = round(time.time() - step_start, 2)
        total_input_tokens += usage.get("prompt_tokens", 0)
        total_output_tokens += usage.get("completion_tokens", 0)

        # Check for final answer
        final_answer = _parse_final_answer(full_response)
        if final_answer and not _has_action(full_response.split("Final Answer:")[0]):
            thought_match = re.search(r"Thought:\s*(.+?)(?=\nFinal Answer:)", full_response, re.DOTALL)
            if thought_match:
                trace_steps.append({"type": "thought", "content": thought_match.group(1).strip(), "duration": llm_duration})

            total_duration = round(time.time() - start_time, 2)
            yield {"type": "chunk", "content": final_answer}
            yield {"type": "trace", "content": json.dumps({
                "steps": trace_steps, "tool_calls": tool_call_count, "total_time": total_duration,
                "input_tokens": total_input_tokens, "output_tokens": total_output_tokens,
                "total_tokens": total_input_tokens + total_output_tokens,
            })}
            yield {"type": "done", "content": final_answer}
            return

        # No action = direct answer
        if not _has_action(full_response):
            total_duration = round(time.time() - start_time, 2)
            yield {"type": "chunk", "content": full_response}
            yield {"type": "trace", "content": json.dumps({
                "steps": trace_steps if trace_steps else [{"type": "direct", "content": "Answered directly without tools", "duration": llm_duration}],
                "tool_calls": 0, "total_time": total_duration,
                "input_tokens": total_input_tokens, "output_tokens": total_output_tokens,
                "total_tokens": total_input_tokens + total_output_tokens,
            })}
            yield {"type": "done", "content": full_response}
            return

        # Parse action
        action, action_input = _parse_action(full_response)
        if not action or not action_input:
            total_duration = round(time.time() - start_time, 2)
            yield {"type": "chunk", "content": full_response}
            yield {"type": "trace", "content": json.dumps({
                "steps": trace_steps, "tool_calls": tool_call_count, "total_time": total_duration,
                "input_tokens": total_input_tokens, "output_tokens": total_output_tokens,
                "total_tokens": total_input_tokens + total_output_tokens,
            })}
            yield {"type": "done", "content": full_response}
            return

        # Emit thinking
        thought_match = re.search(r"Thought:\s*(.+?)(?=\nAction:)", full_response, re.DOTALL)
        thought_text = thought_match.group(1).strip() if thought_match else ""
        if thought_text:
            yield {"type": "thinking", "content": thought_text}
            trace_steps.append({"type": "thought", "content": thought_text, "duration": llm_duration})

        # Emit tool call
        yield {"type": "tool", "content": f"Using {action}: {action_input}"}
        trace_steps.append({"type": "action", "tool": action, "input": action_input})

        # Execute tool
        tool_start = time.time()
        try:
            observation = await _execute_tool(action, action_input, search_engine, google_api_key, google_cx)
        except Exception as e:
            observation = f"Tool execution failed: {str(e)}"
        tool_duration = round(time.time() - tool_start, 2)
        tool_call_count += 1

        obs_summary = observation[:300] + "..." if len(observation) > 300 else observation
        trace_steps.append({"type": "observation", "tool": action, "content": obs_summary, "duration": tool_duration})
        yield {"type": "observation", "content": f"{action} returned results ({tool_duration}s)"}

        messages.append({"role": "assistant", "content": full_response})
        messages.append({
            "role": "user",
            "content": f"Observation: {observation}\n\nBased on this observation, continue your reasoning. If you have enough information, provide your Final Answer. If not, use another tool.",
        })

    # Exhausted steps
    messages.append({"role": "user", "content": "You have used all available tool steps. Please provide your Final Answer now based on all the information gathered."})
    final_response, usage = await _call_llm(base_url, api_key, model, messages)
    total_input_tokens += usage.get("prompt_tokens", 0)
    total_output_tokens += usage.get("completion_tokens", 0)
    final_answer = _parse_final_answer(final_response) or final_response

    total_duration = round(time.time() - start_time, 2)
    yield {"type": "chunk", "content": final_answer}
    yield {"type": "trace", "content": json.dumps({
        "steps": trace_steps, "tool_calls": tool_call_count, "total_time": total_duration,
        "input_tokens": total_input_tokens, "output_tokens": total_output_tokens,
        "total_tokens": total_input_tokens + total_output_tokens,
    })}
    yield {"type": "done", "content": final_answer}
