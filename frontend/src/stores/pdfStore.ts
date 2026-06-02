import { create } from "zustand";

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  file: File;
  pageCount: number;
  size: number;
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

  addDocument: (doc) => {
    set((s) => ({
      documents: [...s.documents, doc],
      activeDocId: doc.id,
      currentPage: 1,
      workspaceOpen: true,
    }));
  },

  removeDocument: (id) => {
    set((s) => {
      const docs = s.documents.filter((d) => d.id !== id);
      // Revoke URL
      const removed = s.documents.find((d) => d.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return {
        documents: docs,
        activeDocId: s.activeDocId === id ? (docs[0]?.id || null) : s.activeDocId,
        workspaceOpen: docs.length > 0,
      };
    });
  },

  setActiveDoc: (id) => set({ activeDocId: id, currentPage: 1 }),
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
}));
