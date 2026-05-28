import { useAppStore } from "@/stores/appStore";
import { ThemeToggle } from "../common/ThemeToggle";
import {
  Plus,
  MessageSquare,
  Settings,
  Trash2,
  PanelLeftClose,
} from "lucide-react";
import { clsx } from "clsx";

export function Sidebar() {
  const {
    sessions,
    activeSessionId,
    sidebarOpen,
    setSidebarOpen,
    createSession,
    loadSession,
    deleteSession,
    setView,
    view,
  } = useAppStore();

  if (!sidebarOpen) return null;

  return (
    <aside className="w-72 h-full border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <h1 className="font-bold text-lg">FS AI Chat</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
      </div>

      <div className="p-3">
        <button
          onClick={() => {
            createSession();
            setView("chat");
          }}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={clsx(
              "group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer mb-1 transition-colors",
              session.id === activeSessionId
                ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
            onClick={() => loadSession(session.id)}
          >
            <MessageSquare size={16} className="flex-shrink-0" />
            <span className="flex-1 truncate text-sm">{session.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteSession(session.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setView(view === "settings" ? "chat" : "settings")}
          className={clsx(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm",
            view === "settings"
              ? "bg-gray-200 dark:bg-gray-700"
              : "hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <Settings size={16} />
          API Key Settings
        </button>
      </div>
    </aside>
  );
}
