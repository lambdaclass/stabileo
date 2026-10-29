export const RESEARCH_META: Record<string, { title: string; description: string }> = {
  '/research': {
    title: 'Stabileo Research — computational mechanics you can run',
    description:
      'Explore computational mechanics research reproduced in Stabileo, with browser experiments and comparisons against reference code and published results.',
  },
  '/research/fracture/shauer-2025': {
    title: 'Phase-field fracture of a notched plate (Shauer 2025) — Stabileo Research',
    description:
      'AT2 phase-field fracture run in the browser by a Rust re-implementation validated step by step against the author’s Python reference code.',
  },
  '/research/metamaterials/grossman-2026': {
    title: 'Auxetic spring networks (Grossman & Boudaoud 2026) — Stabileo Research',
    description:
      'Explore auxetic spring networks in your browser: disordered lattices, re-entrant honeycombs and ordered lattices compared with published values.',
  },
};
