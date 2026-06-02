import { usePdfStore } from "@/stores/pdfStore";
import { PdfThumbnails } from "./PdfThumbnails";
import { PdfOutline } from "./PdfOutline";
import { PdfAnnotations } from "./PdfAnnotations";
import { LayoutGrid, BookOpen, Highlighter } from "lucide-react";

const tabs = [
  { id: "thumbnails" as const, icon: <LayoutGrid size={14} />, label: "Pages" },
  { id: "toc" as const, icon: <BookOpen size={14} />, label: "Outline" },
  { id: "annotations" as const, icon: <Highlighter size={14} />, label: "Notes" },
];

export function PdfSidebar() {
  const { showThumbnails, sidebarMode, setSidebarMode } = usePdfStore();

  if (!showThumbnails) return null;

  return (
    <div className="w-40 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50/50 dark:bg-gray-900/50 flex-shrink-0">
      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSidebarMode(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] transition-colors ${
              sidebarMode === tab.id
                ? "text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 bg-white dark:bg-gray-800"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
            title={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Panel content */}
      {sidebarMode === "thumbnails" && <PdfThumbnails />}
      {sidebarMode === "toc" && <PdfOutline />}
      {sidebarMode === "annotations" && <PdfAnnotations />}
    </div>
  );
}
