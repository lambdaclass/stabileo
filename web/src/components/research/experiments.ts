import previews from './preview-config.json';

export const PREVIEWS = previews;
export const previewFor = (id: string) => PREVIEWS.find((p) => p.paperId === id);

/**
 * The experiments that run on this site, and the ones being built. The gallery and the
 * experiment pages read this; papers.json (the catalogue) is joined to it by `paperId`.
 */
export type Experiment = {
  paperId: string;
  path: string;
  name: string;
  hook: string;
  /** web/public/<thumbnail>, captured by scripts/research-previews.ts. */
  thumbnail: string;
  code: string;
};

export const EXPERIMENTS: Experiment[] = [
  {
    paperId: 'shauer-2025',
    path: '/research/fracture/shauer-2025',
    name: 'Phase-field fracture of a notched plate',
    hook: 'Pull a notched plate apart and watch an AT2 phase-field crack form and run, solved in your browser and checked step by step against the author’s code.',
    thumbnail: `${previewFor('shauer-2025')!.path.slice(1)}/thumb.png`,
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/fracture/shauer-2025',
  },
];

/** The "Coming next" row; set false to hide it. */
export const SHOW_COMING_NEXT = true;

export type Upcoming = { name: string; field: string; note: string };

export const COMING_NEXT: Upcoming[] = [
  { name: 'Topology optimization of an MBB beam', field: 'optimization', note: 'SIMP with density filter and optimality criteria, against the 88-line reference results' },
  { name: 'Mechanics of spring networks', field: 'metamaterials', note: 'Truss networks against the paper’s published numbers (no reference code)' },
];
