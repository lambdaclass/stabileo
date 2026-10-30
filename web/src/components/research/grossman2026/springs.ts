export type LatticeKind =
  | { kind: 'triangular'; phi: number; psi: number }
  | { kind: 'honeycomb'; l: number; k_radial: number }
  | { kind: 'square'; diagonals: boolean };

export type NetworkSpec = {
  lattice: LatticeKind;
  eta: number;
  keep: number;
  seed: number;
  spring_law: 'hookean' | 'equal_weight';
  k: number;
  prestress: number;
};

export type StripSpec = { network: NetworkSpec; width: number; height: number; theta: number; clamp_band: number; strain: number };
export type PeriodicSpec = { network: NetworkSpec; n1: number; n2: number; strain: [number, number, number] };

export type Isotropic = { bulk: number; shear: number; poisson: number; young: number };

export type StripResult = {
  nodes: [number, number][];
  bonds: [number, number][];
  held: boolean[];
  prescribed: [number, number][];
  displacement: [number, number][];
  force: number[];
  prestress_force: number[];
  stiffness: number[];
  rest: number[];
  coordination: number;
  gauge: [number, number];
  poisson: number | null;
  relaxation: { iterations: number; residual: number; energy: number } | null;
};

export type PeriodicResult = {
  coordination: number;
  c: number[][];
  isotropic: Isotropic;
  isotropic_affine: Isotropic;
  uniaxial_x: [number, number] | null;
  uniaxial_y: [number, number] | null;
  anisotropy: number;
  nonaffinity_shear: number;
};

type Glue = {
  default: (opts: { module_or_path: string }) => Promise<unknown>;
  springs_strip: (spec: string) => string;
  springs_periodic: (spec: string) => string;
};

const BASE = `${import.meta.env.BASE_URL}research-wasm/grossman-2026/`;
let loading: Promise<Glue> | null = null;

export function loadSprings(): Promise<Glue> {
  if (!loading) {
    loading = (async () => {
      const g = (await import(/* @vite-ignore */ `${BASE}springs.js`)) as Glue;
      await g.default({ module_or_path: `${BASE}springs_bg.wasm` });
      return g;
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

export function solveStrip(g: Glue, spec: StripSpec): StripResult {
  return JSON.parse(g.springs_strip(JSON.stringify(spec))) as StripResult;
}

export function solvePeriodic(g: Glue, spec: PeriodicSpec): PeriodicResult {
  return JSON.parse(g.springs_periodic(JSON.stringify(spec))) as PeriodicResult;
}
