/**
 * Where a beam bar ends in the column it frames into, and whether it is anchored there.
 *
 * ── One geometry, one rule set, two readers ───────────────────────
 *
 * The design verifies a beam before any bar of it exists, and the detailing lays the bars after.
 * Both ask the same question at every support — does this bar develop where it ends — and they
 * used to answer it apart: the verifier never looked into the column at all, and passed V2's
 * top bars at columns A and C, while the detailing found no room for their hooks and refused
 * them. This module is the one answer, read by the verifier (`end-support-anchorage.ts`, in the
 * design adapter) and by the detailing (`generate-beam.ts`, `run-detailing.ts`) from the same
 * inputs, so the two cannot differ about an end.
 *
 * ── The column, as both can know it ───────────────────────────────
 *
 * The design runs before the column's cage is laid, so the column is read from what both stages
 * have: its section (the face is half its smaller side, as `run-detailing` has always taken it),
 * the project's cover and tie diameter, and a DEFAULT cage — the largest longitudinal bar the
 * project admits (`SupportCage.barDiaMm`, `source: 'defaultCage'`). The detailing uses that same
 * default, not the cage it lays: a column whose bars turn out smaller only leaves the hook more
 * room than was counted on, never less. Nothing here reads the crossing beams' bars; the hook's
 * tail is a fixed, known position, and the coordination keeps the crossing beams' bars off it
 * (`run-detailing` `coordinateBeamLayouts`), or the collision check reports that they are not.
 *
 * ── The rules ──────────────────────────────────────────────────────
 *
 *   tension, straight: ld (Tabla 25.4.2.3, §25.4.2.5 modifiers, √f'c ≤ 8,3 MPa §25.4.1.4),
 *     available from the near face to the far face less the cover and the tie;
 *   tension, hooked: ldh (§25.4.3.1) measured to the hook's outer edge, which stands behind the
 *     column's bars with their clear distance (§25.2.3: max(40 mm, 1,5·db)), and rows nest;
 *   compression: ldc (§25.4.9), never a hook (§25.4.1.2);
 *   positive steel into a support of a member outside the lateral system: 150 mm (§9.7.3.8.1,
 *     §9.7.3.8.2); inside it: fy developed at the face (§9.7.3.8.2), as tension above;
 *   a support the line continues past: the line's laps decide it (`lap-materialize.ts`).
 *
 * Pure.
 */
import { standardHook, type BarEndAnchorage } from '../../codes/cirsoc201/bar-geometry';
import { deriveCompressionDevelopment, deriveHookedDevelopment } from '../../codes/cirsoc201/anchorage';
import { concreteBelowTopBars } from '../../codes/cirsoc201/anchorage';
import { favourableRowHolds, requiredLd, resolveLayers, layerCentroid, topOuterPair } from '../station-design-forces';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import type { ProvidedReinforcement, RebarLayer, StirrupDef } from '../../design-contract/reinforcement';
import type { RegulationEdition } from '../../codes/regulation';
import { minClearSpacingFor, stackedLayerDepth } from '../../codes/cirsoc201/spacing';
import { DEFAULT_TOLERANCES } from './collision';

/** §9.7.3.8.1 and §9.7.3.8.2: positive steel extends at least 150 mm into the support. */
export const SUPPORT_EMBED_M = 0.15;
/** The two top bars run support to support for the stirrups' top bends (§25.7.1.2). */
export const CONTINUOUS_TOP_BARS = 2;
/** A millimetre clear of contact with the joint's ties. */
const TIE_CLEARANCE_M = 0.001;

