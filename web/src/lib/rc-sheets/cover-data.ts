import type { DesignKind, Exposure, ProjectDesignData } from '../model/design-data';
import { DESIGN_KINDS } from '../model/design-data';
import { specifiedCoverMm } from '../codes/cirsoc201/cover';
import { BEAM_BAR_RANGE, COLUMN_BAR_RANGE, inRange } from './types';

export function minimumCover(kind: DesignKind, exposure: Exposure, largestBarMm: number, o: { stirrupMm?: number; control?: boolean } = {}): number {
  return specifiedCoverMm({ element: kind, exposure, dbMm: largestBarMm, ...o }) / 1000;
}

export const minimumCoverFor = (d: ProjectDesignData, kind: DesignKind): number =>
  minimumCover(kind, d.exposure[kind], largestBar(d, kind), { stirrupMm: d.stirrupDiaMm, control: d.executionControl !== false });

export function largestBar(d: ProjectDesignData, kind: DesignKind): number {
  if (kind === 'wall') return d.wallBarDiaMm;
  if (kind === 'slab') return Math.max(...d.slabDiametersMm);
  const range = kind === 'beam' ? BEAM_BAR_RANGE : kind === 'column' ? COLUMN_BAR_RANGE : null;
  const own = range ? d.longDiametersMm.filter((x) => inRange(x, range)) : d.longDiametersMm;
  return Math.max(0, ...(own.length ? own : d.longDiametersMm));
}

export function coversUnderMinimum(d: ProjectDesignData): Array<{ kind: DesignKind; cover: number; minimum: number }> {
  return DESIGN_KINDS.map((kind) => ({ kind, cover: d.covers[kind], minimum: minimumCoverFor(d, kind) }))
    .filter((x) => x.cover < x.minimum - 1e-9);
}

export function withCirsocCovers(d: ProjectDesignData): ProjectDesignData {
  const covers = { ...d.covers };
  for (const k of DESIGN_KINDS) covers[k] = Math.ceil(minimumCoverFor(d, k) * 200 - 1e-9) / 200;
  return { ...d, covers };
}
