import type { Plugin } from 'vite';
import type { ResultChangeRegistry } from '../src/lib/provenance/registry';

export function packResultChangeNotices(registry: ResultChangeRegistry): { shipped: ResultChangeRegistry; packed: string };
export function resultChangeMetadataPlugin(): Plugin;
