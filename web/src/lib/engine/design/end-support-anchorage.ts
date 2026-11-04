/**
 * The design's reading of a beam's bars at its supports: the verifier's half of
 * `engine/detailing/support-anchorage.ts`.
 *
 * Every bar the detailing will end in a column is checked here, before it exists, by the same
 * function the detailing lays it with (`planSupportEnd`), on the same support (`beamSupportCage`)
 * and the same bars (`supportRows`): an end the detailing cannot anchor fails the design, and the
 * search looks for bars that do. Two more rows of §9.7.3.8: the positive steel's diameter at the
 * points of inflection and at simple supports (§9.7.3.8.3).
 *
 * Pure.
 */
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import {
  bottomHookInboard, faceDevelopment, inflectionAnchorage, planSupportEnd, supportRows, topLayout, topRowInboard, topRowsOf,
  SUPPORT_EMBED_M, cornerDiasOf, crossingSeats, faceCornerDiasOf, type CrossingSeat, type SupportCage, type SupportEndPlan, yieldsTo,
  columnFacesAlong,
} from '../detailing/support-anchorage';
import { memberOffsetAt, type OffsetCarrier } from '../member-offsets';
import { minClearSpacingInLayer } from '../../codes/cirsoc201/spacing';
import { layerCentroid, resolveLayers, rebarGroupArea, type ProvidedRebarCheck, type ElementStationResult } from '../station-design-forces';
import { STANDARD_LONG_DIAS, STANDARD_STIRRUP_DIAS } from './objective';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import type { RegulationEdition } from '../../codes/regulation';
import type { DesignAxes } from './design-axes';
import type { MemberContext } from './member-context';
import { developsAtFace, UNDECLARED, type LateralReading } from '../../model/lateral-system';

/** One verdict at one support, per row of bars: what the detailing will build there. */
export interface SupportAnchorageVerdict {
  end: 'start' | 'end';
  position: 'top' | 'bottom';
  row: number;
  diameterMm: number;
  count: number;
  continuousPair: boolean;
  solution: SupportEndPlan['record']['solution'];
  support: SupportEndPlan['record']['support'];
  available: number;
  required: number;
  rule: SupportEndPlan['record']['rule'];
  cause: SupportEndPlan['cause'];
  cage: SupportCage;
}

interface ModelSlice {
  nodes: ReadonlyMap<number, { id: number; x: number; y: number; z?: number }>;
  /** With their declared insertion offsets (`Element.offset`), which move a column's faces. */
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; sectionId: number } & OffsetCarrier>;
  sections: ReadonlyMap<number, { b?: number; h?: number; rotation?: number }>;
}

/** A designed column's largest longitudinal bar, mm (0 when it carries none). */
export function columnCageDia(rebar: ProvidedReinforcement | undefined): number {
  if (!rebar) return 0;
  return Math.max(0, rebar.column?.cornerDia ?? 0, rebar.column?.faceDia ?? 0, rebar.longitudinal?.diameter ?? 0, rebar.shaped?.diameter ?? 0);
}

/** A designed beam's corner bars and the stirrup they seat in (`beamCorners`). */
export function beamCornerRecord(rebar: ProvidedReinforcement | undefined, defaultStirrupDiaMm: number): BeamCornerRecord | null {
  if (!rebar) return null;
  const dias = cornerDiasOf(rebar);
  if (!dias.length) return null;
  const st = Math.max(rebar.regions?.stirrupsSupport?.diameter ?? 0, rebar.regions?.stirrupsSpan?.diameter ?? 0, rebar.stirrups?.diameter ?? 0);
  return { cornerDiasMm: dias, topDiasMm: faceCornerDiasOf(rebar, 'top'), bottomDiasMm: faceCornerDiasOf(rebar, 'bottom'), stirrupDiaMm: st > 0 ? st : defaultStirrupDiaMm };
}

/** A designed beam's corner bars, by face, and its stirrup (`MemberContext.beamCorners`). */
export interface BeamCornerRecord { cornerDiasMm: readonly number[]; topDiasMm?: readonly number[]; bottomDiasMm?: readonly number[]; stirrupDiaMm: number }

