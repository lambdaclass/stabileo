export type RiserFrame = { t: number; step: number; x: number[]; z: number[]; m: number[]; v: number[] };
export type RiserRun = {
  params: { pull: number; lift: number; friction: number };
  reference_x: number[];
  element_x: number[];
  frames: RiserFrame[];
  summary: { fairlead: [number, number]; anchor_tension: number; touchdown: number; moment_min: number };
};
export type CantileverRun = { reference_z: number[]; frames: { t: number; x: number[]; z: number[]; m: number[] }[] };

const NODES = 269;
const ELEMENTS = 134;
const finite = (a: unknown, n: number) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);

export function decodeRiser(value: unknown): RiserRun {
  const r = value as RiserRun;
  if (!r || !finite(r.reference_x, NODES) || !finite(r.element_x, ELEMENTS) || !Array.isArray(r.frames) || r.frames.length < 2
    || !r.frames.every(f => Number.isFinite(f.t) && [1, 2, 3].includes(f.step) && finite(f.x, NODES) && finite(f.z, NODES) && finite(f.m, ELEMENTS) && finite(f.v, ELEMENTS))
    || !r.summary || !Number.isFinite(r.summary.touchdown) || !Number.isFinite(r.summary.moment_min)) throw new Error('Invalid riser result');
  return r;
}

/** Nodal values of a field given per three-node element, averaging the two elements at shared corners. */
export function nodal(perElement: number[]): number[] {
  const out = new Array(2 * perElement.length + 1).fill(0);
  perElement.forEach((v, e) => {
    out[2 * e + 1] = v;
    out[2 * e] += e === 0 ? v : v / 2;
    out[2 * e + 2] += e === perElement.length - 1 ? v : v / 2;
  });
  return out;
}

export function parseReference(csv: string): { x: number; m: number; v: number }[] {
  return csv.trim().split('\n').slice(1).map(l => {
    const [x, m, v] = l.split(',').map(Number);
    return { x, m, v };
  });
}
