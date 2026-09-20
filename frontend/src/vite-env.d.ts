/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the API. Leave unset for same-origin (Docker/nginx or the
   * Vite dev proxy); set it when the frontend and API are deployed to
   * different hosts, e.g. https://your-api.onrender.com
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