/** The project's largest admissible longitudinal bar: the default column cage, mm. */
export const defaultColumnBarDia = (admissible?: readonly number[]): number =>
  Math.max(...(admissible && admissible.length ? admissible : STANDARD_LONG_DIAS));

/**
 * The column at one end of a member, from the model as the design has it: half the smaller side
 * of the widest column framing into the node, whether a collinear member continues past it, the
 * project's cover and tie, and the default cage. `own` are the member's own elements (the pieces
 * of a span), which neither support nor continue it.
 */
export function beamSupportCage(
  model: ModelSlice, memberNodes: { from: number; to: number }, nodeId: number, own: ReadonlySet<number>,
  project: {
    cover: number; tieDiaMm: number; admissibleDiametersMm?: readonly number[]; columnCages?: ReadonlyMap<number, number>;
    beamCorners?: ReadonlyMap<number, BeamCornerRecord>;
    /** Clear distance between parallel bars, m (§25.2.1): a hook tail's from a crossing beam's that hooks at the same joint. */
    parallelClear?: number;
    /** Beams with no design (`MemberContext.absentBeams`): no bars to continue a line with. */
    absentBeams?: ReadonlySet<number>;
  },
): SupportCage {
  const P = (id: number) => { const n = model.nodes.get(id)!; return { x: n.x, y: n.y, z: n.z ?? 0 }; };
  const a = P(memberNodes.from), b = P(memberNodes.to);
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L, z: (b.z - a.z) / L };
  let face = 0, continues = false;
  /** The far face of the column `face` was read from, where its insertion moves it off `face`. */
  let far: number | undefined;
  let widest = 0;
  // From this end into the span, and the member's own axis at this node: a column's faces are
  // read against the beam's axis, each member's on its declared insertion (`memberOffsetAt`).
  const w = nodeId === memberNodes.from ? u : { x: -u.x, y: -u.y, z: -u.z };
  const ownHere = [...own].map((id) => model.elements.get(id)).find((e) => !!e && (e.nodeI === nodeId || e.nodeJ === nodeId));
  const beamOff = ownHere ? memberOffsetAt(ownHere, nodeId, model.nodes, model.sections) : { x: 0, y: 0, z: 0 };
  let designed = 0, undesigned = false;
  const crossing: CrossingSeat[] = [];
  /** Whether a horizontal member ends at the node: no beam with a design continues its line past it. */
  const endsHere = (e: { id: number; nodeI: number; nodeJ: number }) => {
    const p0 = model.nodes.get(e.nodeI), q0 = model.nodes.get(e.nodeJ);
    if (!p0 || !q0) return false;
    const v = { x: q0.x - p0.x, y: q0.y - p0.y }, lv = Math.hypot(v.x, v.y) || 1;
    for (const o of model.elements.values()) {
      if (o.id === e.id || own.has(o.id) || (o.nodeI !== nodeId && o.nodeJ !== nodeId) || project.absentBeams?.has(o.id)) continue;
      const p1 = model.nodes.get(o.nodeI), q1 = model.nodes.get(o.nodeJ);
      if (!p1 || !q1 || Math.abs((q1.z ?? 0) - (p1.z ?? 0)) > 1e-6) continue;
      const w = { x: q1.x - p1.x, y: q1.y - p1.y }, lw = Math.hypot(w.x, w.y) || 1;
      if (Math.abs((v.x * w.x + v.y * w.y) / (lv * lw)) > 0.7) return false;
    }
    return true;
  };
  for (const e of model.elements.values()) {
    if (own.has(e.id) || (e.nodeI !== nodeId && e.nodeJ !== nodeId)) continue;
    const p = model.nodes.get(e.nodeI), q = model.nodes.get(e.nodeJ);
    if (!p || !q) continue;
    const d = { x: q.x - p.x, y: q.y - p.y, z: (q.z ?? 0) - (p.z ?? 0) };
    const l = Math.hypot(d.x, d.y, d.z) || 1;
    if (Math.hypot(d.x, d.y) < 1e-6) {
      // A column: the face at half its smaller side, as the detailing's `supportFaceOffset`, moved
      // by where the column's axis stands off the beam's (`columnFacesAlong`): a column placed by
      // its face has its near face a whole side from the node, or none.
      const s = model.sections.get(e.sectionId);
      const side = Math.min(s?.b ?? 0, s?.h ?? 0);
      if (side > widest) {
        widest = side;
        const colOff = memberOffsetAt(e, nodeId, model.nodes, model.sections);
        const f = columnFacesAlong(side / 2, { x: colOff.x - beamOff.x, y: colOff.y - beamOff.y, z: 0 }, w);
        face = f.face; far = f.far;
      }
      const cage = project.columnCages?.get(e.id);
      if (cage && cage > 0) designed = Math.max(designed, cage); else undesigned = true;
    } else if (Math.abs(d.z) < 1e-6 && Math.abs((d.x * u.x + d.y * u.y + d.z * u.z) / l) > 0.7) {
      // A beam with no design has no bars to lap with: the line ends here, as the detailing lays it.
      if (!project.absentBeams?.has(e.id)) continues = true;
    } else if (Math.abs(d.z) < 1e-6) {
      // A crossing beam: its corner bars' seats, from its design or every one it could take.
      const s = model.sections.get(e.sectionId);
      // Where both end here, the one that gives way (`yieldsTo`) clears the other's corner by the
      // parallel clear; the other only crosses it.
      const gives = endsHere(e) && project.parallelClear !== undefined && yieldsTo(u, d);
      if (s?.b && s.h) crossing.push(...crossingSeatsOf(e.id, { b: s.b, h: s.h }, project, gives ? { clear: project.parallelClear! } : undefined));
    }
  }
  return supportCageFrom({ face, ...(far !== undefined ? { far } : {}), continues, cover: project.cover, tieDiaMm: project.tieDiaMm, designedBarDiaMm: undesigned ? 0 : designed, admissibleDiametersMm: project.admissibleDiametersMm, crossing });
}

