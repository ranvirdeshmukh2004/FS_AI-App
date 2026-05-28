import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { MessageBubble } from "./MessageBubble";
import { StreamingBubble } from "./StreamingBubble";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "../common/ModelSelector";
import { MessageSquarePlus, X, AlertTriangle } from "lucide-react";

export function ChatView() {
  const { messages, isStreaming, streamingContent, activeSessionId, error, clearError } =
    useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <ModelSelector />
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-600 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
              <MessageSquarePlus size={48} className="mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                {activeSessionId ? "Empty conversation" : "Start a new chat"}
              </h2>
              <p className="text-sm text-center max-w-md">
                Select a provider and model above, make sure your API key is configured
                in Settings, then type a message.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isStreaming && streamingContent && (
            <StreamingBubble content={streamingContent} />
          )}
          {isStreaming && !streamingContent && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-primary-500 animate-pulse" />
              </div>
              <div className="rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatInput />
    </div>
  );
}
