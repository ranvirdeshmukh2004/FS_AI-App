import { create } from "zustand";

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  file: File;
  pageCount: number;
  size: number;
}

export interface PdfHighlight {
  id: string;
  docId: string;
  page: number;
  text: string;
  color: string;
  createdAt: string;
}

export interface PdfNote {
  id: string;
  docId: string;
  page: number;
  text: string;
  createdAt: string;
}

export interface TocItem {
  title: string;
  pageNumber: number;
  level: number;
  children?: TocItem[];
}

export interface SearchResult {
  page: number;
  index: number;
}

interface PdfState {
  documents: PdfDocument[];
  activeDocId: string | null;
  currentPage: number;
  scale: number;
  showThumbnails: boolean;
  workspaceOpen: boolean;
  workspaceWidth: number;
  snipping: boolean;
  selectedText: string;

  // Phase 2: Search
  searchQuery: string;
  searchResults: SearchResult[];
  searchIndex: number;
  searchOpen: boolean;

  // Phase 2: TOC
  tocItems: TocItem[];
  tocOpen: boolean;

  // Phase 2: Highlights & Notes
  highlights: PdfHighlight[];
  notes: PdfNote[];

  // Phase 2: Sidebar mode
  sidebarMode: "thumbnails" | "toc" | "annotations";

  // Actions
  addDocument: (doc: PdfDocument) => void;
  removeDocument: (id: string) => void;
  setActiveDoc: (id: string) => void;
  setCurrentPage: (page: number) => void;
  setScale: (scale: number) => void;
  setShowThumbnails: (show: boolean) => void;
  setWorkspaceOpen: (open: boolean) => void;
  setWorkspaceWidth: (width: number) => void;
  setSnipping: (snipping: boolean) => void;
  setSelectedText: (text: string) => void;
  getActiveDoc: () => PdfDocument | undefined;

