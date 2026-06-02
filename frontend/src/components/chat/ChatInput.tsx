import { useState, useRef } from "react";
import { Send, Loader2, Wrench } from "lucide-react";
import { useAppStore } from "@/stores/appStore";

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const useTools = useAppStore((s) => s.useTools);
  const useOrchestrator = useAppStore((s) => s.useOrchestrator);
  const searchEngine = useAppStore((s) => s.searchEngine);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 p-4">
      {useTools && (
        <div className="max-w-3xl mx-auto mb-2">
          <span className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded-full">
            <Wrench size={12} />
            {useOrchestrator ? "Orchestrator" : "ReAct"} &middot; {searchEngine === "google" ? "Google" : "DuckDuckGo"}
          </span>
        </div>
      )}
      <div className="max-w-3xl mx-auto flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={isStreaming ? "Waiting for response..." : "Type a message..."}
          rows={1}
          className="input-field resize-none min-h-[42px] max-h-[200px]"
          disabled={isStreaming}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isStreaming}
          className="btn-primary p-2.5 flex-shrink-0"
        >
          {isStreaming ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
