"""
AI Agent Orchestrator

Routes queries to the most efficient execution path:
  1. DIRECT — Simple queries answered by LLM alone (no tools)
  2. SINGLE — Query needs one tool, execute directly without ReAct loop
  3. REACT  — Complex multi-step queries needing reasoning + multiple tools

Also groups tools into specialist domains for focused system prompts,
reducing context bloat and improving tool selection accuracy.
"""

import json
import logging
import re
import time
from typing import AsyncGenerator

from app.services.llm_client import call_llm, build_trace_json
from app.services.tools.web_search import web_search
from app.services.tools.wikipedia import wikipedia_search
from app.services.tools.calculator import calculator
from app.services.tools.datetime_tool import datetime_tool
from app.services.tools.weather import weather
from app.services.tools.read_url import read_url
from app.services.tools.python_executor import python_executor
from app.services.tools.doc_search import doc_search, set_doc_search_context

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool registry — maps names to functions and metadata
# ---------------------------------------------------------------------------
TOOL_REGISTRY = {
    "web_search": {"fn": web_search, "domain": "research", "label": "Web Search",
                   "desc": "Search the web for current info, news, facts"},
    "wikipedia":  {"fn": wikipedia_search, "domain": "research", "label": "Wikipedia",
                   "desc": "Look up encyclopedic information"},
    "read_url":   {"fn": read_url, "domain": "research", "label": "Read URL",
                   "desc": "Fetch and read text from a web page"},
    "calculator": {"fn": calculator, "domain": "compute", "label": "Calculator",
                   "desc": "Math: arithmetic, sqrt, log, trig, factorial"},
    "python_executor": {"fn": python_executor, "domain": "compute", "label": "Python",
                        "desc": "Execute Python code in a sandbox"},
    "datetime":   {"fn": datetime_tool, "domain": "info", "label": "DateTime",
                   "desc": "Current time, timezone conversion, date math"},
    "weather":    {"fn": weather, "domain": "info", "label": "Weather",
                   "desc": "Current weather for any city (free)"},
    "doc_search": {"fn": doc_search, "domain": "research", "label": "Document Search",
                   "desc": "Search uploaded PDF documents for relevant information. Use when user asks about uploaded files."},
}

# Aliases for flexible LLM tool naming
TOOL_ALIASES = {
    "websearch": "web_search", "search": "web_search",
    "docsearch": "doc_search", "document_search": "doc_search", "pdf_search": "doc_search",
    "wiki": "wikipedia",
    "readurl": "read_url", "url": "read_url", "fetch": "read_url",
    "calc": "calculator", "math": "calculator",
    "python": "python_executor", "code": "python_executor", "execute": "python_executor",
    "date": "datetime", "time": "datetime",
}