  // Search
  setSearchQuery: (q: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setSearchIndex: (i: number) => void;
  setSearchOpen: (open: boolean) => void;
  nextSearchResult: () => void;
  prevSearchResult: () => void;

  // TOC
  setTocItems: (items: TocItem[]) => void;
  setTocOpen: (open: boolean) => void;

  // Sidebar mode
  setSidebarMode: (mode: "thumbnails" | "toc" | "annotations") => void;

  // Highlights
  addHighlight: (h: Omit<PdfHighlight, "id" | "createdAt">) => void;
  removeHighlight: (id: string) => void;
  getDocHighlights: (docId: string) => PdfHighlight[];

  // Notes
  addNote: (n: Omit<PdfNote, "id" | "createdAt">) => void;
  updateNote: (id: string, text: string) => void;
  removeNote: (id: string) => void;
  getDocNotes: (docId: string) => PdfNote[];

  // Persistence
  saveState: () => void;
  loadState: () => void;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export const usePdfStore = create<PdfState>((set, get) => ({
  documents: [],
  activeDocId: null,
  currentPage: 1,
  scale: 1.0,
  showThumbnails: true,
  workspaceOpen: false,
  workspaceWidth: 550,
  snipping: false,
  selectedText: "",
  searchQuery: "",
  searchResults: [],
  searchIndex: -1,
  searchOpen: false,
  tocItems: [],
  tocOpen: false,
  highlights: JSON.parse(localStorage.getItem("pdf_highlights") || "[]"),
  notes: JSON.parse(localStorage.getItem("pdf_notes") || "[]"),
  sidebarMode: "thumbnails",

  addDocument: (doc) => {
    set((s) => ({
      documents: [...s.documents, doc],
      activeDocId: doc.id,
      currentPage: 1,
      workspaceOpen: true,
      searchQuery: "",
      searchResults: [],
      searchIndex: -1,
    }));
  },

  removeDocument: (id) => {
    set((s) => {
      const docs = s.documents.filter((d) => d.id !== id);
      const removed = s.documents.find((d) => d.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return {
        documents: docs,
        activeDocId: s.activeDocId === id ? (docs[0]?.id || null) : s.activeDocId,
        workspaceOpen: docs.length > 0,
      };
    });
  },

  setActiveDoc: (id) => set({ activeDocId: id, currentPage: 1, searchQuery: "", searchResults: [], searchIndex: -1 }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setScale: (scale) => set({ scale: Math.max(0.25, Math.min(3, scale)) }),
  setShowThumbnails: (show) => set({ showThumbnails: show }),
  setWorkspaceOpen: (open) => set({ workspaceOpen: open }),
  setWorkspaceWidth: (width) => set({ workspaceWidth: Math.max(350, Math.min(900, width)) }),
  setSnipping: (snipping) => set({ snipping }),
  setSelectedText: (text) => set({ selectedText: text }),
  getActiveDoc: () => {
    const s = get();
    return s.documents.find((d) => d.id === s.activeDocId);
  },

  // Search
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (results) => set({ searchResults: results, searchIndex: results.length > 0 ? 0 : -1 }),
  setSearchIndex: (i) => set({ searchIndex: i }),
  setSearchOpen: (open) => set({ searchOpen: open, searchQuery: open ? get().searchQuery : "", searchResults: open ? get().searchResults : [], searchIndex: -1 }),
  nextSearchResult: () => {
    const { searchResults, searchIndex, setCurrentPage } = get();
    if (searchResults.length === 0) return;
    const next = (searchIndex + 1) % searchResults.length;
    set({ searchIndex: next });
    setCurrentPage(searchResults[next].page);
  },
  prevSearchResult: () => {
    const { searchResults, searchIndex, setCurrentPage } = get();
    if (searchResults.length === 0) return;
    const prev = (searchIndex - 1 + searchResults.length) % searchResults.length;
    set({ searchIndex: prev });
    setCurrentPage(searchResults[prev].page);
  },

  // TOC
  setTocItems: (items) => set({ tocItems: items }),
  setTocOpen: (open) => set({ tocOpen: open }),

  // Sidebar mode
  setSidebarMode: (mode) => set({ sidebarMode: mode, showThumbnails: true }),

  // Highlights
  addHighlight: (h) => {
    const highlight: PdfHighlight = { ...h, id: genId(), createdAt: new Date().toISOString() };
    set((s) => {
      const highlights = [...s.highlights, highlight];
      localStorage.setItem("pdf_highlights", JSON.stringify(highlights));
      return { highlights };
    });
  },
  removeHighlight: (id) => {
    set((s) => {
      const highlights = s.highlights.filter((h) => h.id !== id);
      localStorage.setItem("pdf_highlights", JSON.stringify(highlights));
      return { highlights };
    });
  },
  getDocHighlights: (docId) => get().highlights.filter((h) => h.docId === docId),

  // Notes
  addNote: (n) => {
    const note: PdfNote = { ...n, id: genId(), createdAt: new Date().toISOString() };
    set((s) => {
      const notes = [...s.notes, note];
      localStorage.setItem("pdf_notes", JSON.stringify(notes));
      return { notes };
    });
  },
  updateNote: (id, text) => {
    set((s) => {
      const notes = s.notes.map((n) => n.id === id ? { ...n, text } : n);
      localStorage.setItem("pdf_notes", JSON.stringify(notes));
      return { notes };
    });
  },
  removeNote: (id) => {
    set((s) => {
      const notes = s.notes.filter((n) => n.id !== id);
      localStorage.setItem("pdf_notes", JSON.stringify(notes));
      return { notes };
    });
  },
  getDocNotes: (docId) => get().notes.filter((n) => n.docId === docId),

  // Persistence
  saveState: () => {
    const s = get();
    localStorage.setItem("pdf_workspace", JSON.stringify({
      workspaceWidth: s.workspaceWidth,
      scale: s.scale,
      sidebarMode: s.sidebarMode,
      showThumbnails: s.showThumbnails,
    }));
  },
  loadState: () => {
    try {
      const saved = JSON.parse(localStorage.getItem("pdf_workspace") || "{}");
      if (saved.workspaceWidth) set({ workspaceWidth: saved.workspaceWidth });
      if (saved.scale) set({ scale: saved.scale });
      if (saved.sidebarMode) set({ sidebarMode: saved.sidebarMode });
      if (saved.showThumbnails !== undefined) set({ showThumbnails: saved.showThumbnails });
    } catch { /* ignore */ }
  },
}));
