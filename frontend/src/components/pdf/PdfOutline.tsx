import { useEffect, useCallback, useState } from "react";
import { usePdfStore } from "@/stores/pdfStore";
import type { TocItem } from "@/stores/pdfStore";
import { pdfjs } from "react-pdf";
import { ChevronRight, ChevronDown, BookOpen } from "lucide-react";

function OutlineItem({ item, depth }: { item: TocItem; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const { setCurrentPage } = usePdfStore();
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (item.pageNumber > 0) setCurrentPage(item.pageNumber);
          if (hasChildren) setExpanded(!expanded);
        }}
        className="w-full flex items-center gap-1 px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors group"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown size={12} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{item.title}</span>
        {item.pageNumber > 0 && (
          <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100">{item.pageNumber}</span>
        )}
      </button>
      {expanded && hasChildren && item.children!.map((child, i) => (
        <OutlineItem key={i} item={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function PdfOutline() {
  const { tocItems, setTocItems, getActiveDoc } = usePdfStore();

  const loadOutline = useCallback(async () => {
    const doc = getActiveDoc();
    if (!doc) return;

    try {
      const pdf = await pdfjs.getDocument(doc.url).promise;
      const outline = await pdf.getOutline();
      if (!outline || outline.length === 0) {
        setTocItems([]);
        return;
      }

      const processItems = async (items: any[]): Promise<TocItem[]> => {
        const result: TocItem[] = [];
        for (const item of items) {
          let pageNumber = 0;
          if (item.dest) {
            try {
              const dest = typeof item.dest === "string"
                ? await pdf.getDestination(item.dest)
                : item.dest;
              if (dest && dest[0]) {
                const pageRef = dest[0];
                const pageIdx = await pdf.getPageIndex(pageRef);
                pageNumber = pageIdx + 1;
              }
            } catch { /* ignore */ }
          }
          const children = item.items?.length > 0 ? await processItems(item.items) : undefined;
          result.push({ title: item.title, pageNumber, level: 0, children });
        }
        return result;
      };

      const items = await processItems(outline);
      setTocItems(items);
    } catch {
      setTocItems([]);
    }
  }, [getActiveDoc, setTocItems]);

  useEffect(() => {
    loadOutline();
  }, [loadOutline]);

  if (tocItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-4">
        <BookOpen size={24} className="mb-2 opacity-50" />
        <p className="text-xs text-center">No bookmarks found in this document</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {tocItems.map((item, i) => (
        <OutlineItem key={i} item={item} depth={0} />
      ))}
    </div>
  );
}