# ---------------------------------------------------------------------------
# Query Router — keyword-based classification (zero-cost, no LLM call)
# ---------------------------------------------------------------------------
ROUTE_PATTERNS = {
    "calculator": [
        r"\b\d+\s*[\+\-\*\/\^%]\s*\d+",
        r"\bcalculate\b", r"\bcompute\b", r"\bsolve\b.*\bmath\b",
        r"\bsqrt\b", r"\bfactorial\b", r"\blog\b.*\d",
        r"\bsin\b|\bcos\b|\btan\b",
        r"\bwhat(?:'s| is) \d+", r"\bhow much is\b",
        r"\b\d+\s*(?:plus|minus|times|divided by|percent\s*of)\s*\d+",
    ],
    "datetime": [
        r"\bwhat(?:'s| is) (?:the )?(?:time|date|day)\b",
        r"\bwhat time\b",
        r"\bwhat(?:'s| is) (?:today|the date|the day)\b",
        r"\btoday(?:'s)?\b.*\b(?:date|day)\b",
        r"\bcurrent(?:ly)?\b.*\b(?:time|date)\b",
        r"\btimezone\b",
        r"\btime\b.*\bin\b",  # "time in Tokyo", "time in London"
        r"\bin\b.*\btime\b",  # "current time in X"
        r"\btime\b.*\b(?:utc|gmt|ist|est|pst|cet|jst|tokyo|london|new york|paris|dubai|sydney)\b",
        r"\bconvert\b.*\b(?:est|pst|ist|utc|gmt|cet|jst)\b",
        r"\bdays? (?:until|till|from|since|ago)\b",
        r"\bwhat day\b", r"\bwhat month\b", r"\bwhat year\b",
        r"\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*\bdate\b",
    ],
    "weather": [
        r"\bweather\b", r"\btemperature\b", r"\bforecast\b",
        r"\bhow(?:'s| is) (?:the )?weather\b",
        r"\bwill it (?:rain|snow)\b", r"\bhumidity\b", r"\bwind speed\b",
        r"\bclimate\b.*\bin\b",
        r"\bis it (?:cold|hot|warm|raining|snowing)\b",
    ],
    "web_search": [
        r"\bsearch\b.*\bfor\b", r"\bgoogle\b", r"\blook up\b",
        r"\bfind\b.*\bonline\b", r"\bsearch online\b",
        r"\blatest\b", r"\brecent\b", r"\bnews\b",
        r"\bcurrent\b.*\b(?:price|rate|score|status)\b",
        r"\bwhat(?:'s| is) happening\b",
        r"\btoday(?:'s)?\b.*\b(?:news|headlines|updates)\b",
        r"\b20(?:2[4-9]|3\d)\b",
        r"\bstock price\b", r"\bcrypto\b", r"\bbitcoin\b", r"\bethereumb\b",
        r"\bwhat(?:'s| is)\b.*\b(?:price|cost|rate|score|result)\b",
        r"\b(?:today|now|currently|right now)\b.*\b(?:price|rate|value)\b",
    ],
    "wikipedia": [
        r"\bwikipedia\b", r"\bwiki\b",
        r"\bwho (?:is|was|were)\b",
        r"\bwhat is\b", r"\bwhat are\b", r"\bwhat was\b",
        r"\bwhere is\b", r"\bwhere was\b",
        r"\bhistory of\b", r"\btell me about\b", r"\bexplain\b",
        r"\bdescribe\b", r"\bdefine\b", r"\bdefinition of\b",
        r"\bhow does\b", r"\bhow do\b", r"\bhow did\b",
        r"\bwhy (?:is|was|did|does|do)\b",
        r"\bwhen (?:was|did|is)\b",
        r"\bcapital of\b", r"\bpopulation of\b",
        r"\bfamous for\b", r"\bknown for\b",
    ],
    "read_url": [
        r"https?://",
        r"\bread\b.*\burl\b", r"\bfetch\b.*\b(?:page|url|link)\b",
        r"\bopen\b.*\blink\b", r"\bvisit\b.*\b(?:site|page|url)\b",
        r"\bscrape\b", r"\bcontent of\b.*\b(?:website|page|url)\b",
        r"\bsummarize\b.*https?://",
    ],
    "python_executor": [
        r"\brun\b.*\bcode\b", r"\bexecute\b.*\b(?:python|code|script)\b",
        r"\bwrite\b.*\b(?:python|script|code)\b.*\band run\b",
        r"\bdata analysis\b", r"\bpandas\b", r"\bnumpy\b",
        r"\bgenerate\b.*\bdata\b",
    ],
    "doc_search": [
        r"\b(?:the|this|uploaded|attached|my)\b.*\b(?:pdf|document|file|paper|report)\b",
        r"\bpage\s*\d+",
        r"\bsummarize\b.*\b(?:document|pdf|file|paper)\b",
        r"\baccording to\b.*\b(?:document|pdf|file)\b",
        r"\bfrom the\b.*\b(?:document|pdf|paper|report)\b",
        r"\bextract\b.*\bfrom\b.*\b(?:document|pdf|file)\b",
        r"\bin the\b.*\b(?:report|paper|doc|pdf)\b",
    ],
}

