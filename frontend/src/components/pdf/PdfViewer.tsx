import { useCallback, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { usePdfStore } from "@/stores/pdfStore";
import { PdfTextActions } from "./PdfTextActions";
import { PdfSnipOverlay } from "./PdfSnipOverlay";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfViewer() {
  const { currentPage, scale, snipping, getActiveDoc } = usePdfStore();
  const doc = getActiveDoc();
  const viewerRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);

  const handleDocLoad = useCallback(({ numPages }: { numPages: number }) => {
    const store = usePdfStore.getState();
    const active = store.getActiveDoc();
    if (active && active.pageCount !== numPages) {
      // Update page count
      usePdfStore.setState((s) => ({
        documents: s.documents.map((d) =>
          d.id === active.id ? { ...d, pageCount: numPages } : d
        ),
      }));
    }
  }, []);

  const handleTextSelect = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0) {
      setSelectedText(text);
      const range = selection?.getRangeAt(0);
      if (range) {
        const rect = range.getBoundingClientRect();
        const viewerRect = viewerRef.current?.getBoundingClientRect();
        if (viewerRect) {
          setSelectionPos({
            x: rect.left - viewerRect.left + rect.width / 2,
            y: rect.top - viewerRect.top - 8,
          });
        }
      }
    } else {
      setSelectedText("");
      setSelectionPos(null);
    }
  }, []);

  if (!doc) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p className="text-sm">No document loaded</p>
      </div>
    );
  }

  return (
    <div
      ref={viewerRef}
      className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 relative"
      onMouseUp={handleTextSelect}
    >
      {snipping && <PdfSnipOverlay viewerRef={viewerRef} />}

      {selectedText && selectionPos && !snipping && (
        <PdfTextActions
          text={selectedText}
          position={selectionPos}
          onClose={() => { setSelectedText(""); setSelectionPos(null); }}
          pageNumber={currentPage}
          docName={doc.name}
        />
      )}

      <div className="flex flex-col items-center py-4 min-h-full">
        <Document
          file={doc.url}
          onLoadSuccess={handleDocLoad}
          loading={
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          }
          error={
            <div className="text-red-500 text-sm p-4">Failed to load PDF</div>
          }
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            loading={
              <div className="w-full h-[800px] bg-white dark:bg-gray-800 animate-pulse rounded-lg" />
            }
            className="shadow-lg rounded-lg overflow-hidden"
          />
        </Document>

        {/* Page indicator */}
        <div className="mt-3 text-xs text-gray-400">
          Page {currentPage} of {doc.pageCount}
        </div>
      </div>
    </div>
  );
}
