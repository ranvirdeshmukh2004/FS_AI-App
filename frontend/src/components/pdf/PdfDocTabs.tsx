import { usePdfStore } from "@/stores/pdfStore";
import { X, FileText } from "lucide-react";

export function PdfDocTabs() {
  const { documents, activeDocId, setActiveDoc, removeDocument } = usePdfStore();

  if (documents.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 overflow-x-auto flex-shrink-0">
      {documents.map((doc) => (
        <div
          key={doc.id}
          onClick={() => setActiveDoc(doc.id)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer transition-colors max-w-[160px] group ${
            doc.id === activeDocId
              ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm border border-gray-200 dark:border-gray-600"
              : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <FileText size={12} className="flex-shrink-0" />
          <span className="truncate">{doc.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); removeDocument(doc.id); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity flex-shrink-0"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