/** The column a beam end frames into, as the design and the detailing both read it. */
export interface SupportCage {
  /** Node to the near face along the member, m: half the column's smaller side. 0: no column. */
  face: number;
  /**
   * Node to the FAR face, past the node, m. Absent: `face` — the column centred on the node, the
   * centroidal convention, which holds only where the model declares no insertion. A column
   * placed by its face (`Element.offset`) has its far face a whole side past the node, or none.
   */
  far?: number;
  /** The line continues past the support: a collinear beam frames in there. */
  continues: boolean;
  /** Cover of the column, m. */
  cover: number;
  /** The joint's tie diameter, mm. */
  tieDiaMm: number;
  /** The column's longitudinal bar the hook keeps clear of, mm. */
  barDiaMm: number;
  /** Where `barDiaMm` comes from: the columns' designed cages, the project's largest admissible bar, or no column. */
  source: 'designedCage' | 'defaultCage' | 'noColumn';
  /**
   * The crossing beams' corner bars at this joint, m past the node along the member, with their
   * diameters: they hold their seats whatever the coordination does, so a hook's tail keeps clear
   * of them. Every seat a crossing beam not yet designed could take, where its design is unknown.
   */
  crossing?: ReadonlyArray<CrossingSeat>;
}

/**
 * A crossing beam's corner bar at a joint, m past the node along this member. `face`: the
 * crossing beam's top or bottom corner — a top hook's tail meets the top corners, a bottom hook's
 * the bottom ones (absent: either). `clear`: the crossing beam ends at this joint and hooks its
 * bars down here too, so its tail stands on that line, parallel to this one's, and the two keep
 * the clear distance between parallel bars (§25.2.1) instead of a millimetre of contact.
 */
export interface CrossingSeat { at: number; diameterMm: number; face?: 'top' | 'bottom'; clear?: number }

/** The corner seats of a beam crossing a joint, for the bars and stirrups it holds or may hold. */
export function crossingSeats(o: { b: number; h: number; cover: number; stirrupDiasMm: readonly number[]; cornerDiasMm: readonly number[]; face?: 'top' | 'bottom'; clear?: number }): CrossingSeat[] {
  const out: CrossingSeat[] = [];
  for (const st of new Set(o.stirrupDiasMm)) for (const d of new Set(o.cornerDiasMm)) {
    if (!(d > 0) || !(st > 0)) continue;
    out.push({
      at: seatedLongitudinalHalfExtents(o.b, o.h, o.cover, st, d).corner.halfAcross, diameterMm: d,
      ...(o.face ? { face: o.face } : {}), ...(o.clear !== undefined ? { clear: o.clear } : {}),
    });
  }
  return out;
}

/** A beam's corner bar diameters on one face: that face's bars and the row its slots are laid at. */
export function faceCornerDiasOf(rebar: ProvidedReinforcement, face: 'top' | 'bottom'): number[] {
  const b = faceLayers(rebar, 'bottom'), s = faceLayers(rebar, 'topStart'), e = faceLayers(rebar, 'topEnd');
  const dia = (ls: RebarLayer[]) => Math.max(0, ...ls.map((l) => l.diameter));
  const count = (ls: RebarLayer[]) => ls.reduce((n, l) => n + l.count, 0);
  const groups = [b, s, e].map((ls) => ({ c: count(ls), d: dia(ls) }));
  const widest = Math.max(...groups.map((g) => g.c));
  const rowDia = Math.max(0, ...groups.filter((g) => g.c === widest).map((g) => g.d));
  const own = face === 'bottom' ? dia(b) : Math.max(dia(s), dia(e));
  return [...new Set([own, rowDia].filter((d) => d > 0))];
}

/** A beam's corner bar diameters: its bottom, its continuous top pair, the row its slots are laid at. */
export function cornerDiasOf(rebar: ProvidedReinforcement): number[] {
  const b = faceLayers(rebar, 'bottom'), s = faceLayers(rebar, 'topStart'), e = faceLayers(rebar, 'topEnd');
  const dia = (ls: RebarLayer[]) => Math.max(0, ...ls.map((l) => l.diameter));
  const count = (ls: RebarLayer[]) => ls.reduce((n, l) => n + l.count, 0);
  const groups = [b, s, e].map((ls) => ({ c: count(ls), d: dia(ls) }));
  const widest = Math.max(...groups.map((g) => g.c));
  const rowDia = Math.max(0, ...groups.filter((g) => g.c === widest).map((g) => g.d));
  return [...new Set([dia(b), Math.max(dia(s), dia(e)), rowDia].filter((d) => d > 0))];
}