/**
 * A crossing beam's corner seats: from its design when known (`beamCorners`), otherwise every
 * seat it could take, for every admissible bar and stirrup, so the hook clears them all.
 */
export function crossingSeatsOf(
  id: number, section: { b: number; h: number },
  project: { cover: number; tieDiaMm: number; admissibleDiametersMm?: readonly number[]; beamCorners?: ReadonlyMap<number, BeamCornerRecord> },
  /** The crossing beam ends at this joint: its top bars hook down here (`CrossingSeat.clear`). */
  hooksHere?: { clear: number },
): CrossingSeat[] {
  const known = project.beamCorners?.get(id);
  const all = project.admissibleDiametersMm?.length ? project.admissibleDiametersMm : STANDARD_LONG_DIAS;
  const stirrupDiasMm = known ? [known.stirrupDiaMm] : [...STANDARD_STIRRUP_DIAS, project.tieDiaMm];
  const base = { b: section.b, h: section.h, cover: project.cover, stirrupDiasMm };
  return [
    // The tails' parallel clear is owed to the corner bar the crossing beam has: a beam not
    // designed yet is read at every seat it could take, crossing them, and at its own design
    // once it has one (`settleCrossingSeats`). Owed to every bar it could take, the plane went
    // past a Ø32's seat and clear: a 20 cm beam's tail ended at the node, its ldh refused there.
    ...crossingSeats({ ...base, cornerDiasMm: known ? (known.topDiasMm ?? known.cornerDiasMm) : all, face: 'top', ...(hooksHere && known ? { clear: hooksHere.clear } : {}) }),
    // And its bottom corner bar, which hooks up there where its positive steel develops fy at the
    // face (§9.7.3.8.2): the bottom tails of the two stand side by side as the top ones do. Owed
    // to the top corner alone, a corner of two lateral-system beams ended their bottom hooks
    // 30 mm apart, 19 mm clear (the span fixture at 40×40, undeclared: 6,7 mm short).
    ...crossingSeats({ ...base, cornerDiasMm: known ? (known.bottomDiasMm ?? known.cornerDiasMm) : all, face: 'bottom', ...(hooksHere && known ? { clear: hooksHere.clear } : {}) }),
  ];
}

/**
 * The cage from what is known of the columns at the node: their designed largest bar when every
 * one of them is designed, else the project's default (the largest it admits), never less.
 */
