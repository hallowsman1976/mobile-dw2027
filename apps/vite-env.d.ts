/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIFF_ID?: string;
  readonly VITE_GAS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
