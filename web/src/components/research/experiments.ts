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
  { paperId: 'lee-frame-1968', path: '/research/benchmarks/lee-frame-1968', name: 'Lee frame (1968)', hook: 'First version · 0 reviews', thumbnail: 'research-thumbs/lee-frame-1968.svg', thumbnailAlt: 'Lee frame from the production engine', thumbnailQuery: '', code: 'https://github.com/lambdaclass/stabileo/tree/main/research/benchmarks/lee-frame-1968' },
  {
    paperId: 'ferrari-2025',
    path: '/research/stability/ferrari-sigmund-2025',
    name: 'Roorda frame: reproduction in progress',
    hook: 'Production buckling and an imperfect nonlinear path. The Koiter coefficient comparison is unfinished.',
    thumbnail: 'research-thumbs/ferrari-sigmund-2025.svg',
    thumbnailAlt: 'Geometry schematic: two perpendicular one-metre members of the Roorda frame, pinned at their outer ends',
    thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/stability/ferrari-sigmund-2025',
  },
  { paperId: 'andreassen-2011', path: '/research/optimization/andreassen-2011', name: 'Topology optimization of an MBB beam', hook: 'Redistribute material using SIMP and compare both filters against the authors’ code.', thumbnail: 'research-thumbs/andreassen-2011.svg', thumbnailAlt: 'Material density of the optimized MBB beam', thumbnailQuery: '', code: 'https://github.com/lambdaclass/stabileo/tree/main/research/optimization/andreassen-2011' },
  {
    paperId: 'pastrana-2026',
    path: '/research/form-finding/pastrana-2026',
    name: 'Four cables, one equilibrium',
    hook: 'Forward force density method on the paper’s four-bar topology.',
    thumbnail: 'research-thumbs/pastrana-2026.svg',
    thumbnailAlt: 'Projection of our four-cable equilibrium result',
    thumbnailQuery: '',
    editor: true,
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/form-finding/pastrana-2026',
  },
  {
    paperId: 'fairclough-2026',
    path: '/research/optimisation/fairclough-2026',
    name: 'Five-node gridshell', hook: 'Table 1: one fixed square under self-weight',
    thumbnail: 'research-thumbs/fairclough-2026.svg',
    thumbnailAlt: 'Four curved members from the Stabileo run', thumbnailQuery: '', editor: true,
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/optimisation/fairclough-2026',
  },
  {
    paperId: 'mattiasson-elastica', path: '/research/benchmarks/mattiasson-elastica',
    name: 'Mattiasson: cantilever elastica',
    hook: 'Trace the production corotational load path and inspect provisional reference comparisons, including failures.',
    thumbnail: 'research-thumbs/mattiasson-elastica.svg', thumbnailAlt: 'Geometry schematic of a cantilever under a tip load', thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/engine/tests/benchmarks',
  },
  {
    paperId: 'shell-obstacle-course', path: '/research/benchmarks/shell-obstacle-course',
    name: 'Shell obstacle course',
    hook: 'Refine the roof, cylinder and hemisphere; inspect live production-engine accuracy, including failures.',
    thumbnail: 'research-thumbs/shell-obstacle-course.svg', thumbnailAlt: 'Geometry schematic of a curved shell benchmark', thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/engine/tests/benchmarks',
  },
  {
    paperId: 'macneal-harder-1985', path: '/research/benchmarks/macneal-harder-1985',
    name: 'MacNeal–Harder: production engine benchmarks',
    hook: 'Run the production engine on shared accuracy cases; inspect every result, including failures.',
    thumbnail: 'research-thumbs/macneal-harder-1985.svg', thumbnailAlt: 'Geometry schematic of the cantilever accuracy benchmark', thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/engine/tests/benchmarks',
  },
  {
    paperId: 'newmark-1959', path: '/research/benchmarks/newmark-1959',
    name: 'Newmark average acceleration', hook: 'One SDOF step response and period elongation. First version · 0 reviews.',
    thumbnail: 'research-thumbs/newmark-1959.svg', thumbnailAlt: 'Production Newmark displacement history', thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/benchmarks/newmark-1959',
  },
  {
    paperId: 'horne-1979', path: '/research/benchmarks/plastic-collapse',
    name: 'Classic plastic collapse', hook: 'First version · 0 reviews',
    thumbnail: 'research-thumbs/plastic-collapse.svg', thumbnailAlt: 'Portal frame from the production solver run', thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/benchmarks/plastic-collapse',
  },
  {
    paperId: 'navier-plate', path: '/research/benchmarks/navier-plate',
    name: 'Navier plate: mesh convergence', hook: 'First version: uniform pressure, DKT and MITC4 against the Fourier series.',
    thumbnail: 'research-thumbs/navier-plate.svg', thumbnailAlt: 'Computed MITC4 displacement contour', thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/benchmarks/navier-plate',
  },
  {
    paperId: 'dadeppo-arch-1975', path: '/research/benchmarks/dadeppo-arch-1975',
    name: 'DaDeppo–Schmidt deep arch', hook: 'First version: the production arc-length solver traces a 215° arch through its limit load.',
    thumbnail: 'research-thumbs/dadeppo-arch-1975.svg', thumbnailAlt: 'Deformed arch from the production solver', thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/benchmarks/dadeppo-arch-1975',
  },
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
  {
    paperId: 'zmyslony-2026',
    path: '/research/mechanics/biggins-2026',
    name: 'Snapping arches by curvature patterning',
    hook: 'Production buckling modes and a shallow-arch equilibrium jump, checked against published thresholds.',
    thumbnail: 'research-thumbs/biggins-2026.webp',
    thumbnailAlt: 'Arch equilibrium',
    thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/mechanics/biggins-2026',
  },
  {
    paperId: 'cqc-1981', path: '/research/benchmarks/cqc-1981',
    name: 'SRSS vs CQC', hook: 'Closely spaced building modes — first version, 0 reviews.',
    thumbnail: 'research-thumbs/cqc-1981.webp', thumbnailAlt: 'Base shear from our SRSS and CQC runs', thumbnailQuery: '',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/benchmarks/cqc-1981',
  },

  {
    paperId: 'riks-1979',
    path: '/research/benchmarks/riks-crisfield',
    name: 'Arc-length snap-through: Riks and Crisfield',
    hook: 'Follow two-bar trusses through their limit points with Stabileo’s production arc-length engine, checked against closed-form equilibrium paths.',
    thumbnail: 'research-thumbs/riks-crisfield.webp',
    thumbnailAlt: 'Two-bar benchmark geometry and computed displacement',
    thumbnailQuery: 'case=von-mises-truss&tab=viewer',
    code: 'https://github.com/lambdaclass/stabileo/tree/main/research/numerical-methods/riks-crisfield',
  },
];

/** The "Coming next" row; set false to hide it. */
export const SHOW_COMING_NEXT = true;

export type Upcoming = { name: string; field: string; note: string };

export const COMING_NEXT: Upcoming[] = [
];