export function supportCageFrom(o: {
  face: number; continues: boolean; cover: number; tieDiaMm: number; designedBarDiaMm: number; admissibleDiametersMm?: readonly number[];
  crossing?: ReadonlyArray<CrossingSeat>;
  /** The far face past the node, where a declared insertion moves it off `face` (`SupportCage.far`). */
  far?: number;
}): SupportCage {
  if (!(o.face > 0)) return { face: 0, continues: o.continues, cover: o.cover, tieDiaMm: o.tieDiaMm, barDiaMm: 0, source: 'noColumn' };
  const designed = o.designedBarDiaMm > 0;
  return {
    face: o.face, ...(o.far !== undefined ? { far: o.far } : {}), continues: o.continues, cover: o.cover, tieDiaMm: o.tieDiaMm,
    barDiaMm: designed ? o.designedBarDiaMm : defaultColumnBarDia(o.admissibleDiametersMm),
    source: designed ? 'designedCage' : 'defaultCage',
    ...(o.crossing?.length ? { crossing: [...o.crossing] } : {}),
  };
}

export interface EndSupportInput {
  rebar: ProvidedReinforcement;
  /** The cage's seat: the stirrup diameter the detailing lays (the design's), and the aggregate. */
  seat: { stirrupDiaMm: number; maxAggregateSizeMm: number };
  section: { b: number; h: number; cover: number; stirrupDia: number; fc: number; fy: number };
  cages: { start: SupportCage; end: SupportCage };
  edition: RegulationEdition;
  /**
   * Whether the positive steel develops fy at the face (§9.7.3.8.2) rather than running 150 mm in:
   * the member's reading, `developsAtFace(ctx.lateral)`, which every production builder states
   * (`supportInputOf`, `run-detailing`), so a member not declared develops it. Absent: the 150 mm,
   * for a plan built by hand.
   */
  lateralSystem?: boolean;
  /** The declaration that reading came from, for the rows to say which one was used. */
  lateral?: LateralReading;
}

/** Whether an end is a simple support: no column frames into it and nothing continues past it. */
export const isSimpleSupport = (c: SupportCage) => !(c.face > 0) && !c.continues;

/**
 * Every row of bars at both supports, planned exactly as the detailing will lay them, and how
 * many top layers the detailing may lay.
 *
 * The coordination offers each member its fewest layers and one more (`generateLayoutCandidates`)
 * and takes the extra one where a joint is congested; which it takes is not known before it
 * runs. Where every bar anchors in the extra layer too, the plan allows it and every row up to
 * it is checked. Where a bar of the extra layer would not anchor, the plan holds the member to
 * its fewest layers (`maxTopLayers`), the detailing drops the extra-layer candidates, and the
 * rows checked are the ones it can then lay — so what passes here is what gets built, no more
 * and no less.
 */
export function endSupportPlan(input: EndSupportInput): { verdicts: SupportAnchorageVerdict[]; maxTopLayers: number } {
  const { rebar, section, edition } = input;
  const { slots, fewest } = topLayout(rebar, { b: section.b, cover: section.cover, stirrupDiaMm: input.seat.stirrupDiaMm, edition, maxAggregateSizeMm: input.seat.maxAggregateSizeMm });
  if (slots <= 0) return { verdicts: verdictsIn(input, 0, 1), maxTopLayers: 1 };
  if (fewest + 1 <= slots) {
    const extra = verdictsIn(input, slots, fewest + 1);
    if (extra.every((v) => v.solution !== 'unresolved')) return { verdicts: extra, maxTopLayers: fewest + 1 };
  }
  return { verdicts: verdictsIn(input, slots, fewest), maxTopLayers: fewest };
}

/** The verdicts alone (`endSupportPlan`). */
export const endSupportVerdicts = (input: EndSupportInput): SupportAnchorageVerdict[] => endSupportPlan(input).verdicts;

