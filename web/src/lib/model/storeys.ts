import type { Level } from './grid';

/**
 * A storey: what goes from one level to the next. Its plan holds its columns and walls, and the
 * beams and slabs of its ceiling; a template laid on its level is that plan. The top level has no
 * ceiling: what is drawn there sits on it.
 */
export type Storey = { floor: Level | null; ceiling: Level | null; lowest: boolean };

const EPS = 1e-6;

export function storeyAt(levels: readonly Level[], z: number): Storey {
  const sorted = [...levels].sort((a, b) => a.z - b.z);
  return {
    floor: sorted.find((l) => Math.abs(l.z - z) < EPS) ?? null,
    ceiling: sorted.find((l) => l.z > z + EPS) ?? null,
    lowest: !sorted.some((l) => l.z < z - EPS),
  };
}

/** Where a storey's beams and slabs go: its ceiling, or the level itself on the top one. */
export const ceilingZ = (levels: readonly Level[], z: number): number => storeyAt(levels, z).ceiling?.z ?? z;

const elevation = (z: number) => `${z < 0 ? '−' : '+'}${Math.abs(z).toFixed(2)}`;

/** «PB (+0.00 → +3.00 m)», or «Techo (+6.00 m)» on the top level. */
export function storeyLabel(levels: readonly Level[], l: Level): string {
  const c = storeyAt(levels, l.z).ceiling;
  return c ? `${l.name} (${elevation(l.z)} → ${elevation(c.z)} m)` : `${l.name} (${elevation(l.z)} m)`;
}
