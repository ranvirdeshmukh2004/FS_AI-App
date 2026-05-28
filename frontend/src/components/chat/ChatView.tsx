import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { MessageBubble } from "./MessageBubble";
import { StreamingBubble } from "./StreamingBubble";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "../common/ModelSelector";
import { MessageSquarePlus } from "lucide-react";

export function ChatView() {
  const { messages, isStreaming, streamingContent, activeSessionId } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <ModelSelector />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
              <MessageSquarePlus size={48} className="mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                {activeSessionId ? "Empty conversation" : "Start a new chat"}
              </h2>
              <p className="text-sm">
                Select a provider and model, then type a message.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isStreaming && streamingContent && (
            <StreamingBubble content={streamingContent} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatInput />
    </div>
  );
}
