/**
 * TypeScript ReAct agent — runs in-process, no Python needed.
 * Used when ai-services (Python FastAPI) is not reachable.
 * Tools: web_search, wikipedia, calculator, datetime, weather, read_url
 */

import { logger } from "../utils/logger.js";
import { webSearch } from "./tools/webSearch.js";
import { wikipedia } from "./tools/wikipedia.js";
import { calculator } from "./tools/calculator.js";
import { datetime } from "./tools/datetime.js";
import { weather } from "./tools/weather.js";
import { readUrl } from "./tools/readUrl.js";

const MAX_STEPS = 8;

const TOOL_DESCRIPTIONS = `You have access to the following tools:

1. web_search — Search the web for current information, news, or facts.
   Input: A search query string.  Example: web_search("latest AI news")

2. wikipedia — Look up encyclopedic information on Wikipedia.
   Input: A topic.  Example: wikipedia("quantum computing")

3. calculator — Safe math: arithmetic, powers, sqrt, log, trig, factorial.
   Input: A math expression.  Example: calculator("(45 * 3) + sqrt(144)")

4. datetime — Current date/time, timezone conversions, date calculations.
   Input: A query.  Example: datetime("current time in IST")

5. weather — Current weather for any city (free, no API key).
   Input: City name.  Example: weather("Mumbai")

6. read_url — Fetch and read text content of a web page.
   Input: A URL.  Example: read_url("https://example.com/article")

RULES:
- Use calculator for math, datetime for time/timezone questions.
- Use web_search for current events, news, prices.
- You can chain multiple tools.
- If no tools are needed, answer directly without the Thought/Action format.`;

const SYSTEM_PROMPT = `You are a helpful AI assistant with access to external tools.

${TOOL_DESCRIPTIONS}

When you use a tool, follow this EXACT format:

Thought: [your reasoning]
Action: [tool name]
Action Input: [input for the tool]

After an Observation, either use another tool or give your final answer:

Thought: I now have enough information.
Final Answer: [your complete answer]

If you do NOT need tools, respond normally without the Thought/Action format.`;

interface ChatMessage { role: "user" | "assistant" | "system"; content: string }
interface UsageInfo { prompt_tokens?: number; completion_tokens?: number }
interface StreamEvent { type: string; content: string }

