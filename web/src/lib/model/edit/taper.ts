/**
 * Tapered members as prismatic segments: a welded I whose depth runs from one value at end I to
 * another at end J, cut into segments that each carry the section at their own mid-length.
 *
 * ── Why segments ───────────────────────────────────────────────────
 *
 * The engine's frame element is prismatic. A tapered member is therefore represented, the way
 * frame programs have long done it, by a chain of prismatic ones. `taper.test.ts` measures the
 * error against the exact integral of a tapered cantilever, so the default count is a number that
 * was checked, not assumed.
 *
 * Flanges and web thickness stay constant along the member, which is how a tapered plate girder
 * is fabricated: the web plate is cut on a slope and the flanges are the same bar throughout.
 *
 * Segments that come out with the same depth (to 0.1 mm) share one section, so several members
 * tapered alike do not fill the sections table with copies. One undo step.
 */
import { modelStore } from '../../store/model.svelte';
import { resolveSectionState } from '../../section/state';
import type { Section } from '../../store/model.svelte';
import { findProfile } from '../../engine/generators/profile-resolve';

export interface TaperSpec {
  /** Depth at end I and at end J, m. */
  hI: number;
  hJ: number;
  /** Flange width, flange and web thickness, m. */
  b: number;
  tf: number;
  tw: number;
  /** Prismatic segments per member. */
  segments: number;
}

/**
 * Twelve segments put the tip deflection of an 0.8 → 0.3 m tapered cantilever within 0.5 % of the
 * exact value; the error falls with the square of the count.
 */
export const DEFAULT_TAPER_SEGMENTS = 12;

export type TaperProblem = 'segments' | 'dimensions' | 'webTooShallow';

export function validateTaper(s: TaperSpec): TaperProblem[] {
  const out: TaperProblem[] = [];
  if (!(Number.isInteger(s.segments) && s.segments >= 2 && s.segments <= 50)) out.push('segments');
  if (![s.hI, s.hJ, s.b, s.tf, s.tw].every((v) => Number.isFinite(v) && v > 0)) out.push('dimensions');
  else if (Math.min(s.hI, s.hJ) <= 2 * s.tf) out.push('webTooShallow');
  return out;
}

/**
 * The segments of one member: where each starts and ends (0…1 along it) and its depth, the one at
 * its mid-length.
 *
 * A depth chosen to make each segment's flexibility exact under a constant moment (the harmonic
 * mean of its inertia) was tried and measured worse on a cantilever, 1.0 % against 0.7 % at
 * eight segments: the moment is not constant, and the stiff root carries most of it. The
 * mid-length depth is also the usual reading, so it stays.
 */
export function taperPlan(s: TaperSpec): Array<{ from: number; to: number; h: number }> {
  return Array.from({ length: s.segments }, (_, i) => {
    const from = i / s.segments, to = (i + 1) / s.segments;
    return { from, to, h: s.hI + (s.hJ - s.hI) * ((from + to) / 2) };
  });
}

export interface TaperReport { tapered: number[]; skipped: Array<{ id: number; reason: 'missing' | 'reinforced' | 'invalid' }>; sections: number }

