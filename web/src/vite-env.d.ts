/// <reference types="vite/client" />

/** The public pages' share of the dictionaries (vite.config.ts, `publicI18nPlugin`). */
declare module 'virtual:public-i18n' {
  export const en: Record<string, string>;
  export const es: Record<string, string>;
  export const pt: Record<string, string>;
  export const de: Record<string, string>;
  export const fr: Record<string, string>;
  export const tr: Record<string, string>;
}

/** SHA-256 of the WASM binaries this build ships, for research citations (scripts/research-build.ts). */
declare module 'virtual:research-build' {
  export const engineWasmSha256: string | null;
  export const researchWasmSha256: Record<string, string>;
}
