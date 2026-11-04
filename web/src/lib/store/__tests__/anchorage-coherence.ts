/**
 * The design's reading of each bar end in a support against the bar the detailing built there.
 *
 * The verifier states, for every row of bars a beam ends in a column, the length available, the
 * length the rule asks and the disposition (`ProvidedRebarResult.supportAnchorage`,
 * `end-support-anchorage.ts`); the detailing records the same three on the bar it lays
 * (`BarPath.anchorage`). One rule set on one geometry gives the same numbers: this reads both and
 * lists where they differ.
 *
 * A bar end is matched to its design member and support by the nearest end node of the members
 * owning it (a span's first and last node), to its row by its layer (`layerId`), and to the
 * verdict of that face, row and diameter. At a support the line continues past, the design leaves
 * the end to the line's laps (`pending`) and the detailing laps or runs it through. A bar the line
 * carried on from the other span (`lap-materialize.ts`) ends beside this span's own bars and is
 * read against their row: a bar at least as large, under the same rule.
 */
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import type { SupportAnchorageVerdict } from '../../engine/design/end-support-anchorage';

export interface CoherenceReport {
  /** Bar ends compared with a verdict. */
  compared: number;
  /** Of them, at a column the line ends at (support `end`). */
  atEnds: number;
  /** Bar ends whose record differs from the design's verdict, or that the design has no verdict for. */
  mismatches: string[];
}

const mm = (v: number) => Math.round(v * 1000);

/** Compare every bar end in a support of the beams in `bars` with the verifier's verdicts. */
export function anchorageCoherence(bars: readonly BarPath[]): CoherenceReport {
  const out: CoherenceReport = { compared: 0, atEnds: 0, mismatches: [] };
  const node = (id: number) => modelStore.nodes.get(id)!;
  for (const b of bars) {
    if (b.role !== 'longitudinal' || !b.anchorage) continue;
    for (const side of ['start', 'end'] as const) {
      const rec = b.anchorage[side];
      if (!rec) continue;
      const p = side === 'start' ? b.segments[0]!.start : b.segments[b.segments.length - 1]!.end;
      // The owners' design members and their end nodes; the end the bar sits nearest to.
      let best: { rep: number; end: 'start' | 'end'; d: number } | null = null;
      for (const id of b.ownerElementIds) {
        const ctx = verificationStore.contextFor(id);
        if (!ctx || ctx.elementType !== 'beam') continue;
        const el = modelStore.elements.get(id)!;
        const ends = ctx.span ? { start: ctx.span.start, end: ctx.span.end } : { start: el.nodeI, end: el.nodeJ };
        const rep = ctx.span?.representative ?? id;
        for (const end of ['start', 'end'] as const) {
          const n = node(ends[end]);
          const d = Math.hypot(n.x - p.x, n.y - p.y);
          if (!best || d < best.d - 1e-9) best = { rep, end, d };
        }
      }
      if (!best) continue;
      const verdicts: SupportAnchorageVerdict[] = verificationStore.providedFor(best.rep)?.supportAnchorage ?? [];
      const face = b.layerId?.split(':')[1] ?? '';
      const position = face.startsWith('top') ? 'top' : 'bottom';
      const row = Number(b.layerId?.split(':').pop() ?? 0);
      const rows = verdicts.filter((v) => v.end === best!.end && v.position === position && v.row === row);
      const same = rows.filter((v) => v.diameterMm === b.diameterMm);
      const vs = same.length ? same : rows.filter((v) => v.diameterMm >= b.diameterMm);
      const where = `${b.id}:${side} (e${best.rep} ${best.end} ${position} row ${row} Ø${b.diameterMm})`;
      if (vs.length === 0) { out.mismatches.push(`${where}: no verdict`); continue; }
      out.compared++;
      if (rec.support === 'end') out.atEnds++;
      const v = vs[0]!;
      if (rec.support === 'interior' || v.solution === 'pending') {
        if (!(rec.support === 'interior' && v.solution === 'pending' && (rec.solution === 'lap' || rec.solution === 'straight'))) {
          out.mismatches.push(`${where}: built ${rec.support}/${rec.solution}, design ${v.support}/${v.solution}`);
        }
        continue;
      }
      if (same.length) {
        const built = [rec.solution, mm(rec.available), rec.rule, mm(rec.required)];
        const design = [v.solution, mm(v.available), v.rule, mm(v.required)];
        if (built.join() !== design.join()) out.mismatches.push(`${where}: built ${built.join(' ')}, design ${design.join(' ')}`);
      } else if (rec.solution !== v.solution || rec.rule !== v.rule || rec.available < rec.required - 1e-9) {
        out.mismatches.push(`${where}: built ${rec.solution} ${rec.rule} ${mm(rec.available)}/${mm(rec.required)}, design row Ø${v.diameterMm} ${v.solution} ${v.rule}`);
      }
    }
  }
  return out;
}