/** Taper each member, from its end I to its end J. */
export function taperMembers(ids: Iterable<number>, spec: TaperSpec, name = 'I'): TaperReport {
  const report: TaperReport = { tapered: [], skipped: [], sections: 0 };
  if (validateTaper(spec).length > 0) {
    for (const id of ids) report.skipped.push({ id, reason: 'invalid' });
    return report;
  }
  const plan = taperPlan(spec);
  /** Depth in 0.1 mm → section id, for this call and for what the model already has. */
  const byDepth = new Map<number, number>();
  const key = (h: number) => Math.round(h * 1e4);
  for (const s of modelStore.sections.values()) {
    if (s.shape === 'I' && s.b === spec.b && s.tf === spec.tf && s.tw === spec.tw && s.h != null && s.name.startsWith(`${name} `)) {
      byDepth.set(key(s.h), s.id);
    }
  }
  const sectionFor = (h: number): number => {
    const k = key(h);
    const have = byDepth.get(k);
    if (have != null) return have;
    const fields = { name: `${name} ${(h * 1000).toFixed(0)}x${(spec.b * 1000).toFixed(0)}`, shape: 'I', h, b: spec.b, tw: spec.tw, tf: spec.tf, a: 1e-4, iz: 1e-8 };
    const st = resolveSectionState({ id: 0, ...fields } as Section);
    const id = modelStore.addSection({ ...fields, ...(st.kind === 'geometry-backed' ? { a: st.a, iy: st.iy, iz: st.iz } : {}) } as Omit<Section, 'id'>);
    byDepth.set(k, id);
    report.sections++;
    return id;
  };

  modelStore.batch(() => {
    for (const id of [...new Set(ids)]) {
      const e = modelStore.elements.get(id);
      if (!e) { report.skipped.push({ id, reason: 'missing' }); continue; }
      if (e.reinforcement) { report.skipped.push({ id, reason: 'reinforced' }); continue; }
      const cuts = plan.slice(1).map((p) => p.from);
      const r = modelStore.splitMember(id, cuts, { keepOriginalId: false });
      if (!r || r.segmentIds.length !== plan.length) { report.skipped.push({ id, reason: 'missing' }); continue; }
      r.segmentIds.forEach((seg, i) => modelStore.updateElementSection(seg, sectionFor(plan[i]!.h)));
      report.tapered.push(...r.segmentIds);
    }
  });
  return report;
}

/**
 * The columns of a generated frame, tapered from base to head.
 *
 * A column is a vertical member with a support at one end; it is tapered from that end, whichever
 * of its ends is I. Flanges and web come from the column's own section: its stored thicknesses, or
 * the catalogue row it was picked from. Columns whose section is not an I are left alone and
 * counted, so the generator can say how many it could not taper.
 */
export function taperSupportedColumns(baseDepth: number, headDepth: number, segments = DEFAULT_TAPER_SEGMENTS): TaperReport & { notI: number } {
  const supported = new Set([...modelStore.supports.values()].map((s) => s.nodeId));
  const total: TaperReport & { notI: number } = { tapered: [], skipped: [], sections: 0, notI: 0 };
  const plans: Array<{ id: number; spec: TaperSpec }> = [];
  for (const e of modelStore.elements.values()) {
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const vertical = Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0)) < 1e-6 && Math.abs((b.z ?? 0) - (a.z ?? 0)) > 1e-6;
    const baseAtI = supported.has(e.nodeI), baseAtJ = supported.has(e.nodeJ);
    if (!vertical || baseAtI === baseAtJ) continue;
    const sec = modelStore.sections.get(e.sectionId);
    const cat = sec?.name ? findProfile(sec.name) : undefined;
    const b0 = sec?.b ?? (cat ? cat.b / 1000 : undefined);
    const tf = sec?.tf ?? (cat?.tf != null ? cat.tf / 1000 : undefined);
    const tw = sec?.tw ?? (cat?.tw != null ? cat.tw / 1000 : undefined);
    const isI = sec?.shape === 'I' || sec?.shape === 'H' || (cat != null && ['IPE', 'IPN', 'HEA', 'HEB', 'HEM', 'W', 'HP', 'M'].includes(cat.family));
    if (!isI || !b0 || !tf || !tw) { total.notI++; continue; }
    plans.push({ id: e.id, spec: { hI: baseAtI ? baseDepth : headDepth, hJ: baseAtI ? headDepth : baseDepth, b: b0, tf, tw, segments } });
  }
  modelStore.batch(() => {
    for (const { id, spec } of plans) {
      const r = taperMembers([id], spec, 'I');
      total.tapered.push(...r.tapered);
      total.skipped.push(...r.skipped);
      total.sections += r.sections;
    }
  });
  return total;
}
