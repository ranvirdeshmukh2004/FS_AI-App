import { useCallback, useState, useRef } from "react";
import { usePdfStore } from "@/stores/pdfStore";
import { Upload, FileText } from "lucide-react";

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function PdfUpload() {
  const { addDocument } = usePdfStore();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (file.type !== "application/pdf") return;
    const url = URL.createObjectURL(file);
    addDocument({
      id: genId(),
      name: file.name,
      url,
      file,
      pageCount: 0, // Updated when Document loads
      size: file.size,
    });
  }, [addDocument]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(processFile);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(processFile);
    if (inputRef.current) inputRef.current.value = "";
  }, [processFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        dragOver
          ? "border-primary-400 bg-primary-50 dark:bg-primary-900/10"
          : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      <Upload size={28} className="mx-auto mb-2 text-gray-400" />
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Drop PDF here or <span className="text-primary-500 font-medium">click to upload</span>
      </p>
      <p className="text-xs text-gray-400 mt-1">Supports multiple files</p>
    </div>
  );
}

/** Compact button for uploading PDFs from the chat header */
export function PdfUploadButton() {
  const { addDocument, workspaceOpen, setWorkspaceOpen, documents } = usePdfStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (file.type !== "application/pdf") return;
      addDocument({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        name: file.name,
        url: URL.createObjectURL(file),
        file,
        pageCount: 0,
        size: file.size,
      });
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".pdf" multiple onChange={handleFile} className="hidden" />
      {documents.length > 0 && !workspaceOpen ? (
        <button
          onClick={() => setWorkspaceOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
        >
          <FileText size={14} />
          PDF ({documents.length})
        </button>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Upload PDF"
        >
          <FileText size={14} />
          PDF
        </button>
      )}
    </>
  );
}