/** Every row at both supports with the member's top `slots` laid in `layers` layers. */
function verdictsIn(input: EndSupportInput, slots: number, layers: number): SupportAnchorageVerdict[] {
  const { rebar, section, cages, edition } = input;
  // Nested hook tails stand side by side, parallel: §25.2.1's clear of the larger bar, not §25.2.2's
  // between layers (qa-8: a bottom hook 25,0 mm inside a top tail where 25,3 was due).
  const nestClear = (d: number) => minClearSpacingInLayer(edition, { barDiameterMm: d, maxAggregateSizeMm: input.seat.maxAggregateSizeMm }).minClear;
  const simple = isSimpleSupport(cages.start) || isSimpleSupport(cages.end);
  const groups = rebar.regions?.bottomGroups ?? [];
  const out: SupportAnchorageVerdict[] = [];
  for (const end of ['start', 'end'] as const) {
    const cage = cages[end];
    const rows = supportRows(rebar, end, {
      simple, lateralSystem: input.lateralSystem === true, slots, layers,
      pitch: { edition, maxAggregateSizeMm: input.seat.maxAggregateSizeMm },
      bottomHookRequested: groups.some((g) => (end === 'start' ? g.anchorageStart : g.anchorageEnd) === 'hook'),
    });
    const topRows = topRowsOf(rows);
    const topDia = Math.max(0, ...rows.filter((r) => r.position === 'top').map((r) => r.diameterMm));
    for (const r of rows) {
      const dev = faceDevelopment(rebar, section, r.position === 'bottom' ? 'bottom' : end === 'start' ? 'topStart' : 'topEnd', r.diameterMm, edition);
      const inboard = r.position === 'top' ? topRowInboard(r.row, r.diameterMm, nestClear(r.diameterMm))
        : r.hook === 'requested' ? bottomHookInboard(topRows, topDia, nestClear(Math.max(topDia, r.diameterMm))) + topRowInboard(r.row, r.diameterMm, nestClear(r.diameterMm)) : 0;
      const plan = planSupportEnd(cage, {
        diameterMm: r.diameterMm, need: r.need, hook: r.hook, inboard, position: r.position,
        outerAcross: seatedLongitudinalHalfExtents(section.b, section.h, section.cover, input.seat.stirrupDiaMm, r.diameterMm).corner.halfAcross,
        ...(r.position === 'top' ? { rowStep: r.diameterMm / 1000 + nestClear(r.diameterMm) } : {}),
        ld: dev.ld, ldh: dev.ldh, ldc: dev.ldc, stress: 'tension',
      });
      if (!plan) continue;
      out.push({
        end, position: r.position, row: r.row, diameterMm: r.diameterMm, count: r.count, continuousPair: r.continuousPair === true,
        solution: plan.record.solution, support: plan.record.support, available: plan.record.available,
        required: plan.record.required, rule: plan.record.rule, cause: plan.cause, cage,
      });
    }
  }
  return out;
}

/**
 * Where the bottom bars end in each end support, m past the node (negative: short of it): the
 * straight end as cut (§9.7.3.8's 150 mm past the face, or the ties' plane for a member of the
 * lateral system) and a hook's outer edge, both as `planSupportEnd` lays them and the detailing
 * builds them. The design's region rows measure the bars' development to these ends
 * (`continuingGroupsInto`), so the region check and the bars built read one geometry. None at a
 * support the line continues past (the laps carry the bars on) or with no column.
 */
export function bottomReach(input: EndSupportInput): { start?: { straight: number; hooked: number }; end?: { straight: number; hooked: number } } {
  const { rebar, section, edition } = input;
  const { maxTopLayers } = endSupportPlan(input);
  const { slots } = topLayout(rebar, { b: section.b, cover: section.cover, stirrupDiaMm: input.seat.stirrupDiaMm, edition, maxAggregateSizeMm: input.seat.maxAggregateSizeMm });
  const nestClear = (d: number) => minClearSpacingInLayer(edition, { barDiameterMm: d, maxAggregateSizeMm: input.seat.maxAggregateSizeMm }).minClear;
  const simple = isSimpleSupport(input.cages.start) || isSimpleSupport(input.cages.end);
  const out: { start?: { straight: number; hooked: number }; end?: { straight: number; hooked: number } } = {};
  for (const end of ['start', 'end'] as const) {
    const cage = input.cages[end];
    if (!(cage.face > 0) || cage.continues) continue;
    const rows = supportRows(rebar, end, { simple, lateralSystem: input.lateralSystem === true, slots, layers: maxTopLayers, bottomHookRequested: false, pitch: { edition, maxAggregateSizeMm: input.seat.maxAggregateSizeMm } });
    const bottom = rows.find((r) => r.position === 'bottom');
    if (!bottom) continue;
    const topDia = Math.max(0, ...rows.filter((r) => r.position === 'top').map((r) => r.diameterMm));
    const dev = faceDevelopment(rebar, section, 'bottom', bottom.diameterMm, edition);
    const bar = { diameterMm: bottom.diameterMm, need: bottom.need, ld: dev.ld, ldh: dev.ldh, ldc: dev.ldc, stress: 'tension' as const };
    const straight = planSupportEnd(cage, { ...bar, hook: 'allowed', inboard: 0, position: 'bottom' });
    const hooked = planSupportEnd(cage, { ...bar, hook: 'requested', inboard: bottomHookInboard(topRowsOf(rows), topDia, nestClear(Math.max(topDia, bottom.diameterMm))), position: 'bottom' });
    if (!straight || !hooked) continue;
    // A straight end that does not develop is held at the ties' plane; a hook's at its outer edge.
    out[end] = { straight: straight.hook ? straight.availableStraight - cage.face : straight.along, hooked: hooked.availableHooked - cage.face };
  }
  return out;
}

