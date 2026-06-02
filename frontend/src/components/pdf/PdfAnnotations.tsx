import { useState } from "react";
import { usePdfStore } from "@/stores/pdfStore";
import { useAppStore } from "@/stores/appStore";
import { Highlighter, StickyNote, Trash2, MessageSquare, Plus } from "lucide-react";

export function PdfAnnotations() {
  const { highlights, notes, activeDocId, currentPage, setCurrentPage, removeHighlight, addNote, updateNote, removeNote } = usePdfStore();
  const sendMessage = useAppStore((s) => s.sendMessage);
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const docHighlights = activeDocId ? highlights.filter((h) => h.docId === activeDocId) : [];
  const docNotes = activeDocId ? notes.filter((n) => n.docId === activeDocId) : [];

  const handleAddNote = () => {
    if (!newNote.trim() || !activeDocId) return;
    addNote({ docId: activeDocId, page: currentPage, text: newNote.trim() });
    setNewNote("");
  };

  const startEdit = (id: string, text: string) => {
    setEditingId(id);
    setEditText(text);
  };

  const saveEdit = (id: string) => {
    updateNote(id, editText);
    setEditingId(null);
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Highlights section */}
      <div className="px-2 pt-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1 mb-1 flex items-center gap-1">
          <Highlighter size={10} /> Highlights ({docHighlights.length})
        </h4>
        {docHighlights.length === 0 ? (
          <p className="text-[10px] text-gray-400 px-1 py-2">Select text and choose a color to highlight</p>
        ) : (
          <div className="space-y-1">
            {docHighlights.map((h) => (
              <div key={h.id} className="group rounded-md px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-start gap-1.5">
                  <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: h.color }} />
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 flex-1 line-clamp-2">{h.text}</p>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <button onClick={() => setCurrentPage(h.page)} className="text-[10px] text-gray-400 hover:text-primary-500">
                    Page {h.page}
                  </button>
                  <button onClick={() => sendMessage(`Explain this highlighted text:\n\n> ${h.text}`)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400">
                    <MessageSquare size={10} />
                  </button>
                  <button onClick={() => removeHighlight(h.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400">
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-gray-200 dark:bg-gray-700 mx-2 my-2" />

      {/* Notes section */}
      <div className="px-2 flex-1">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1 mb-1 flex items-center gap-1">
          <StickyNote size={10} /> Notes ({docNotes.length})
        </h4>
        <div className="space-y-1.5">
          {docNotes.map((n) => (
            <div key={n.id} className="group rounded-md px-2 py-1.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30">
              {editingId === n.id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full text-[11px] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded p-1 resize-none"
                    rows={2}
                    autoFocus
                  />
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => saveEdit(n.id)} className="text-[10px] text-primary-500">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-[10px] text-gray-400">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-gray-700 dark:text-gray-300 cursor-pointer" onClick={() => startEdit(n.id, n.text)}>
                    {n.text}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <button onClick={() => setCurrentPage(n.page)} className="text-[10px] text-gray-400 hover:text-primary-500">
                      Page {n.page}
                    </button>
                    <button onClick={() => removeNote(n.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add note */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex gap-1">
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
            placeholder={`Add note to page ${currentPage}...`}
            className="flex-1 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5"
          />
          <button onClick={handleAddNote} disabled={!newNote.trim()} className="p-1.5 rounded bg-primary-500 text-white disabled:opacity-30">
            <Plus size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
