import type { ResultChange, ResultChangeRegistry } from '../../src/lib/provenance/registry';

export const DIR: string;
export const NUMBERED: string;
export const LEGACY: string;
export const ORDER_FILE: string;
export const TEXT_FIELDS: string[];
export function isFragmentPath(path: string): boolean;
export function assemble(input: {
  numbered: { schema: number; changes: ResultChange[] };
  fragments: Map<string, Omit<ResultChange, 'resultsVersion'>>;
  landings: string[][];
}): ResultChangeRegistry;
export function landingsAt(git: (...args: string[]) => string, rev: string): string[][];
export function readRegistry(root?: string): ResultChangeRegistry;
export function readRegistryAt(rev: string, root?: string): ResultChangeRegistry | null;
export function writeOrderFile(root?: string): string[][];
export interface RegistrySources {
  schema: number;
  numbered: ResultChange[];
  unnumbered: (Omit<ResultChange, 'resultsVersion'> & { file?: string })[];
}
export function readSourcesAt(rev: string, root?: string): RegistrySources | null;
export function compareSources(base: Partial<RegistrySources> | null, head: Partial<RegistrySources> | null): { problems: string[]; added: string[] };
