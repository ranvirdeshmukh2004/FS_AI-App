import { useCallback, useEffect, useRef, useState } from "react";
import { usePdfStore } from "@/stores/pdfStore";
import { PdfToolbar } from "./PdfToolbar";
import { PdfDocTabs } from "./PdfDocTabs";
import { PdfSidebar } from "./PdfSidebar";
import { PdfViewer } from "./PdfViewer";
import { PdfUpload } from "./PdfUpload";
import { PdfSearchBar } from "./PdfSearch";

export function PdfWorkspace() {
  const { workspaceOpen, workspaceWidth, setWorkspaceWidth, documents, searchOpen, loadState, saveState } = usePdfStore();
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<number>(0);

  // Load persisted state on mount
  useEffect(() => { loadState(); }, [loadState]);

  // Save state when width changes
  useEffect(() => { if (workspaceOpen) saveState(); }, [workspaceWidth, workspaceOpen, saveState]);

  // Keyboard shortcut: Ctrl+F to search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && workspaceOpen && documents.length > 0) {
        e.preventDefault();
        usePdfStore.getState().setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [workspaceOpen, documents]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    resizeRef.current = e.clientX;

    const handleMove = (ev: MouseEvent) => {
      const delta = resizeRef.current - ev.clientX;
      resizeRef.current = ev.clientX;
      setWorkspaceWidth(usePdfStore.getState().workspaceWidth + delta);
    };

    const handleUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [setWorkspaceWidth]);

  if (!workspaceOpen) return null;

  return (
    <>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className={`w-1 cursor-col-resize hover:bg-primary-400 transition-colors flex-shrink-0 ${
          resizing ? "bg-primary-500" : "bg-gray-200 dark:bg-gray-700"
        }`}
      />

      {/* Workspace panel */}
      <div
        className="flex flex-col h-full bg-white dark:bg-gray-900 flex-shrink-0 overflow-hidden"
        style={{ width: workspaceWidth }}
      >
        {documents.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <PdfUpload />
          </div>
        ) : (
          <>
            <PdfDocTabs />
            <PdfToolbar />
            {searchOpen && <PdfSearchBar />}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <PdfSidebar />
              <PdfViewer />
            </div>
          </>
        )}
      </div>
    </>
  );
}