/** What a bar has to do at the support. */
export interface SupportBar {
  diameterMm: number;
  /** `develop`: fy at the face; `embed`: §9.7.3.8's 150 mm; `none`: nothing to develop (a hanger). */
  need: 'develop' | 'embed' | 'none';
  /** `forbidden` for a bar in compression (§25.4.1.2); `requested` when the design asks for one. */
  hook: 'allowed' | 'requested' | 'forbidden';
  /** How far inboard of the outermost hook plane this bar's hook turns, m (nested rows). */
  inboard: number;
  /**
   * One row's step, m (`topRowInboard`): given, a nested row's hook turns that far inside the
   * row outside it AS THAT ROW STANDS, each clear of the crossing beams' bars in turn. Without
   * it the rows were offset by a fixed `inboard` from the outer plane and dodged the crossing
   * bars independently, and an outer row pushed inboard by a crossing bar landed 10 mm from the
   * row inside it instead of one bar and 25 mm.
   */
  rowStep?: number;
  /** The bar's face: which of a crossing beam's corners its hook's tail meets (`CrossingSeat.face`). */
  position?: 'top' | 'bottom';
  /** How far across its own axis the row's outermost bar stands, m: its corner seat. */
  outerAcross?: number;
  /** Development lengths for this bar, m. */
  ld: number;
  ldh: number;
  ldc: number;
  stress: 'tension' | 'compression';
}

export interface SupportEndPlan {
  /** How far past the node the bar's straight run goes, m (negative: short of the node). */
  along: number;
  /** A standard 90° hook at this end. */
  hook?: 90;
  /** The record the bar carries (`BarPath.anchorage`). */
  record: BarEndAnchorage;
  /** Straight length available past the near face, m. */
  availableStraight: number;
  /** Length available to a hook's outer edge past the near face, m. */
  availableHooked: number;
  /** Why the outcome is what it is: an i18n-free cause code. */
  cause: 'fits' | 'hookFits' | 'embedFits' | 'nothingToDevelop' | 'lineContinues'
    | 'noRoomStraightOrHooked' | 'noRoomForEmbed' | 'compressionNoRoom' | 'noColumn';
}

/**
 * A column's near and far faces at a beam's end, along the beam, from the beam's axis end.
 *
 * `half` is the column's half-extent along the beam (`run-detailing` and `beamSupportCage` take
 * half its smaller side); `rel` is the column's axis relative to the beam's axis end — the
 * column's declared insertion offset at the node less the beam's (`memberOffsetAt`), zero where
 * neither declares one; `w` the unit direction from that end into the span. A column centred on
 * the node gives `face = half` and no `far` (it is `face`), which is every model that declares
 * no insertion. One placed by its face toward the span (`rel·w = −half`) leaves the beam no
 * column at all on that side: its near face is at the node, `face = 0`.
 */
export function columnFacesAlong(
  half: number, rel: { x: number; y: number; z: number }, w: { x: number; y: number; z: number },
): { face: number; far?: number } {
  const s = rel.x * w.x + rel.y * w.y + rel.z * w.z;
  if (Math.abs(s) < 1e-9) return { face: half };
  return { face: Math.max(0, half + s), far: half - s };
}

/**
 * The outermost planes a bar may reach in the column, m past the node: a straight end inside the
 * ties, a hook's outer edge behind the column's bars with their clear distance.
 */
export function supportPlanes(cage: SupportCage): { straight: number; hook: number } {
  const ring = (cage.far ?? cage.face) - cage.cover - cage.tieDiaMm / 1000 - TIE_CLEARANCE_M;
  const colDb = cage.barDiaMm / 1000;
  const core = colDb > 0 ? ring + TIE_CLEARANCE_M - colDb - Math.max(0.040, 1.5 * colDb) : ring;
  return { straight: ring, hook: Math.min(ring, core) };
}