function parseAction(text: string): [string | null, string | null] {
  const m = text.match(/Action:\s*(\w+)\s*\n\s*Action Input:\s*([\s\S]+?)(?:\n(?:Thought:|Action:|$)|\s*$)/i);
  if (m) return [m[1].trim().toLowerCase(), m[2].trim().replace(/^['"]|['"]$/g, "")];
  return [null, null];
}

function parseFinalAnswer(text: string): string | null {
  const m = text.match(/Final Answer:\s*([\s\S]+)/i);
  return m ? m[1].trim() : null;
}

function hasAction(text: string): boolean {
  return /Action:\s*\w+/i.test(text);
}

function parseThought(text: string, before?: string): string | null {
  const src = before ?? text;
  const m = src.match(/Thought:\s*([\s\S]+?)(?=\n(?:Action:|Final Answer:))/i);
  return m ? m[1].trim() : null;
}

async function executeTool(
  action: string,
  input: string,
  searchEngine: string,
  googleApiKey?: string,
  googleCx?: string,
): Promise<string> {
  switch (action) {
    case "web_search": case "websearch": case "search":
      return webSearch(input, searchEngine, googleApiKey, googleCx);
    case "wikipedia": case "wiki":
      return wikipedia(input);
    case "calculator": case "calc": case "math":
      return calculator(input);
    case "datetime": case "date": case "time":
      return datetime(input);
    case "weather":
      return weather(input);
    case "read_url": case "readurl": case "url": case "fetch":
      return readUrl(input);
    default:
      return `Unknown tool: ${action}. Available: web_search, wikipedia, calculator, datetime, weather, read_url`;
  }
}

async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<[string, UsageInfo]> {
  const isAnthropic = baseUrl.includes("anthropic.com");

  if (isAnthropic) {
    const systemMsg = messages.find((m) => m.role === "system");
    const convMsgs = messages.filter((m) => m.role !== "system");
    const body: Record<string, unknown> = { model, messages: convMsgs, max_tokens: maxTokens, temperature: 0.3 };
    if (systemMsg) body.system = systemMsg.content;

    const resp = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as { content?: { type: string; text: string }[]; usage?: { input_tokens: number; output_tokens: number } };
    const content = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return [content, { prompt_tokens: data.usage?.input_tokens, completion_tokens: data.usage?.output_tokens }];
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { choices?: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
  const content = data.choices?.[0]?.message?.content || "";
  return [content, { prompt_tokens: data.usage?.prompt_tokens, completion_tokens: data.usage?.completion_tokens }];
}

export async function* runReactAgentTs(
  baseUrl: string,
  apiKey: string,
  model: string,
  conversationMessages: ChatMessage[],
  searchEngine = "duckduckgo",
  googleApiKey?: string,
  googleCx?: string,
  maxTokens = 512,
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT + `\nNote: Web search uses ${searchEngine}.` },
    ...conversationMessages,
  ];

  const traceSteps: Record<string, unknown>[] = [];
  let toolCallCount = 0;
  let totalIn = 0;
  let totalOut = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const stepStart = Date.now();
    let fullResponse: string;
    let usage: UsageInfo;

    try {
      [fullResponse, usage] = await callLLM(baseUrl, apiKey, model, messages, maxTokens);
    } catch (err) {
      logger.error({ err }, "ReAct LLM call failed");
      yield { type: "error", content: `LLM call failed: ${err instanceof Error ? err.message : "unknown"}` };
      return;
    }

    const llmDur = ((Date.now() - stepStart) / 1000).toFixed(2);
    totalIn += usage.prompt_tokens || 0;
    totalOut += usage.completion_tokens || 0;

    const finalAnswer = parseFinalAnswer(fullResponse);
    if (finalAnswer && !hasAction(fullResponse.split("Final Answer:")[0])) {
      const thought = parseThought(fullResponse);
      if (thought) traceSteps.push({ type: "thought", content: thought, duration: parseFloat(llmDur) });

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const trace = { steps: traceSteps, tool_calls: toolCallCount, total_time: parseFloat(totalTime), input_tokens: totalIn, output_tokens: totalOut, total_tokens: totalIn + totalOut };
      yield { type: "chunk", content: finalAnswer };
      yield { type: "trace", content: JSON.stringify(trace) };
      yield { type: "done", content: finalAnswer };
      return;
    }

    if (!hasAction(fullResponse)) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const steps = traceSteps.length > 0 ? traceSteps : [{ type: "direct", content: "Answered directly without tools", duration: parseFloat(llmDur) }];
      const trace = { steps, tool_calls: 0, total_time: parseFloat(totalTime), input_tokens: totalIn, output_tokens: totalOut, total_tokens: totalIn + totalOut };
      yield { type: "chunk", content: fullResponse };
      yield { type: "trace", content: JSON.stringify(trace) };
      yield { type: "done", content: fullResponse };
      return;
    }

    const [action, actionInput] = parseAction(fullResponse);
    if (!action || !actionInput) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const trace = { steps: traceSteps, tool_calls: toolCallCount, total_time: parseFloat(totalTime), input_tokens: totalIn, output_tokens: totalOut, total_tokens: totalIn + totalOut };
      yield { type: "chunk", content: fullResponse };
      yield { type: "trace", content: JSON.stringify(trace) };
      yield { type: "done", content: fullResponse };
      return;
    }

    const thought = parseThought(fullResponse);
    if (thought) {
      yield { type: "thinking", content: thought };
      traceSteps.push({ type: "thought", content: thought, duration: parseFloat(llmDur) });
    }

    yield { type: "tool", content: `Using ${action}: ${actionInput}` };
    traceSteps.push({ type: "action", tool: action, input: actionInput });

    const toolStart = Date.now();
    let observation: string;
    try {
      observation = await executeTool(action, actionInput, searchEngine, googleApiKey, googleCx);
    } catch (err) {
      observation = `Tool execution failed: ${err instanceof Error ? err.message : "unknown"}`;
    }
    const toolDur = ((Date.now() - toolStart) / 1000).toFixed(2);
    toolCallCount++;

    const obsSummary = observation.slice(0, 300) + (observation.length > 300 ? "..." : "");
    traceSteps.push({ type: "observation", tool: action, content: obsSummary, duration: parseFloat(toolDur) });
    yield { type: "observation", content: `${action} returned results (${toolDur}s)` };

    messages.push({ role: "assistant", content: fullResponse });
    messages.push({ role: "user", content: `Observation: ${observation}\n\nContinue reasoning. Provide Final Answer if ready, or use another tool.` });
  }

  // Max steps reached
  messages.push({ role: "user", content: "Provide your Final Answer now." });
  const [finalResp, usage] = await callLLM(baseUrl, apiKey, model, messages, maxTokens);
  totalIn += usage.prompt_tokens || 0;
  totalOut += usage.completion_tokens || 0;
  const final = parseFinalAnswer(finalResp) || finalResp;
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const trace = { steps: traceSteps, tool_calls: toolCallCount, total_time: parseFloat(totalTime), input_tokens: totalIn, output_tokens: totalOut, total_tokens: totalIn + totalOut };
  yield { type: "chunk", content: final };
  yield { type: "trace", content: JSON.stringify(trace) };
  yield { type: "done", content: final };
}
