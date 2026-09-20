import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // The PDF and syntax-highlighting libraries dominate the bundle and are
    // not needed to render the first chat message. Splitting them keeps the
    // initial download small, which matters on a free host with no CDN in
    // front of it.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "zustand"],
          "vendor-pdf": ["react-pdf", "pdfjs-dist"],
          "vendor-markdown": ["react-markdown", "react-syntax-highlighter"],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