/** The end of a bar in a support, and what it develops there. Null with no column geometry. */
export function planSupportEnd(cage: SupportCage, bar: SupportBar): SupportEndPlan | null {
  if (!(cage.face > 0)) return null;
  const face = cage.face;
  const far = cage.far ?? face;
  const db = bar.diameterMm / 1000;
  const planes = supportPlanes(cage);
  const straightLimit = planes.straight - bar.inboard;
  // The tail's centre, inboard past every crossing corner bar it would pass through; rows nest
  // `inboard` inside the outer row's tail, wherever that ended.
  const crossing = [...(cage.crossing ?? [])].sort((p, q) => q.at - p.at);
  const clear = (x: number) => {
    for (const c of crossing) {
      if (c.face && bar.position && c.face !== bar.position) continue;
      // A crossing beam that ends here hooks its corner bar down at its own hook plane, at most
      // `planes.hook` less half its bar from the node across this beam: this row's tails run
      // beside that one (parallel, §25.2.1) only where its outermost bar reaches within the clear
      // of that plane. Elsewhere the tail only crosses the corner bar, in contact. Read as
      // parallel everywhere, a 20 cm beam's second-row tails in a 40 cm column were pushed past
      // the crossing corners to the column's centre, and its ldh was refused there.
      const parallel = c.clear !== undefined ? Math.max(c.clear, db, c.diameterMm / 1000) : 0;
      // A bottom tail turns up inside the top rows' (`bottomHookInboard`), so where the crossing
      // beam's stands is not read here: it is taken as beside.
      const beside = parallel > 0 && (bar.outerAcross === undefined || c.face === 'bottom'
        || bar.outerAcross + db / 2 + c.diameterMm / 2000 + parallel > planes.hook - c.diameterMm / 2000);
      const keep = c.diameterMm / 2000 + db / 2 + (beside ? parallel : 0.001);
      if (Math.abs(x - c.at) < keep) x = c.at - keep;
    }
    return x;
  };
  const nest = (x0: number) => {
    if (!(bar.rowStep && bar.rowStep > 0) || !(bar.inboard > 0)) return clear(x0 - bar.inboard);
    const rows = Math.round(bar.inboard / bar.rowStep);
    let x = x0;
    for (let k = 0; k < rows; k++) x = clear(x - bar.rowStep);
    return clear(x - (bar.inboard - rows * bar.rowStep));
  };
  const hookLimit = nest(clear(planes.hook - db / 2)) + db / 2;
  const availableStraight = face + straightLimit;
  const availableHooked = face + hookLimit;
  const support: BarEndAnchorage['support'] = cage.continues ? 'interior' : 'end';
  const base = { availableStraight, availableHooked };
  const pendingRule: BarEndAnchorage['rule'] = bar.need === 'develop' ? 'ld' : bar.need === 'embed' ? '9.7.3.8.2' : 'none';

  // A support the line continues past: the line's laps take the bar (`lap-materialize.ts`), and
  // what it must develop if none does is the same need, past the column's far face.
  if (cage.continues) {
    const required = bar.need === 'develop' ? (bar.stress === 'compression' ? bar.ldc : bar.ld) : bar.need === 'embed' ? SUPPORT_EMBED_M : 0;
    return {
      ...base, along: face, cause: 'lineContinues',
      record: { support, solution: 'pending', available: face + far, required, rule: pendingRule },
    };
  }
  const straight = (along: number, required: number, r: BarEndAnchorage['rule'], ok: SupportEndPlan['cause'], no: SupportEndPlan['cause']): SupportEndPlan => {
    const available = face + along;
    const holds = available >= required - 1e-9;
    return { ...base, along, cause: holds ? ok : no, record: { support, solution: holds ? 'straight' : 'unresolved', available, required, rule: r, endCover: far - along } };
  };
  if (bar.need === 'none' && bar.hook !== 'requested') return straight(straightLimit, 0, 'none', 'nothingToDevelop', 'nothingToDevelop');
  if (bar.stress === 'compression') return straight(straightLimit, bar.ldc, 'ld', 'fits', 'compressionNoRoom');
  // §9.7.3.8.2's 150 mm, and that is where the bar stops: on to the far face it would cross the
  // plane the top bars' hooks turn down in.
  if (bar.need === 'embed' && bar.hook !== 'requested') {
    return straight(Math.min(straightLimit, SUPPORT_EMBED_M - face), SUPPORT_EMBED_M, '9.7.3.8.2', 'embedFits', 'noRoomForEmbed');
  }
  if (bar.hook !== 'requested' && bar.ld <= availableStraight + 1e-9) return straight(straightLimit, bar.ld, 'ld', 'fits', 'fits');
  if (bar.hook === 'forbidden') return straight(straightLimit, bar.ld, 'ld', 'fits', 'noRoomStraightOrHooked');
  // A standard 90° hook whose outer edge stops at the hook plane: the bend inside the support.
  const r = standardHook(bar.diameterMm, 90, 'longitudinal').centrelineRadius;
  // Positive steel hooked where the design asks it (`anchorHook`) still owes the face only
  // §9.7.3.8's 150 mm: its ldh is measured from the critical section in the span, to the hook's
  // outer edge, and the design's region row holds it there (`continuingGroupsInto`, `bottomReach`).
  const [required, rule]: [number, BarEndAnchorage['rule']] = bar.need === 'embed' ? [SUPPORT_EMBED_M, '9.7.3.8.2']
    : bar.need === 'none' ? [0, 'none'] : [bar.ldh, 'ldh'];
  const holds = required <= availableHooked + 1e-9;
  return {
    ...base, along: hookLimit - r - db / 2, hook: 90, cause: holds ? (bar.need === 'develop' ? 'hookFits' : bar.need === 'embed' ? 'embedFits' : 'nothingToDevelop') : 'noRoomStraightOrHooked',
    record: { support, solution: holds ? 'hook' : 'unresolved', available: availableHooked, required, rule, endCover: far - hookLimit },
  };
}

