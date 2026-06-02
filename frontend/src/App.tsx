import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ChatView } from "@/components/chat/ChatView";
import { SettingsView } from "@/components/settings/SettingsView";
import { PdfWorkspace } from "@/components/pdf/PdfWorkspace";
import { PanelLeftOpen } from "lucide-react";

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
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        <div className="flex-1 flex flex-col min-w-0">
          {view === "chat" ? <ChatView /> : <SettingsView />}
        </div>
        {view === "chat" && <PdfWorkspace />}
      </main>
    </div>
  );
}
