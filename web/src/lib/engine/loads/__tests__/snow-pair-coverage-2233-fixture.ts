import type { LoadCombinationSpec } from '../../../codes/cirsoc101/combinations';
import { flatSpec, legacyOmittedE, snowCases } from './snow-provenance-2233-fixture';

export const partialSnowPair = [
  ...snowCases.map(c => c.type === 'S' ? { ...c, alternatives: 'A' } : c),
  { id: 6, type: 'S', name: 'pf B', alternatives: 'B', snowBasis: 'flatRoof' as const },
  { id: 7, type: 'E', name: 'E' },
];

export const completeSnowPair = [
  ...partialSnowPair,
  { id: 8, type: 'S', name: 'physical B', alternatives: 'B' },
];

export function physicalSpecs(): LoadCombinationSpec[] {
  const omitted = { ...legacyOmittedE(), notes: [] };
  return [
    { id: 'principal-S', label: 'S', refs: [], notes: [], terms: [{ symbol: 'S', factor: 1 }] },
    omitted,
    { ...omitted, id: 'physical-seismic', label: `${omitted.label} + E`, terms: [...omitted.terms, { symbol: 'E', factor: 1 }] },
  ];
}

export function pairedSpecs(): LoadCombinationSpec[] {
  return [flatSpec(), ...physicalSpecs()];
}
