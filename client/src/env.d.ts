interface ImportMetaEnv {
  /** "false" switches from the in-browser mock to the real /api/v1 backend. */
  readonly VITE_USE_MOCK_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
