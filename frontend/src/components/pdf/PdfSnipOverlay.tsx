import { useState, useCallback, useRef } from "react";
import { usePdfStore } from "@/stores/pdfStore";
import { useAppStore } from "@/stores/appStore";
import { Send, Download, RotateCcw, X } from "lucide-react";

interface Props {
  viewerRef: React.RefObject<HTMLDivElement | null>;
}

export function PdfSnipOverlay({ viewerRef }: Props) {
  const { setSnipping, currentPage, getActiveDoc } = usePdfStore();
  const sendMessage = useAppStore((s) => s.sendMessage);

  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [end, setEnd] = useState({ x: 0, y: 0 });
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const getRelativePos = useCallback((e: React.MouseEvent) => {
    const rect = viewerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left + (viewerRef.current?.scrollLeft || 0),
      y: e.clientY - rect.top + (viewerRef.current?.scrollTop || 0),
    };
  }, [viewerRef]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (capturedImage) return;
    const pos = getRelativePos(e);
    setStart(pos);
    setEnd(pos);
    setDragging(true);
  }, [getRelativePos, capturedImage]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setEnd(getRelativePos(e));
  }, [dragging, getRelativePos]);

  const handleMouseUp = useCallback(async () => {
    if (!dragging) return;
    setDragging(false);

    const x1 = Math.min(start.x, end.x);
    const y1 = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    if (w < 20 || h < 20) return;

    // Capture the region using canvas
    const canvas = viewerRef.current?.querySelector("canvas");
    if (!canvas) return;

    const viewerRect = viewerRef.current!.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const scrollLeft = viewerRef.current!.scrollLeft;
    const scrollTop = viewerRef.current!.scrollTop;

    // Convert viewer-relative coords to canvas-relative coords
    const canvasOffsetX = canvasRect.left - viewerRect.left + scrollLeft;
    const canvasOffsetY = canvasRect.top - viewerRect.top + scrollTop;

    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;

    const sx = (x1 - canvasOffsetX) * scaleX;
    const sy = (y1 - canvasOffsetY) * scaleY;
    const sw = w * scaleX;
    const sh = h * scaleY;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const ctx = cropCanvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    setCapturedImage(cropCanvas.toDataURL("image/png"));
  }, [dragging, start, end, viewerRef]);

  const handleSendToChat = () => {
    if (!capturedImage) return;
    const doc = getActiveDoc();
    const citation = doc ? `[${doc.name}, Page ${currentPage}]` : "";
    sendMessage(`[Snipped image from PDF] ${citation}\n\nPlease analyze this image from the document.`);
    setSnipping(false);
    setCapturedImage(null);
  };

  const handleDownload = () => {
    if (!capturedImage) return;
    const a = document.createElement("a");
    a.href = capturedImage;
    a.download = `snip-page-${currentPage}.png`;
    a.click();
  };

  const selX = Math.min(start.x, end.x);
  const selY = Math.min(start.y, end.y);
  const selW = Math.abs(end.x - start.x);
  const selH = Math.abs(end.y - start.y);

  return (
    <div
      className="absolute inset-0 z-40"
      style={{ cursor: capturedImage ? "default" : "crosshair" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Dimming overlay */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Selection rectangle */}
      {dragging && selW > 5 && selH > 5 && (
        <div
          className="absolute border-2 border-amber-500 bg-amber-500/10 rounded"
          style={{ left: selX, top: selY, width: selW, height: selH }}
        />
      )}

      {/* Captured image preview */}
      {capturedImage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4 max-w-lg max-h-[80%] overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Snipped Region</h3>
              <button onClick={() => { setCapturedImage(null); setSnipping(false); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={16} />
              </button>
            </div>
            <img src={capturedImage} alt="Snip" className="rounded-lg border border-gray-200 dark:border-gray-600 max-w-full" />
            <div className="flex items-center gap-2 mt-3">
              <button onClick={handleSendToChat} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5">
                <Send size={13} /> Send to Chat
              </button>
              <button onClick={handleDownload} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5">
                <Download size={13} /> Download
              </button>
              <button onClick={() => setCapturedImage(null)} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5">
                <RotateCcw size={13} /> Retake
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!capturedImage && !dragging && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/90 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur">
          Drag to select a region · ESC to cancel
        </div>
      )}
    </div>
  );
}
