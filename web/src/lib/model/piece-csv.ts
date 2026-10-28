/**
 * A piece's internal forces as CSV (`curve-entity.ts`): one row per station, for every force,
 * with the piece, the segment, the coordinate along the piece, the result set and the units. The
 * header says what the values are read in and where they come from.
 *
 * Pure.
 */
import { pieceDiagram, type Piece } from './curve-entity';
import type { Diagram3DKind } from '../engine/diagrams-3d';
import type { ElementForces3D } from '../engine/types-3d';

export const PIECE_KINDS: readonly Diagram3DKind[] = ['axial', 'shearY', 'shearZ', 'torsion', 'momentY', 'momentZ'];
export const PIECE_UNIT: Record<Diagram3DKind, string> = { axial: 'kN', shearY: 'kN', shearZ: 'kN', torsion: 'kN·m', momentY: 'kN·m', momentZ: 'kN·m' };
const LABEL: Record<Diagram3DKind, string> = { axial: 'N', shearY: 'Vy', shearZ: 'Vz', torsion: 'T', momentY: 'My', momentZ: 'Mz' };

export function pieceCsv(o: {
  piece: Piece; name: string; source: string; forces: ReadonlyMap<number, ElementForces3D>;
  header: string[]; sep?: string;
}): string {
  const sep = o.sep ?? ',';
  const lines = o.header.map((h) => `# ${h}`);
  lines.push(['piece', 'result', 'force', 'unit', 's_m', 'element', 'value'].join(sep));
  for (const k of PIECE_KINDS) {
    const st = pieceDiagram(o.piece, o.forces, k);
    if (!st) continue;
    for (const p of st) lines.push([o.name, o.source, LABEL[k], PIECE_UNIT[k], p.s.toFixed(4), String(p.elementId), p.value.toPrecision(8)].join(sep));
  }
  return lines.join('\n') + '\n';
}