/**
 * What a bottom row's end owes the face, and why (§9.7.3.8.2), in the words the row prints: the
 * reading of the member's role in the lateral system the design used (`model/lateral-system.ts`).
 */
export function lateralReadingNote(r: LateralReading | undefined): string {
  const role = r?.role ?? 'undeclared';
  if (role === 'gravity') return '§9.7.3.8.2: declared not part of the lateral-force-resisting system, 150 mm into the support';
  if (role === 'lateral') return '§9.7.3.8.2: declared part of the lateral-force-resisting system, fy developed at the face';
  return '§9.7.3.8.2: role in the lateral-force-resisting system not declared, designed as part of it (fy developed at the face, which also meets the 150 mm)';
}

/** The verdicts as rows of the verifier: one per support row, failing where nothing anchors. */
export function endSupportChecks(verdicts: readonly SupportAnchorageVerdict[], lateral?: LateralReading): ProvidedRebarCheck[] {
  // An end left to the line's laps is the lap's to check; a bar with nothing to develop has no row.
  return verdicts.filter((v) => v.solution !== 'pending' && v.rule !== 'none').map((v) => {
    const fails = v.solution === 'unresolved';
    const cm = (x: number) => (x * 100).toFixed(1);
    return {
      /*
       * One name per row, because the row is read by its name: the verification table keys its
       * rows on it, and two rows of one name took the whole design panel down (a duplicate key in
       * a keyed list). The continuous pair and the rest of the group both stand in the outer top
       * row (`supportRows`), so the pair says it is the pair.
       */
      category: `Anchorage at support (${v.end}, ${v.position}${v.row > 0 ? ` row ${v.row + 1}` : ''}${v.continuousPair ? ', continuous pair' : ''})`,
      demandCategory: null,
      required: +cm(v.required), provided: +cm(v.available),
      // §9.7.3.8's 150 mm is where the bar is cut, not a length it develops: no utilization to state.
      ratio: v.rule === '9.7.3.8.2' ? Number.NaN : v.available > 0 ? +(v.required / v.available).toFixed(3) : Number.POSITIVE_INFINITY,
      status: fails ? 'fail' : 'ok',
      unit: 'cm', method: 'area', tuplesChecked: 0,
      description: `${v.count}Ø${v.diameterMm} ${v.solution}: ${cm(v.available)} cm available vs ${v.rule} ${cm(v.required)} cm (${v.cage.source}, column face ${cm(v.cage.face)} cm, Ø${v.cage.barDiaMm} cage)`
        // The positive steel's end is the one §9.7.3.8.2 sets by the member's role: say which was read.
        + (v.position === 'bottom' ? ` · ${lateralReadingNote(lateral)}` : ''),
      limiting: 'anchorage',
    } satisfies ProvidedRebarCheck;
  });
}

/**
 * §9.7.3.8.3 for the positive steel continuing into the supports: at every point of inflection
 * along the member, (b) ld ≤ Mn/Vu + ℓa; at a simple support, (a) ld ≤ 1,3·Mn/Vu + ℓa with ℓa
 * the embedment past the support's centre, unless the bars end there in a standard hook.
 */
