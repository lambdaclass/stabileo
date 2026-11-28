import type { ResultChange } from '../../src/lib/provenance/registry';

export const REGISTRY_LOCALES: readonly ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'ru'];
export function resultChangeLocaleProblems(entry: Pick<ResultChange, 'id' | 'title' | 'explanation'>): string[];
