interface ImportMetaEnv {
  /** Адрес бэкенда, например http://127.0.0.1:8000 */
  readonly WXT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
