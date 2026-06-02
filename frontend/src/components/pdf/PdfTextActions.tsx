import { useAppStore } from "@/stores/appStore";
import { usePdfStore } from "@/stores/pdfStore";
import { MessageSquare, Copy, Sparkles, FileText, BookOpen, Highlighter } from "lucide-react";

interface Props {
  text: string;
  position: { x: number; y: number };
  onClose: () => void;
  pageNumber: number;
  docName: string;
}

export function PdfTextActions({ text, position, onClose, pageNumber, docName }: Props) {
  const sendMessage = useAppStore((s) => s.sendMessage);
  const { addHighlight, activeDocId } = usePdfStore();

  const sendToChat = (prefix: string) => {
    const citation = `[${docName}, Page ${pageNumber}]`;
    sendMessage(`${prefix}\n\n> ${text.slice(0, 500)}${text.length > 500 ? "..." : ""}\n\n${citation}`);
    onClose();
  };

  const copyText = () => {
    navigator.clipboard.writeText(text);
    onClose();
  };

  const highlight = () => {
    if (activeDocId) {
      addHighlight({ docId: activeDocId, page: pageNumber, text, color: "#fef08a" });
    }
    onClose();
  };

  const actions = [
    { icon: <MessageSquare size={13} />, label: "Ask AI", action: () => sendToChat("Explain the following text from the PDF:") },
    { icon: <Sparkles size={13} />, label: "Summarize", action: () => sendToChat("Summarize this text:") },
    { icon: <BookOpen size={13} />, label: "Explain", action: () => sendToChat("Explain this in simple terms:") },
    { icon: <FileText size={13} />, label: "Notes", action: () => sendToChat("Create notes from this text:") },
    { icon: <Highlighter size={13} />, label: "Highlight", action: highlight },
    { icon: <Copy size={13} />, label: "Copy", action: copyText },
  ];

  return (
    <div
      className="absolute z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
      style={{ left: position.x, top: position.y, transform: "translate(-50%, -100%)" }}
    >
      <div className="flex items-center gap-0.5 bg-gray-900 dark:bg-gray-100 rounded-lg shadow-xl px-1 py-1">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.action}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-gray-200 dark:text-gray-800 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors whitespace-nowrap"
            title={a.label}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-center">
        <div className="w-2.5 h-2.5 bg-gray-900 dark:bg-gray-100 rotate-45 -mt-1.5" />
      </div>
    </div>
  );
}
