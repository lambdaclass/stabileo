export type ShapeFrame = {
  theta: number; delta: number; y_mid: number; y_third: number; y_two_thirds: number;
  max_curvature: number; stable: boolean; ux: number[]; uz: number[]; curvature: number[];
};
export type ShapeRun = {
  elements: number; load: number; corner: [number, number]; corners: number[]; snaps: number[];
  lost: { theta: number; delta: number } | null; frames: ShapeFrame[];
};

const finite = (a: unknown, n: number) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);

export function decodeRun(value: unknown): ShapeRun {
  const r = value as ShapeRun;
  const nodes = (r?.elements ?? 0) + 1;
  if (!r || !Number.isInteger(r.elements) || r.elements < 2 || !Array.isArray(r.frames) || r.frames.length < 1
    || !r.frames.every(f => [f.theta, f.delta, f.y_mid, f.max_curvature].every(Number.isFinite) && typeof f.stable === 'boolean'
      && finite(f.ux, nodes) && finite(f.uz, nodes) && finite(f.curvature, nodes))
    || !Array.isArray(r.corners) || !Array.isArray(r.snaps)) throw new Error('Invalid shape-control result');
  return { ...r, lost: r.lost ?? null };
}

export const endAngles = (f: Pick<ShapeFrame, 'theta' | 'delta'>): [number, number] => [f.delta + f.theta, f.delta - f.theta];