// ─── The bars at a support, as the design states them ────────────

export interface BeamSection { b: number; h: number; cover: number; stirrupDia: number; fc: number; fy: number }

/** The layers of a face, from the design's own fields. */
export function faceLayers(rebar: ProvidedReinforcement, face: 'bottom' | 'topStart' | 'topEnd'): RebarLayer[] {
  const r = rebar.regions;
  if (face === 'bottom') return resolveLayers(r?.bottomSpanLayers, r?.bottomSpan ?? rebar.bottom);
  if (face === 'topStart') return resolveLayers(r?.topStartLayers, r?.topStart ?? rebar.top);
  return resolveLayers(r?.topEndLayers, r?.topEnd ?? rebar.top);
}

/**
 * ld, ldh and ldc for a bar of a face, as the verifier establishes them: Tabla 25.4.2.3's row from
 * the face's own layout (`favourableRowHolds`, both stirrup sets), ψt for top bars with more than
 * 300 mm of concrete below (§25.4.2.5), √f'c capped (§25.4.1.4).
 */
export function faceDevelopment(
  rebar: ProvidedReinforcement, section: BeamSection,
  face: 'bottom' | 'topStart' | 'topEnd', diameterMm: number, edition: RegulationEdition = '2025',
): { ld: number; ldh: number; ldc: number; favourable: boolean } {
  const layers = faceLayers(rebar, face);
  const stirrups: Array<StirrupDef | undefined> = [rebar.regions?.stirrupsSupport ?? rebar.stirrups, rebar.regions?.stirrupsSpan ?? rebar.stirrups];
  const pair = face === 'bottom' ? undefined : topOuterPair(layers, faceLayers(rebar, face === 'topStart' ? 'topEnd' : 'topStart'));
  const d = section.h - layerCentroid(layers, section.cover, section.stirrupDia, pair);
  const favourable = favourableRowHolds(layers, section, stirrups, d);
  const top = face !== 'bottom';
  const ld = requiredLd(diameterMm, section.fc, section.fy, {
    favourableSpacing: favourable,
    ...(top ? { concreteBelowM: concreteBelowTopBars(section.h, section.cover, section.stirrupDia, diameterMm) } : {}),
  });
  const ldh = deriveHookedDevelopment({ diameterMm, fy: section.fy, fc: section.fc, edition }).ldhM;
  const ldc = deriveCompressionDevelopment({ diameterMm, fy: section.fy, fc: section.fc, edition }).ldcM;
  return { ld, ldh, ldc, favourable };
}

