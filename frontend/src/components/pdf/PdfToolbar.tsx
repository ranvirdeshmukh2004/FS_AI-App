import { usePdfStore } from "@/stores/pdfStore";
import {
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
  Scissors, PanelRightClose, PanelLeft, Search,
  Highlighter,
} from "lucide-react";

const HIGHLIGHT_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff"];

export function PdfToolbar() {
  const {
    currentPage, scale, showThumbnails, selectedText,
    setCurrentPage, setScale, setShowThumbnails,
    setWorkspaceOpen, setSnipping, snipping,
    setSearchOpen, searchOpen, getActiveDoc,
    addHighlight, activeDocId,
  } = usePdfStore();

  const doc = getActiveDoc();
  const pageCount = doc?.pageCount || 0;

  const handleHighlight = (color: string) => {
    if (!selectedText || !activeDocId) return;
    addHighlight({ docId: activeDocId, page: currentPage, text: selectedText, color });
  };

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 gap-2 flex-shrink-0">
      {/* Left: sidebar toggle + page nav */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowThumbnails(!showThumbnails)}
          className={`p-1.5 rounded-md transition-colors ${showThumbnails ? "bg-primary-100 dark:bg-primary-900/30 text-primary-600" : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"}`}
          title="Toggle sidebar"
        >
          <PanelLeft size={16} />
        </button>
        <div className="h-5 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-600 dark:text-gray-400"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <input
            type="number"
            min={1}
            max={pageCount}
            value={currentPage}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (v >= 1 && v <= pageCount) setCurrentPage(v);
            }}
            className="w-10 text-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-xs"
          />
          <span>/ {pageCount}</span>
        </div>
        <button
          onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
          disabled={currentPage >= pageCount}
          className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-600 dark:text-gray-400"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Center: zoom */}
      <div className="flex items-center gap-1">
        <button onClick={() => setScale(scale - 0.15)} className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-gray-500 w-12 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(scale + 0.15)} className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
          <ZoomIn size={16} />
        </button>
        <button onClick={() => setScale(1)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1">Fit</button>
      </div>

      {/* Right: search, highlight, snip, close */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={`p-1.5 rounded-md transition-colors ${searchOpen ? "bg-primary-100 dark:bg-primary-900/30 text-primary-600" : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"}`}
          title="Search (Ctrl+F)"
        >
          <Search size={14} />
        </button>

        {/* Quick highlight colors */}
        {selectedText && (
          <div className="flex items-center gap-0.5 mx-1">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleHighlight(color)}
                className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600 hover:scale-125 transition-transform"
                style={{ backgroundColor: color }}
                title="Highlight selection"
              />
            ))}
          </div>
        )}

        <button
          onClick={() => setSnipping(!snipping)}
          className={`p-1.5 rounded-md transition-colors flex items-center gap-1 text-xs ${snipping ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"}`}
          title="Snip region"
        >
          <Scissors size={14} />
        </button>
        <div className="h-5 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          onClick={() => setWorkspaceOpen(false)}
          className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
          title="Close PDF"
        >
          <PanelRightClose size={16} />
        </button>
      </div>
    </div>
  );
}
