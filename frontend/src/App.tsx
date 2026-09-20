import { useEffect, lazy, Suspense } from "react";
import { useAppStore } from "@/stores/appStore";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ChatView } from "@/components/chat/ChatView";
import { SettingsView } from "@/components/settings/SettingsView";
import { PanelLeftOpen } from "lucide-react";

// pdfjs is ~370KB and most sessions never open a document, so it is fetched
// only once the workspace is actually rendered.
const PdfWorkspace = lazy(() =>
  import("@/components/pdf/PdfWorkspace").then((m) => ({ default: m.PdfWorkspace }))
);

export default function App() {
  const { view, sidebarOpen, setSidebarOpen, theme, loadSessions, loadProviders } =
    useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    loadSessions();
    loadProviders();
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex min-w-0">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-3 left-3 z-10 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Open sidebar"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        <div className="flex-1 flex flex-col min-w-0">
          {view === "chat" ? <ChatView /> : <SettingsView />}
        </div>
        {view === "chat" && (
          <Suspense fallback={null}>
            <PdfWorkspace />
          </Suspense>
        )}
      </main>
    </div>
  );
}
