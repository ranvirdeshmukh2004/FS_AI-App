import { useState, useCallback, useEffect, useRef } from "react";
import { usePdfStore } from "@/stores/pdfStore";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { pdfjs } from "react-pdf";

export function PdfSearchBar() {
  const {
    searchOpen, searchQuery, searchResults, searchIndex,
    setSearchQuery, setSearchResults, setSearchOpen, setSearchIndex,
    nextSearchResult, prevSearchResult, setCurrentPage, getActiveDoc,
  } = usePdfStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const doSearch = useCallback(async (query: string) => {
    const doc = getActiveDoc();
    if (!doc || !query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const results: { page: number; index: number }[] = [];

    try {
      const pdf = await pdfjs.getDocument(doc.url).promise;
      const q = query.toLowerCase();

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(" ").toLowerCase();

        let idx = 0;
        let pos = text.indexOf(q, idx);
        while (pos !== -1) {
          results.push({ page: p, index: results.length });
          pos = text.indexOf(q, pos + 1);
        }
      }

      setSearchResults(results);
      if (results.length > 0) {
        setCurrentPage(results[0].page);
      }
    } catch {
      setSearchResults([]);
    }

    setSearching(false);
  }, [getActiveDoc, setSearchResults, setCurrentPage]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => doSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery, doSearch, setSearchResults]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) prevSearchResult();
      else nextSearchResult();
    }
    if (e.key === "Escape") setSearchOpen(false);
  };

  if (!searchOpen) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
      <Search size={14} className="text-gray-400 flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search in document..."
        className="flex-1 bg-transparent text-sm outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
      />
      {searching && (
        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      )}
      {searchResults.length > 0 && (
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {searchIndex + 1} / {searchResults.length}
        </span>
      )}
      {searchQuery && searchResults.length === 0 && !searching && (
        <span className="text-xs text-gray-400">No results</span>
      )}
      <button onClick={prevSearchResult} disabled={searchResults.length === 0} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 text-gray-500">
        <ChevronUp size={14} />
      </button>
      <button onClick={nextSearchResult} disabled={searchResults.length === 0} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 text-gray-500">
        <ChevronDown size={14} />
      </button>
      <button onClick={() => setSearchOpen(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
        <X size={14} />
      </button>
    </div>
  );
}
