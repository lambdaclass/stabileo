import type { Plugin } from 'vite';

export function proPlatesSource(enabled: () => boolean): { read(path: string): string; plugin: Plugin };
export function readProPlatesProfile(enabled: boolean): {
  overrides: Map<string, string>;
  unavailable: Set<string>;
  restored: Set<string>;
};
