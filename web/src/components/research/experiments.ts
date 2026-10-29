/**
 * The experiments that run on this site, and the ones being built. The gallery and the
 * experiment pages read this; papers.json (the catalogue) is joined to it by `paperId`.
 */
export type Experiment = {
  paperId: string;
  path: string;
  name: string;
  hook: string;
  /** web/public/<thumbnail>, rendered from our own run by scripts/research-thumbs.mjs and committed. */
  thumbnail: string;
  /** What the thumbnail shows (its alt text). */
  thumbnailAlt: string;
  /** The page's query that sets up the thumbnail's view (step, mesh, view, deformed). */
  thumbnailQuery: string;
  code: string;
  /** The page embeds the Stabileo editor with the experiment's model (opened by `#edit`). */
  editor?: boolean;
};

export const EXPERIMENTS: Experiment[] = [
  {
    paperId: 'shauer-2025',
    path: '/research/fracture/shauer-2025',
    name: 'Phase-field fracture of a notched plate',
    hook: 'Pull a notched plate apart and watch an AT2 phase-field crack form and run, solved in your browser and checked step by step against the author’s code.',
    thumbnail: 'research-thumbs/shauer-2025.webp',
    thumbnailAlt: 'Damage field from our run of the experiment',
    thumbnailQuery: 'step=70&mesh=1&view=plate&deformed=1&deform=4&broken=show',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/fracture/shauer-2025',
  },
  {
    paperId: 'grossman-2026',
    path: '/research/metamaterials/grossman-2026',
    name: 'Auxetic spring networks',
    hook: 'Shake the nodes of a triangular lattice of springs until it widens when pulled: a truss network solved in your browser, against the paper’s published numbers.',
    thumbnail: 'research-thumbs/grossman-2026.webp',
    thumbnailAlt: 'The auxetic spring network (eta = 0.5) from our run, bars coloured by axial force on the deformed strip',
    thumbnailQuery: 'eta=0.5&thumb',
    editor: true,
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/metamaterials/grossman-2026',
  },
];

/** The "Coming next" row; set false to hide it. */
export const SHOW_COMING_NEXT = true;

export type Upcoming = { name: string; field: string; note: string };

export const COMING_NEXT: Upcoming[] = [
  { name: 'Topology optimization of an MBB beam', field: 'optimization', note: 'SIMP with density filter and optimality criteria, against the 88-line reference results' },
];
