import { usePdfStore } from "@/stores/pdfStore";
import { Document, Page, pdfjs } from "react-pdf";

export function PdfThumbnails() {
  const { showThumbnails, currentPage, setCurrentPage, getActiveDoc } = usePdfStore();
  const doc = getActiveDoc();

  if (!showThumbnails || !doc) return null;

  const pages = Array.from({ length: doc.pageCount }, (_, i) => i + 1);

  return (
    <div className="w-28 border-r border-gray-200 dark:border-gray-700 overflow-y-auto flex-shrink-0 bg-gray-50/50 dark:bg-gray-900/50 py-2 px-1.5 space-y-2">
      {pages.map((pageNum) => (
        <button
          key={pageNum}
          onClick={() => setCurrentPage(pageNum)}
          className={`w-full rounded-lg overflow-hidden border-2 transition-colors ${
            pageNum === currentPage
              ? "border-primary-500 shadow-sm"
              : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          <Document file={doc.url} loading={null}>
            <Page
              pageNumber={pageNum}
              width={88}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={
                <div className="w-full h-24 bg-gray-100 dark:bg-gray-800 animate-pulse" />
              }
            />
          </Document>
          <div className="text-[10px] text-center text-gray-400 py-0.5">{pageNum}</div>
        </button>
      ))}
    </div>
  );
}