# Queries matching these are always DIRECT (no tools needed)
# Keep this list TIGHT — when in doubt, let the router decide via ROUTE_PATTERNS
DIRECT_PATTERNS = [
    r"^(?:hi+|hello+|hey+|thanks?|thank you|bye|goodbye|ok|okay|sure|yes|no|yep|nope|cool|great|awesome)\s*[!?.]*$",
    r"^(?:hi|hello|hey)\s+(?:there|friend|claude|bot)\s*[!.]*$",
    r"^(?:what can you do|who are you|what are you|how are you)\b",
    r"\bwrite\b.*\b(?:poem|story|essay|letter|email)\b",
    r"\bhelp me\b.*\b(?:write|draft)\b",
    r"\btranslate\s+.{1,200}\s+(?:to|into|from)\b",
]


class QueryRoute:
    DIRECT = "direct"    # No tools needed
    SINGLE = "single"    # One tool, direct execution
    REACT = "react"      # Multi-step reasoning with tools


def classify_query(query: str) -> tuple[str, str | None]:
    """
    Classify a query into a route and optional tool name.
    Returns (route, tool_name_or_None).
    Zero-cost: pure regex, no LLM call.
    """
    q = query.lower().strip()

    # Check DIRECT patterns first
    for pattern in DIRECT_PATTERNS:
        if re.search(pattern, q, re.IGNORECASE):
            return QueryRoute.DIRECT, None

    # Check tool patterns
    matched_tools: list[str] = []
    for tool_name, patterns in ROUTE_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, q, re.IGNORECASE):
                matched_tools.append(tool_name)
                break

    if len(matched_tools) == 0:
        return QueryRoute.REACT, None
    elif len(matched_tools) == 1:
        return QueryRoute.SINGLE, matched_tools[0]
    else:
        # Multiple tools matched — pick the highest-priority specific one.
        # Priority: read_url > calculator > datetime > weather > web_search > wikipedia > others
        priority = ["read_url", "calculator", "datetime", "weather",
                    "web_search", "python_executor", "doc_search", "wikipedia"]
        for p in priority:
            if p in matched_tools:
                return QueryRoute.SINGLE, p
        return QueryRoute.REACT, None


def resolve_tool(name: str) -> str:
    """Resolve tool aliases to canonical name."""
    name = name.lower().strip()
    return TOOL_ALIASES.get(name, name)


async def execute_tool(tool_name: str, tool_input: str,
                       search_engine: str = "duckduckgo",
                       google_api_key: str | None = None,
                       google_cx: str | None = None) -> str:
    """Execute a tool by canonical name."""
    tool_name = resolve_tool(tool_name)
    tool = TOOL_REGISTRY.get(tool_name)
    if not tool:
        return f"Unknown tool: {tool_name}. Available: {', '.join(TOOL_REGISTRY.keys())}"

    fn = tool["fn"]
    if tool_name == "web_search":
        return await fn(query=tool_input, engine=search_engine,
                        google_api_key=google_api_key, google_cx=google_cx, max_results=5)
    elif tool_name == "wikipedia":
        return await fn(query=tool_input, max_results=3)
    else:
        return await fn(tool_input)


# ---------------------------------------------------------------------------
# Specialist agent system prompts — focused tool sets per domain
# ---------------------------------------------------------------------------
def _get_domain_tools(domain: str | None) -> dict:
    """Get tools for a specific domain, or all tools if domain is None."""
    if domain is None:
        return TOOL_REGISTRY
    return {k: v for k, v in TOOL_REGISTRY.items() if v["domain"] == domain}


def _build_tool_descriptions(tools: dict) -> str:
    lines = []
    for i, (name, info) in enumerate(tools.items(), 1):
        lines.append(f"{i}. {name} — {info['desc']}")
    return "\n".join(lines)


REACT_SYSTEM = """You are a helpful AI assistant with access to external tools.

Available tools:
{tool_list}

When you use a tool, follow this EXACT format:

Thought: [your reasoning]
Action: [tool name]
Action Input: [input for the tool]

After an Observation, either use another tool or provide your final answer:

Thought: I now have enough information.
Final Answer: [your complete answer]

If you do NOT need tools, respond normally without the Thought/Action format.
{extra_context}"""

