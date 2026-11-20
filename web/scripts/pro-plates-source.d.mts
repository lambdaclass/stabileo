import type { Plugin } from 'vite';

export function proPlatesSource(enabled: () => boolean): { read(path: string): string; plugin: Plugin };