/** One row of bars at a support: how many, of what, in which planned row. */
export interface SupportRow {
  position: 'top' | 'bottom';
  diameterMm: number;
  count: number;
  /** Planned row: 0 at the face, inward from there. */
  row: number;
  need: SupportBar['need'];
  hook: SupportBar['hook'];
  /** The continuous top pair (§25.7.1.2), part of the support's steel. */
  continuousPair?: boolean;
}

/**
 * The member's top slots and the fewest layers they fit in.
 *
 * One arrangement serves the whole member (`run-detailing` `coordinateBeamLayouts`): as many slots
 * as its widest group has bars, laid at that group's bar, in the fewest layers they fit or one
 * more where a joint is congested (`generateLayoutCandidates`, the same pitch: the code's clear
 * spacing plus the placement tolerance). Every candidate fills its slots layer by layer,
 * `ceil(slots / layers)` to a layer, layer 0 first, and a group takes the first slots of it.
 */
export function topLayout(
  rebar: ProvidedReinforcement,
  seat: { b: number; cover: number; stirrupDiaMm: number; edition: RegulationEdition; maxAggregateSizeMm: number },
): { slots: number; fewest: number } {
  const groups = [faceLayers(rebar, 'bottom'), faceLayers(rebar, 'topStart'), faceLayers(rebar, 'topEnd')]
    .map((ls) => ({ count: ls.reduce((n, l) => n + l.count, 0), dia: Math.max(0, ...ls.map((l) => l.diameter)) }));
  const count = Math.max(...groups.map((g) => g.count));
  if (count <= 0) return { slots: 0, fewest: 0 };
  const rowDia = Math.max(...groups.filter((g) => g.count === count).map((g) => g.dia));
  const d = rowDia / 1000;
  const clearWidth = Math.max(0.02, seat.b - 2 * (seat.cover + seat.stirrupDiaMm / 1000));
  const clear = minClearSpacingFor(seat.edition, 'beam', { barDiameterMm: rowDia, maxAggregateSizeMm: seat.maxAggregateSizeMm }).minClear
    + DEFAULT_TOLERANCES.placement;
  const capacity = clearWidth < d ? 1 : Math.max(1, Math.floor((clearWidth - d) / (d + clear)) + 1);
  return { slots: count, fewest: Math.ceil(count / capacity) };
}

/**
 * The deepest row a group of `n` top bars holds, laid in the first `n` of `slots` slots in
 * `layers` layers (`topLayout`): `floor((n − 1) / ceil(slots / layers))`. A layout the
 * coordination did not close lays the group on its own, fuller rows, never deeper.
 */
export function groupTopRow(n: number, slots: number, layers: number): number {
  if (n <= 0 || slots <= 0 || layers <= 0) return 0;
  return Math.floor((n - 1) / Math.ceil(Math.max(slots, n) / layers));
}

/**
 * The longitudinal bars that end in a support, as the detailing lays them from the design:
 *
 *   top — the continuous pair at the larger of the two supports' diameters, in the outer row,
 *     counting toward this support's group (`generate-beam`), then the rest of the group, in
 *     every row it can hold with the member's top bars in `layers` layers (`groupTopRow`);
 *     nothing to develop where the design put no top steel at this support;
 *   bottom — the bars continuing into the support: a third at a simple support, a quarter at any
 *     other (§9.7.3.8.1, §9.7.3.8.2), at least two, in the outer row; fy at the face for a member
 *     of the lateral system, otherwise 150 mm; hooked where the design asks for it.
 */
