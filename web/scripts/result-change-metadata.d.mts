import type { Plugin } from 'vite';
import type { ResultChangeRegistry } from '../src/lib/provenance/registry';

export function readProfileResultChanges(proPlatesUnified: boolean): ResultChangeRegistry;
export function packResultChangeNotices(registry: ResultChangeRegistry): { shipped: ResultChangeRegistry; packed: string };
export function resultChangeMetadataPlugin(proPlatesUnified?: () => boolean): Plugin;
