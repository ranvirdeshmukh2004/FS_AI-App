import { useState, useEffect, useRef, useCallback } from "react";
import { usePdfStore } from "@/stores/pdfStore";
import { pdfjs } from "react-pdf";

/**
 * Lightweight thumbnails — renders page previews using a single
 * shared PDF document + canvas, with virtualization (only renders
 * thumbnails visible in the scroll viewport).
 */
export function PdfThumbnails() {
  const { currentPage, setCurrentPage, getActiveDoc } = usePdfStore();
  const doc = getActiveDoc();
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 20 });
  const pdfDocRef = useRef<any>(null);
  const renderingRef = useRef<Set<number>>(new Set());

  // Load PDF document once
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    pdfjs.getDocument(doc.url).promise.then((pdf) => {
      if (!cancelled) pdfDocRef.current = pdf;
    });
    return () => { cancelled = true; };
  }, [doc?.url]);

  // Render a single thumbnail
  const renderThumb = useCallback(async (pageNum: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf || renderingRef.current.has(pageNum) || thumbnails.has(pageNum)) return;

    renderingRef.current.add(pageNum);
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.3 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      setThumbnails((prev) => new Map(prev).set(pageNum, dataUrl));
    } catch { /* ignore */ }
    renderingRef.current.delete(pageNum);
  }, [thumbnails]);

  // Render visible thumbnails
  useEffect(() => {
    if (!pdfDocRef.current) return;
    for (let p = visibleRange.start; p <= visibleRange.end; p++) {
      renderThumb(p);
    }
  }, [visibleRange, renderThumb]);

  // Track scroll to determine visible range
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const thumbHeight = 100; // approximate height per thumbnail
    const start = Math.max(1, Math.floor(el.scrollTop / thumbHeight));
    const visible = Math.ceil(el.clientHeight / thumbHeight) + 4;
    const end = Math.min(doc?.pageCount || 0, start + visible);
    setVisibleRange({ start, end });
  }, [doc?.pageCount]);

  useEffect(() => {
    handleScroll();
  }, [handleScroll]);

  // Scroll current page into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const thumb = el.querySelector(`[data-page="${currentPage}"]`);
    if (thumb) thumb.scrollIntoView({ block: "nearest" });
  }, [currentPage]);

  if (!doc) return null;

  const pages = Array.from({ length: doc.pageCount }, (_, i) => i + 1);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-2 px-1.5 space-y-2"
    >
      {pages.map((pageNum) => (
        <button
          key={pageNum}
          data-page={pageNum}
          onClick={() => setCurrentPage(pageNum)}
          className={`w-full rounded-lg overflow-hidden border-2 transition-colors ${
            pageNum === currentPage
              ? "border-primary-500 shadow-sm"
              : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          {thumbnails.has(pageNum) ? (
            <img
              src={thumbnails.get(pageNum)}
              alt={`Page ${pageNum}`}
              className="w-full"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded" />
          )}
          <div className="text-[10px] text-center text-gray-400 py-0.5">{pageNum}</div>
        </button>
      ))}
    </div>
  );
}
