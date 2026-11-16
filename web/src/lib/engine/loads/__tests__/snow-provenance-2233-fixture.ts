import type { LoadCombinationSpec } from '../../../codes/cirsoc101/combinations';

export const snowCases = [
  { id: 1, type: 'D', name: 'D' },
  { id: 2, type: 'L', name: 'L' },
  { id: 3, type: 'H', name: 'H' },
  { id: 4, type: 'S', name: 'physical S' },
  { id: 5, type: 'S', name: 'pf', snowBasis: 'flatRoof' as const },
];

export function legacyOmittedE(factor = 0.7): LoadCombinationSpec {
  return {
    id: '5-Hadd-noE', basic: 5, label: `1.2 D + L + ${factor} S + 1.6 H`, refs: [],
    terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'L', factor: 1 }, { symbol: 'S', factor }, { symbol: 'H', factor: 1.6 }],
    notes: [{ key: 'loads.cirsoc101.note.snowAsFlatRoof' }, { key: 'loads.cirsoc101.note.notActing', params: { loads: 'E' } }],
  };
}

export function flatSpec(): LoadCombinationSpec {
  return {
    id: '2-S', basic: 2, label: '1.2 D + 1.6 L + 0.5 S', refs: [], notes: [],
    terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'L', factor: 1.6 }, { symbol: 'S', factor: 0.5, snowBasis: 'flatRoof' }],
  };
}