export function supportRows(
  rebar: ProvidedReinforcement, end: 'start' | 'end',
  opts: {
    simple: boolean; lateralSystem: boolean; bottomHookRequested: boolean; slots: number; layers: number;
    /** The rule the slots' pitch follows, for a group of larger bars than the row's (below). */
    pitch?: { edition: RegulationEdition; maxAggregateSizeMm: number };
  },
): SupportRow[] {
  const rows: SupportRow[] = [];
  const own = faceLayers(rebar, end === 'start' ? 'topStart' : 'topEnd');
  const other = faceLayers(rebar, end === 'start' ? 'topEnd' : 'topStart');
  const ownCount = own.reduce((n, l) => n + l.count, 0);
  const ownDia = Math.max(0, ...own.map((l) => l.diameter));
  const pairDia = Math.max(ownDia, ...other.map((l) => l.diameter));
  const need: SupportRow['need'] = ownCount > 0 ? 'develop' : 'none';
  if (pairDia > 0) rows.push({ position: 'top', diameterMm: pairDia, count: CONTINUOUS_TOP_BARS, row: 0, need, hook: 'allowed', continuousPair: true });
  const rest = Math.max(0, ownCount - CONTINUOUS_TOP_BARS);
  // How deep a group of `n` bars of `dia` goes in the member's row: its first slots, or, for bars
  // larger than the row's, every `step`-th slot of a layer and the rest a layer down (`pickLegal`).
  const groupsAll = [faceLayers(rebar, 'bottom'), own, other].map((ls) => ({ count: ls.reduce((n, l) => n + l.count, 0), dia: Math.max(0, ...ls.map((l) => l.diameter)) }));
  const deepestOf = (n: number, dia: number): number => {
    // The layers below the first may hold a slot fewer than it (the threaded rows fill the first
    // as the seats allow, `generateLayoutCandidates`), so a group is read as deep as their count.
    const thinnest = opts.layers > 1 ? Math.max(1, Math.floor(opts.slots / opts.layers)) : Math.max(1, opts.slots);
    let deepest = Math.max(groupTopRow(n, opts.slots, opts.layers), n > 0 ? Math.min(opts.layers - 1, Math.floor((n - 1) / thinnest)) : 0);
    if (opts.pitch && opts.slots > 0 && opts.layers > 0) {
      const widest = Math.max(...groupsAll.map((g) => g.count));
      const rowDia = Math.max(0, ...groupsAll.filter((g) => g.count === widest).map((g) => g.dia));
      const pitchOf = (d: number) => d / 1000 + minClearSpacingFor(opts.pitch!.edition, 'beam', { barDiameterMm: d, maxAggregateSizeMm: opts.pitch!.maxAggregateSizeMm }).minClear + DEFAULT_TOLERANCES.placement;
      if (dia > rowDia && rowDia > 0) {
        const perLayer = Math.ceil(opts.slots / opts.layers);
        const step = Math.ceil(pitchOf(dia) / pitchOf(rowDia) - 1e-9);
        const usable = Math.max(1, Math.floor((perLayer - 1) / step) + 1);
        deepest = Math.max(deepest, Math.ceil(n / usable) - 1);
      }
    }
    return deepest;
  };
  if (rest > 0) {
    // A row is laid at its widest group's bar (`beamRow`); a group of larger bars cannot take
    // neighbouring slots, only every `step`-th, and the generator lays the rest a layer down
    // (`pickLegal`). Read as filling its first slots, a 6Ø20 group in a 7-slot Ø12 row was checked
    // in one row and built in two: its second row's hooks short of ldh (the 408-member frame,
    // e262 and e265, 33,4 cm of 36,8).
    const deepest = deepestOf(ownCount, ownDia);
    for (let r = 0; r <= deepest; r++) rows.push({ position: 'top', diameterMm: ownDia, count: rest, row: r, need: 'develop', hook: 'allowed' });
  }
  const bottom = faceLayers(rebar, 'bottom');
  const bottomCount = bottom.reduce((n, l) => n + l.count, 0);
  if (bottomCount > 0) {
    const continuing = Math.min(bottomCount, Math.max(2, Math.ceil(bottomCount * (opts.simple ? 1 / 3 : 1 / 4))));
    const dia = Math.max(...bottom.map((l) => l.diameter));
    const need: SupportRow['need'] = opts.lateralSystem ? 'develop' : 'embed';
    const hook: SupportRow['hook'] = opts.lateralSystem || opts.bottomHookRequested ? 'requested' : 'allowed';
    rows.push({ position: 'bottom', diameterMm: dia, count: continuing, row: 0, need, hook });
    // The upper bottom layers: their bars reach the support wherever the detailing finds no
    // cut-off point for them, and end there as the outer layer's do, a hook inside the one below.
    const upper = new Map<number, number>();
    for (const l of bottom) if ((l.row ?? 0) > 0) upper.set(l.row!, (upper.get(l.row!) ?? 0) + l.count);
    // And the layers the member's row lays them in, where it lays them deeper than the design's
    // rows (`deepestOf`): their ends are built there, and are checked there.
    for (let r = 1; r <= deepestOf(bottomCount, dia); r++) if (!upper.has(r)) upper.set(r, bottomCount);
    for (const [row, count] of [...upper].sort((a, b) => a[0] - b[0])) rows.push({ position: 'bottom', diameterMm: dia, count, row, need, hook });
  }
  return rows;
}