export function inflectionChecks(input: EndSupportInput & {
  stations?: ElementStationResult; axes: DesignAxes; L: number;
}): ProvidedRebarCheck[] {
  const { rebar, section, stations, axes } = input;
  const bottom = resolveLayers(rebar.regions?.bottomSpanLayers, rebar.regions?.bottomSpan ?? rebar.bottom);
  if (!stations || bottom.length === 0) return [];
  const count = bottom.reduce((n, l) => n + l.count, 0);
  const simple = isSimpleSupport(input.cages.start) || isSimpleSupport(input.cages.end);
  const continuing = Math.min(count, Math.max(2, Math.ceil(count * (simple ? 1 / 3 : 1 / 4))));
  const dia = Math.max(...bottom.map((l) => l.diameter));
  const asCm2 = rebarGroupArea({ count: continuing, diameter: dia });
  const d = section.h - layerCentroid(bottom, section.cover, section.stirrupDia);
  const ld = faceDevelopment(rebar, section, 'bottom', dia, input.edition).ld;
  const mKey = axes.flexure === 'My' ? 'my' : 'mz';
  const vKey = axes.shear === 'Vz' ? 'vz' : 'vy';
  const sag = axes.sagCategory.endsWith('+') ? 1 : -1;
  let worst: { limit: number; x: number; combo: string; vu: number; mn: number } | null = null;
  for (const cr of stations.comboResults) {
    const st = [...cr.stations].sort((p, q) => p.x - q.x);
    for (let i = 1; i < st.length; i++) {
      const m0 = st[i - 1]![mKey] * sag, m1 = st[i]![mKey] * sag;
      if (!(m0 * m1 < 0)) continue;
      const w = Math.abs(m0) / (Math.abs(m0) + Math.abs(m1));
      const vu = Math.abs(st[i - 1]![vKey] + (st[i]![vKey] - st[i - 1]![vKey]) * w);
      const r = inflectionAnchorage({ ld, asCm2, fy: section.fy, fc: section.fc, b: section.b, d, diameterMm: dia, vu });
      if (!worst || r.limit < worst.limit) worst = { limit: r.limit, x: st[i - 1]!.x + (st[i]!.x - st[i - 1]!.x) * w, combo: cr.comboName, vu, mn: r.mnKNm };
    }
  }
  const out: ProvidedRebarCheck[] = [];
  if (worst) {
    out.push({
      category: 'Anchorage at inflection (§9.7.3.8.3)', demandCategory: null,
      required: +(ld * 100).toFixed(1), provided: +(worst.limit * 100).toFixed(1),
      ratio: +(ld / worst.limit).toFixed(3), status: ld <= worst.limit + 1e-9 ? 'ok' : 'fail',
      unit: 'cm', method: 'area', tuplesChecked: 0, comboName: worst.combo, stationX: +worst.x.toFixed(3),
      description: `${continuing}Ø${dia}: ld ${(ld * 100).toFixed(1)} cm vs Mn/Vu + ℓa = ${(worst.mn).toFixed(1)}/${worst.vu.toFixed(1)} + ℓa = ${(worst.limit * 100).toFixed(1)} cm (§9.7.3.8.3(b))`,
      limiting: 'anchorage',
    });
  }
  // A simple support: the positive steel ends 150 mm past the node (no column to read).
  for (const end of ['start', 'end'] as const) {
    if (!isSimpleSupport(input.cages[end])) continue;
    if ((rebar.regions?.bottomGroups ?? []).some((g) => (end === 'start' ? g.anchorageStart : g.anchorageEnd) === 'hook')) continue;
    const at = end === 'start' ? 0 : input.L;
    let vu = 0;
    for (const cr of stations.comboResults) for (const s of cr.stations) if (Math.abs(s.x - at) < 1e-6) vu = Math.max(vu, Math.abs(s[vKey]));
    const r = inflectionAnchorage({ ld, asCm2, fy: section.fy, fc: section.fc, b: section.b, d, diameterMm: dia, vu: vu / 1.3 });
    const limit = (r.limit - r.la) + SUPPORT_EMBED_M;
    out.push({
      category: `Anchorage at simple support (${end}, §9.7.3.8.3)`, demandCategory: null,
      required: +(ld * 100).toFixed(1), provided: +(limit * 100).toFixed(1),
      ratio: +(ld / limit).toFixed(3), status: ld <= limit + 1e-9 ? 'ok' : 'fail',
      unit: 'cm', method: 'area', tuplesChecked: 0,
      description: `${continuing}Ø${dia}: ld ${(ld * 100).toFixed(1)} cm vs 1,3·Mn/Vu + ℓa = ${(limit * 100).toFixed(1)} cm (§9.7.3.8.3(a), ℓa = ${(SUPPORT_EMBED_M * 100).toFixed(0)} cm)`,
      limiting: 'anchorage',
    });
  }
  return out;
}

