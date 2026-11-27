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
  const axial = pieceDiagram(o.piece, o.forces, 'axial');
  const hasCases = axial?.[0]?.envelopeCase !== undefined;
  const header = ['piece', 'result', 'force', 'unit', 's_m', 'element', 'value'];
  if (hasCases) header.push('envelopeCase');
  lines.push(header.join(sep));
  for (const kind of PIECE_KINDS) {
    const stations = kind === 'axial' ? axial : pieceDiagram(o.piece, o.forces, kind);
    for (const p of stations ?? []) {
      const row = [o.name, o.source, LABEL[kind], PIECE_UNIT[kind], p.s.toFixed(4), String(p.elementId), p.value.toPrecision(8)];
      if (hasCases) row.push(String(p.envelopeCase ?? ''));
      lines.push(row.join(sep));
    }
  }
  return lines.join('\n') + '\n';
}