/**
 * How far inside its face's first row a support row's bars of `diameterMm` stand, m, as the
 * generator lays them (`stackedLayerDepth`): each row stepped from the largest bar of the rows
 * above it, the continuous pair's among them. `seat(d)`: a bar's centre depth in the first row.
 */
export function supportRowInto(
  rows: readonly SupportRow[], position: 'top' | 'bottom', row: number, diameterMm: number,
  seat: (dMm: number) => number, edition: RegulationEdition,
): number {
  const dias: number[][] = [];
  for (const r of rows) if (r.position === position && r.row <= row) (dias[r.row] ??= []).push(r.diameterMm);
  for (let k = 0; k < dias.length; k++) dias[k] ??= [];
  return stackedLayerDepth(dias, row, diameterMm, seat, edition) - seat(diameterMm);
}

/** The top rows at a support (`supportRows`): the rows the bottom hooks turn inside of. */
export const topRowsOf = (rows: readonly SupportRow[]): number =>
  Math.max(1, ...rows.filter((r) => r.position === 'top').map((r) => r.row + 1));

/** How far inboard a top row's hooks turn, m: one bar and the §25.2.2 layer clearance a row. */
export const topRowInboard = (row: number, diameterMm: number, layerClear: number) => row * (diameterMm / 1000 + layerClear);
/** A bottom hook turns inside every top row's hooks at the same support. */
export const bottomHookInboard = (topRows: number, topDiaMm: number, layerClear: number) => topRows * (topDiaMm / 1000 + layerClear);

/**
 * §9.7.3.8.3 at a point of inflection (b): ld of the positive steel at most Mn/Vu + ℓa, with ℓa
 * the embedment past the point, limited to the larger of d and 12·db. The bars continuing into
 * the support run past it, so ℓa takes that limit. Mn with all that steel at fy.
 */
export function inflectionAnchorage(input: {
  ld: number; asCm2: number; fy: number; fc: number; b: number; d: number; diameterMm: number; vu: number;
}): { holds: boolean; limit: number; mnKNm: number; la: number } {
  const as = input.asCm2 / 1e4;
  const a = as * input.fy / (0.85 * input.fc * input.b);
  const mnKNm = as * input.fy * 1000 * (input.d - a / 2);
  const la = Math.max(input.d, 12 * input.diameterMm / 1000);
  const limit = input.vu > 1e-9 ? mnKNm / input.vu + la : Number.POSITIVE_INFINITY;
  return { holds: input.ld <= limit + 1e-9, limit, mnKNm, la };
}

/**
 * Which of two crossing beams that both end at a joint gives way where their hook tails meet:
 * the one whose axis lies nearer the global y axis (the cross product breaking a tie), so the
 * design and the detailing, reading the same two axes, give way alike.
 */
export function yieldsTo(own: { x: number; y: number }, other: { x: number; y: number }): boolean {
  const a = Math.abs(own.y) / (Math.hypot(own.x, own.y) || 1);
  const b = Math.abs(other.y) / (Math.hypot(other.x, other.y) || 1);
  if (Math.abs(a - b) > 1e-9) return a > b;
  return own.x * other.y - own.y * other.x > 0;
}