/**
 * A beam's bars at its supports, read as the detailing will lay them: the columns the design can
 * see at its ends (`beamSupportCage`: their sections, the project's cover and tie, their designed
 * or default cage, the crossing beams' seats), its seat and section. Null off a beam or without
 * the model.
 */
export function supportInputOf(ctx: MemberContext, rebar: ProvidedReinforcement): EndSupportInput | null {
  if (ctx.elementType !== 'beam') return null;
  const md = ctx.modelData as unknown as Parameters<typeof beamSupportCage>[0] | undefined;
  const el = md?.elements?.get(ctx.elementId);
  if (!md?.nodes || !el || !md.sections) return null;
  const own = new Set<number>(ctx.span ? ctx.span.elements : [ctx.elementId]);
  const nodes = { from: el.nodeI, to: el.nodeJ };
  const project = {
    cover: ctx.material.cover, tieDiaMm: ctx.material.stirrupDia,
    ...(ctx.material.longDiametersMm ? { admissibleDiametersMm: ctx.material.longDiametersMm } : {}),
    ...(ctx.columnCages ? { columnCages: ctx.columnCages } : {}),
    ...(ctx.beamCorners ? { beamCorners: ctx.beamCorners } : {}),
    ...(ctx.absentBeams ? { absentBeams: ctx.absentBeams } : {}),
    parallelClear: minClearSpacingInLayer(ctx.codeEdition, { barDiameterMm: 0, maxAggregateSizeMm: ctx.material.maxAggregateSize.value }).minClear,
  };
  const cages = { start: beamSupportCage(md, nodes, el.nodeI, own, project), end: beamSupportCage(md, nodes, el.nodeJ, own, project) };
  const section = { b: ctx.section.b, h: ctx.section.h, cover: ctx.material.cover, stirrupDia: ctx.material.stirrupDia, fc: ctx.material.fc, fy: ctx.material.fy };
  // The cage the detailing seats the bars in: the design's own stirrups (`withDesignedStirrups`).
  const designedStirrup = Math.max(rebar.regions?.stirrupsSupport?.diameter ?? 0, rebar.regions?.stirrupsSpan?.diameter ?? 0, rebar.stirrups?.diameter ?? 0);
  const seat = { stirrupDiaMm: designedStirrup > 0 ? designedStirrup : ctx.material.stirrupDia, maxAggregateSizeMm: ctx.material.maxAggregateSize.value };
  // Not declared reads as part of the lateral system: fy at the face (`model/lateral-system.ts`).
  return { rebar, section, cages, edition: ctx.codeEdition, seat, lateralSystem: developsAtFace(ctx.lateral), lateral: ctx.lateral ?? UNDECLARED };
}

/**
 * Where a beam's hooks stand in its supports, past the node along the beam, m: the tail of every
 * row the plan hooks (`endSupportPlan`), as the detailing lays it (`run-detailing` `hookTails`) —
 * the posts a crossing beam's bars thread past at that joint.
 */
export function hookTails(input: EndSupportInput, nodes: { start: number; end: number }): Array<{ nodeId: number; at: number; diameterMm: number; row: number; position: 'top' | 'bottom' }> {
  const out: Array<{ nodeId: number; at: number; diameterMm: number; row: number; position: 'top' | 'bottom' }> = [];
  for (const v of endSupportPlan(input).verdicts) {
    if (v.solution !== 'hook') continue;
    out.push({ nodeId: v.end === 'start' ? nodes.start : nodes.end, at: v.available - v.cage.face - v.diameterMm / 2000, diameterMm: v.diameterMm, row: v.row, position: v.position });
  }
  return out;
}