SINGLE_TOOL_SYSTEM = """You are a helpful AI assistant. A tool has been called to help answer the user's question.
Synthesize the tool results into a clear, helpful answer.
If the tool result is insufficient, say so and suggest what else might help."""


# ---------------------------------------------------------------------------
# ReAct parsing helpers
# ---------------------------------------------------------------------------
def _parse_action(text: str) -> tuple[str | None, str | None]:
    m = re.search(r"Action:\s*(\w+)\s*\n\s*Action Input:\s*(.+?)(?:\n(?:Thought:|Action:|$)|\Z)",
                  text, re.IGNORECASE | re.DOTALL)
    if m:
        return resolve_tool(m.group(1).strip()), m.group(2).strip().strip('"\'')
    return None, None


def _parse_final_answer(text: str) -> str | None:
    m = re.search(r"Final Answer:\s*(.+)", text, re.IGNORECASE | re.DOTALL)
    return m.group(1).strip() if m else None


def _has_action(text: str) -> bool:
    return bool(re.search(r"Action:\s*\w+", text, re.IGNORECASE))


def _clean_response(text: str) -> str:
    """Strip ReAct format artifacts so the user only sees the answer."""
    # If there's a Final Answer, return only that
    fa = re.search(r"Final Answer:\s*(.+)", text, re.IGNORECASE | re.DOTALL)
    if fa:
        return fa.group(1).strip()
    # Otherwise strip any remaining format prefixes
    text = re.sub(r"^Thought:\s*.*?\n", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\nThought:\s*", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"Action:\s*\w+\s*\nAction Input:\s*.+", "", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"Observation:\s*.+", "", text, flags=re.IGNORECASE | re.DOTALL)
    return text.strip()


# ---------------------------------------------------------------------------
# Main orchestrator entry point
# ---------------------------------------------------------------------------
MAX_REACT_STEPS = 8


async def run_orchestrator_stream(
    base_url: str, api_key: str, model: str,
    conversation_messages: list[dict],
    search_engine: str = "duckduckgo",
    google_api_key: str | None = None,
    google_cx: str | None = None,
    max_tokens: int = 512,
) -> AsyncGenerator[dict, None]:
    """
    Orchestrator entry point. Classifies the query, then routes to:
    - DIRECT: LLM only (no tools, no overhead)
    - SINGLE: One tool call + LLM synthesis
    - REACT: Full multi-step reasoning loop
    """
    start_time = time.time()
    total_in = 0
    total_out = 0
    trace_steps: list[dict] = []

    # Get the latest user message for classification
    user_msg = ""
    for m in reversed(conversation_messages):
        if m["role"] == "user":
            user_msg = m["content"]
            break

    route, target_tool = classify_query(user_msg)
    logger.info("Orchestrator route: %s, tool: %s, query: %s", route, target_tool, user_msg[:80])

    trace_steps.append({
        "type": "router",
        "content": f"Route: {route}" + (f" → {target_tool}" if target_tool else ""),
        "duration": 0,
    })
    yield {"type": "thinking", "content": f"Routing: {route}" + (f" → {target_tool}" if target_tool else "")}

    # --- DIRECT: No tools needed ---
    if route == QueryRoute.DIRECT:
        step_start = time.time()
        response, usage = await call_llm(base_url, api_key, model, conversation_messages, max_tokens=max_tokens)
        dur = round(time.time() - step_start, 2)
        total_in += usage.get("prompt_tokens", 0)
        total_out += usage.get("completion_tokens", 0)

        trace_steps.append({"type": "direct", "content": "Answered directly without tools", "duration": dur})
        td = round(time.time() - start_time, 2)
        yield {"type": "chunk", "content": response}
        yield {"type": "trace", "content": build_trace_json(trace_steps, 0, td, total_in, total_out)}
        yield {"type": "done", "content": response}
        return

    # --- SINGLE: One tool, direct execution ---
    if route == QueryRoute.SINGLE and target_tool:
        yield {"type": "tool", "content": f"Using {target_tool}"}
        trace_steps.append({"type": "action", "tool": target_tool, "input": user_msg})

        tool_start = time.time()
        try:
            tool_result = await execute_tool(target_tool, user_msg, search_engine, google_api_key, google_cx)
        except Exception as e:
            tool_result = f"Tool error: {str(e)}"
        tool_dur = round(time.time() - tool_start, 2)

        obs_summary = tool_result[:300] + "..." if len(tool_result) > 300 else tool_result
        trace_steps.append({"type": "observation", "tool": target_tool, "content": obs_summary, "duration": tool_dur})
        yield {"type": "observation", "content": f"{target_tool} returned results ({tool_dur}s)"}

        # LLM synthesizes the tool result into a proper answer
        synth_messages = [
            {"role": "system", "content": SINGLE_TOOL_SYSTEM},
            *conversation_messages,
            {"role": "assistant", "content": f"I used the {target_tool} tool and got:\n{tool_result}"},
            {"role": "user", "content": "Now synthesize this into a clear, helpful answer for the user."},
        ]

        step_start = time.time()
        response, usage = await call_llm(base_url, api_key, model, synth_messages, max_tokens=max_tokens)
        dur = round(time.time() - step_start, 2)
        total_in += usage.get("prompt_tokens", 0)
        total_out += usage.get("completion_tokens", 0)

        trace_steps.append({"type": "thought", "content": "Synthesized tool results into answer", "duration": dur})
        td = round(time.time() - start_time, 2)
        clean = _clean_response(response)
        yield {"type": "chunk", "content": clean}
        yield {"type": "trace", "content": build_trace_json(trace_steps, 1, td, total_in, total_out)}
        yield {"type": "done", "content": clean}
        return

    # --- REACT: Full multi-step reasoning ---
    tool_list = _build_tool_descriptions(TOOL_REGISTRY)
    extra = f"\nNote: Web search uses {search_engine}."
    system_prompt = REACT_SYSTEM.format(tool_list=tool_list, extra_context=extra)

    messages = [{"role": "system", "content": system_prompt}, *conversation_messages]
    tool_call_count = 0
    react_max_tokens = max(max_tokens, 1024)  # ReAct needs room to output Thought+Action

    for step in range(MAX_REACT_STEPS):
        step_start = time.time()
        full_response, usage = await call_llm(base_url, api_key, model, messages, max_tokens=react_max_tokens)
        llm_dur = round(time.time() - step_start, 2)
        total_in += usage.get("prompt_tokens", 0)
        total_out += usage.get("completion_tokens", 0)

        # Final answer?
        final = _parse_final_answer(full_response)
        if final and not _has_action(full_response.split("Final Answer:")[0]):
            tm = re.search(r"Thought:\s*(.+?)(?=\nFinal Answer:)", full_response, re.DOTALL)
            if tm:
                trace_steps.append({"type": "thought", "content": tm.group(1).strip(), "duration": llm_dur})
            td = round(time.time() - start_time, 2)
            clean = _clean_response(final)
            yield {"type": "chunk", "content": clean}
            yield {"type": "trace", "content": build_trace_json(trace_steps, tool_call_count, td, total_in, total_out)}
            yield {"type": "done", "content": clean}
            return

        # Model didn't use tools — on first step, try to infer a tool from the query anyway
        if not _has_action(full_response) and step == 0:
            inferred_route, inferred_tool = classify_query(user_msg)
            if inferred_tool and inferred_route == QueryRoute.SINGLE:
                logger.info("Model skipped tools on step 0; auto-executing inferred tool: %s", inferred_tool)
                yield {"type": "tool", "content": f"Using {inferred_tool}"}
                trace_steps.append({"type": "action", "tool": inferred_tool, "input": user_msg})

                tool_start = time.time()
                try:
                    observation = await execute_tool(inferred_tool, user_msg, search_engine, google_api_key, google_cx)
                except Exception as e:
                    observation = f"Tool error: {str(e)}"
                tool_dur = round(time.time() - tool_start, 2)

                obs_summary = observation[:300] + "..." if len(observation) > 300 else observation
                trace_steps.append({"type": "observation", "tool": inferred_tool, "content": obs_summary, "duration": tool_dur})
                yield {"type": "observation", "content": f"{inferred_tool} returned results ({tool_dur}s)"}

                synth_messages = [
                    {"role": "system", "content": SINGLE_TOOL_SYSTEM},
                    *conversation_messages,
                    {"role": "assistant", "content": f"I used the {inferred_tool} tool and got:\n{observation}"},
                    {"role": "user", "content": "Now synthesize this into a clear, helpful answer for the user."},
                ]
                step_start2 = time.time()
                response2, usage2 = await call_llm(base_url, api_key, model, synth_messages, max_tokens=max_tokens)
                dur2 = round(time.time() - step_start2, 2)
                total_in += usage2.get("prompt_tokens", 0)
                total_out += usage2.get("completion_tokens", 0)
                trace_steps.append({"type": "thought", "content": "Synthesized tool results", "duration": dur2})
                td = round(time.time() - start_time, 2)
                clean2 = _clean_response(response2)
                yield {"type": "chunk", "content": clean2}
                yield {"type": "trace", "content": build_trace_json(trace_steps, 1, td, total_in, total_out)}
                yield {"type": "done", "content": clean2}
                return

        # Direct answer (no tools used by model, no fallback available)
        if not _has_action(full_response):
            td = round(time.time() - start_time, 2)
            clean = _clean_response(full_response)
            yield {"type": "chunk", "content": clean}
            yield {"type": "trace", "content": build_trace_json(
                trace_steps or [{"type": "direct", "content": "Answered directly", "duration": llm_dur}],
                0, td, total_in, total_out)}
            yield {"type": "done", "content": clean}
            return

        # Parse and execute tool
        action, action_input = _parse_action(full_response)
        if not action or not action_input:
            td = round(time.time() - start_time, 2)
            clean = _clean_response(full_response)
            yield {"type": "chunk", "content": clean}
            yield {"type": "trace", "content": build_trace_json(trace_steps, tool_call_count, td, total_in, total_out)}
            yield {"type": "done", "content": clean}
            return

        # Emit thinking
        tm = re.search(r"Thought:\s*(.+?)(?=\nAction:)", full_response, re.DOTALL)
        if tm:
            yield {"type": "thinking", "content": tm.group(1).strip()}
            trace_steps.append({"type": "thought", "content": tm.group(1).strip(), "duration": llm_dur})

        yield {"type": "tool", "content": f"Using {action}: {action_input}"}
        trace_steps.append({"type": "action", "tool": action, "input": action_input})

        tool_start = time.time()
        try:
            observation = await execute_tool(action, action_input, search_engine, google_api_key, google_cx)
        except Exception as e:
            observation = f"Tool execution failed: {str(e)}"
        tool_dur = round(time.time() - tool_start, 2)
        tool_call_count += 1

        obs_summary = observation[:300] + "..." if len(observation) > 300 else observation
        trace_steps.append({"type": "observation", "tool": action, "content": obs_summary, "duration": tool_dur})
        yield {"type": "observation", "content": f"{action} returned results ({tool_dur}s)"}

        messages.append({"role": "assistant", "content": full_response})
        messages.append({"role": "user", "content": f"Observation: {observation}\n\nContinue reasoning. Provide Final Answer if ready, or use another tool."})

    # Exhausted steps
    messages.append({"role": "user", "content": "Provide your Final Answer now."})
    final_response, usage = await call_llm(base_url, api_key, model, messages, max_tokens=max_tokens)
    total_in += usage.get("prompt_tokens", 0)
    total_out += usage.get("completion_tokens", 0)
    final = _clean_response(_parse_final_answer(final_response) or final_response)

    td = round(time.time() - start_time, 2)
    yield {"type": "chunk", "content": final}
    yield {"type": "trace", "content": build_trace_json(trace_steps, tool_call_count, td, total_in, total_out)}
    yield {"type": "done", "content": final}
