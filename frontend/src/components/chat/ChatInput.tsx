import { useState, useRef } from "react";
import { Send, Loader2, Wrench, Paperclip, CheckCircle2 } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { usePdfStore } from "@/stores/pdfStore";
import { api } from "@/services/api";

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const useTools = useAppStore((s) => s.useTools);
  const useOrchestrator = useAppStore((s) => s.useOrchestrator);
  const searchEngine = useAppStore((s) => s.searchEngine);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const createSession = useAppStore((s) => s.createSession);
  const { addDocument } = usePdfStore();

  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (fileRef.current) fileRef.current.value = "";

    // Ensure we have a session
    let sid = activeSessionId;
    if (!sid) {
      sid = await createSession();
      if (!sid) return;
    }

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".pdf")) continue;

      setUploading(true);
      setUploadStatus(`Processing ${file.name}...`);

      const docId = genId();

      // Add to PDF workspace for preview
      const url = URL.createObjectURL(file);
      addDocument({
        id: docId,
        name: file.name,
        url,
        file,
        pageCount: 0,
        size: file.size,
      });

      try {
        const result = await api.uploadPdf(file, sid, docId);
        setUploadStatus(`${file.name}: ${result.chunks} chunks indexed from ${result.pages} pages`);

        // Send a system-like message so the AI knows about the upload
        sendMessage(`[I uploaded a PDF: "${file.name}" (${result.pages} pages, ${result.chunks} chunks indexed). Please use the doc_search tool when I ask questions about this document.]`);
      } catch (err) {
        setUploadStatus(`Failed to process ${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    setUploading(false);
    setTimeout(() => setUploadStatus(null), 5000);
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 p-4">
      {useTools && (
        <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded-full">
            <Wrench size={12} />
            {useOrchestrator ? "Orchestrator" : "ReAct"} &middot; {searchEngine === "google" ? "Google" : "DuckDuckGo"}
          </span>
        </div>
      )}

      {uploadStatus && (
        <div className="max-w-3xl mx-auto mb-2">
          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            {uploading ? (
              <Loader2 size={12} className="animate-spin flex-shrink-0" />
            ) : (
              <CheckCircle2 size={12} className="flex-shrink-0" />
            )}
            {uploadStatus}
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto flex gap-2 items-end">
        {/* PDF Upload button */}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="p-2.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0 disabled:opacity-50"
          title="Upload PDF"
        >
          {uploading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Paperclip size={18} />
          )}
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={isStreaming ? "Waiting for response..." : "Type a message or attach a PDF..."}
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
