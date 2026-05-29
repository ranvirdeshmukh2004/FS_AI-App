import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Message, TraceStep } from "@/types";
import { User, Bot, Clock, Wrench, ChevronDown, ChevronRight, Brain, Search, BookOpen } from "lucide-react";

interface Props {
  message: Message;
}

function getStepIcon(type: string) {
  switch (type) {
    case "thought": return <Brain size={14} className="text-purple-500" />;
    case "action": return <Search size={14} className="text-blue-500" />;
    case "observation": return <BookOpen size={14} className="text-green-500" />;
    default: return <Bot size={14} className="text-gray-400" />;
  }
}

function TraceStepItem({ step, index }: { step: TraceStep; index: number }) {

  const labelMap: Record<string, string> = {
    thought: "Thought",
    action: "Action",
    observation: "Observation",
    direct: "Direct",
  };

  return (
    <div className="flex gap-2 items-start py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0 pt-0.5">{index + 1}</span>
      <span className="flex-shrink-0 pt-0.5">{getStepIcon(step.type)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            {labelMap[step.type] || step.type}
          </span>
          {step.tool && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
              {step.tool}
            </span>
          )}
          {step.duration !== undefined && (
            <span className="text-xs text-gray-400">{step.duration}s</span>
          )}
        </div>
        {step.content && (
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 break-words whitespace-pre-wrap">
            {step.content}
          </p>
        )}
        {step.input && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">
            Query: {step.input}
          </p>
        )}
      </div>
    </div>
  );
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const [traceOpen, setTraceOpen] = useState(false);
  const trace = message.trace;

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0">
          <Bot size={16} className="text-primary-600 dark:text-primary-400" />
        </div>
      )}
      <div className={`max-w-[75%] ${isUser ? "" : ""}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-primary-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = String(children).replace(/\n$/, "");
                    if (match) {
                      return (
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          className="rounded-lg !my-2 text-sm"
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      );
                    }
                    return (
                      <code
                        className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Trace footer — only for assistant messages */}
        {!isUser && trace && (
          <div className="mt-1.5 ml-1">
            {/* Stats bar */}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {trace.total_time}s
              </span>
              {trace.tool_calls > 0 && (
                <span className="flex items-center gap-1">
                  <Wrench size={12} />
                  {trace.tool_calls} tool call{trace.tool_calls !== 1 ? "s" : ""}
                </span>
              )}
              {trace.steps.length > 0 && !(trace.steps.length === 1 && trace.steps[0].type === "direct") && (
                <button
                  onClick={() => setTraceOpen(!traceOpen)}
                  className="flex items-center gap-1 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
                >
                  {traceOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Reasoning trace
                </button>
              )}
            </div>

            {/* Expandable trace */}
            {traceOpen && trace.steps.length > 0 && (
              <div className="mt-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm">
                <div className="space-y-0">
                  {trace.steps.map((step, i) => (
                    <TraceStepItem key={i} step={step} index={i} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
          <User size={16} className="text-white" />
        </div>
      )}
    </div>
  );
}
