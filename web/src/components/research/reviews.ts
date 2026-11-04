import catalog from '../../../../research/papers.json';
import tools from '../../../../research/tools/batches/VALIDATION.json';

/** Only completed, numbered rounds count; earlier implementation notes remain in the catalogue. */
export function reviewCount(id: string): number {
  const entry = catalog.papers.find(p => p.id === id) ?? tools.batches.find(b => b.id === id);
  return new Set((entry?.reviews ?? []).flatMap(r => 'round' in r ? [r.round] : [])).size;
}
