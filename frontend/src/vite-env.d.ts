/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected by vite.config.ts `define` — see that file for how each is
// computed. Only ever read from the dev-only motion preview panel.
declare const __BUILD_ID__: string
declare const __BUILD_TIME__: string
declare const __COMMIT_HASH__: string
