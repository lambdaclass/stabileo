/**
 * The SceneModel: the 3-D view as a PROJECTION of the document, not a second reading of it.
 *
 * ── Why this module exists at all ──────────────────────────────────
 *
 * `DocumentModel` was built on one rule: a report, a drawing set and a schedule of the same
 * floor are three renderings of ONE statement about the structure, so they are assembled
 * once and projected three ways. Anything absent from the model cannot appear in an output,
 * and anything in it appears in all of them consistently.
 *
 * A 3-D view of the reinforcement is a fourth rendering of that same statement, and it was
 * about to be built the way such views usually are: by walking the store, reading bars off
 * whatever assembly happened to be selected, and drawing tubes. That produces a picture that
 * is *nearly* the drawing — right until the day it is not, and then nobody can say which of
 * the two is lying. The failure is silent and it is discovered on site.
 *
 * So the scene is a projection like the other three. It reads the document and only the
 * document, it samples each bar with `samplePath` — the SAME function the elevations and the
 * clash check call, at the same chord tolerance — and it carries the marks the schedule
 * prints. What you orbit is what you dimension is what you order.
 *
 * ── What it deliberately does not do ───────────────────────────────
 *
 * It computes no engineering. Not a bar position, not a clearance, not a bend radius. Every
 * number here was decided upstream by a generator or a coordinator and is copied. A scene
 * builder that re-derived so much as a hook radius would be a second opinion, and two
 * opinions about one hook is how a drawing and a model come to disagree.
 *
 * Pure: no store, no runes, no i18n, no Three.js, no DOM. The renderer is a separate module
 * so this one stays testable and so a non-WebGL consumer — a snapshot test, an exporter —
 * can read the same scene.
 */

import { samplePath, type BarPath, type BarRole, type Point3 }
  from '../../codes/cirsoc201/bar-geometry';
import { msg, type EngineMessage } from '../../codes/message';
import type { DocumentAssembly, DocumentModel, DocumentReadiness, OpenConflict }
  from './document-model';
import {
  footingPlanCentre, isFootingRecord, isSlabRecord, isWallRecord,
  type FloorFamily, type FloorFamilyDesignRecord,
} from './family-record';

// ─── Bars ────────────────────────────────────────────────────────

/**
 * One bar, ready to draw, with everything the UI needs to identify it back to the user.
 *
 * The identity fields are not decoration. A user who clicks a bar in the 3-D view and is
 * told "Ø16" has learnt nothing; a user told "B7, Ø16, 4,85 m, members 184 and 185" can find
 * that bar on the elevation, on the schedule and in the bundle that arrives on site. That
 * round trip is the whole reason the view reads the document.
 */
export interface SceneBar {
  barId: string;
  /**
   * The schedule mark, e.g. `B7`.
   *
   * Optional because marks are assigned per assembly and a bar can reach the document before
   * its assembly has been marked. Absent means "not marked yet", which the UI shows as such
   * rather than inventing a mark that the schedule would then contradict.
   */
  mark?: string;
  diameterMm: number;
  role: BarRole;
  /** Physical layer identity, e.g. `e184:bottom:0`. Absent on bars that predate the field. */
  layerId?: string;
  assemblyId: string;
  /** Members this bar belongs to. A continuous bar over a support belongs to both. */
  elementIds: number[];
  /** The floor family that owns it, when one does. Beam and column steel has none. */
  family?: FloorFamily;
  /**
   * Which id space `elementIds` is expressed in.
   *
   * ── The collision this exists to stop ──────────────────────────
   *
   * Frame members and shell elements are numbered independently and both start at 1. The
   * 7-storey building has frame elements 1…203 and quads 1…77, so EVERY quad id is also a
   * frame element id. A slab bar reporting `ownerElementIds: [1]` means panel 1; a column bar
   * reporting the same means column 1; and nothing in the number distinguishes them.
   *
   * Measured before this field existed: 11 340 slab bars and 234 wall bars were counted as
   * steel belonging to columns. A column with no reinforcement of its own was reported
   * MODELLED because a slab bar had claimed its number — the exact failure the honest-status
   * work was built to prevent, reintroduced through an id.
   *
   * `frame` for beam and column steel; `family` for slab, wall and footing steel, whose ids
   * name panels, walls and footings.
   */
  ownerScope: 'frame' | 'family';
  /**
   * Set when this bar belongs to a PROPOSAL rather than a certified design.
   *
   * Carried into the scene verbatim from the document, so the viewport can colour it and the
   * legend can name it. The 3-D view must not hide a provisional member — hiding it is the
   * state that was already wrong — and must not draw it like a verified one either.
   */
  provisional?: 'biaxial';
  /**
   * Set when the engineer PINNED this bar — `BarPath.locked`.
   *
   * ── Why the viewer has to carry it ─────────────────────────────
   *
   * A pin is not a note the detailing panel keeps to itself. `runDetailing` receives
   * `lockedBars` and never regenerates them, and the repair loop receives every member a
   * pinned bar owns and never repairs those. So a pinned bar is a bar the rest of the pipeline
   * has been told to leave alone, and a reader inspecting the cage in 3-D — which is where a
   * continuous bar's second owner is actually visible — could not see which bars those were.
   *
   * Carried verbatim, like `provisional` above and for the same reason: the panel, the viewer
   * and the engines then read one fact instead of forming three opinions about it. Absent on
   * ordinary bars, which is almost all of them.
   */
  locked?: boolean;
  /**
   * What the bar is FOR, carried verbatim from the document — see `BarPath.purpose`.
   *
   * Absent means resistant reinforcement. `stirrupHanger` means the bar exists because
   * §25.7.1.2 requires one in the stirrup's bend and NOT because a moment was resisted by it,
   * so the viewport may not present it as it presents designed steel.
   */
  purpose?: 'stirrupHanger';
  /**
   * What KIND of piece this is, beyond longitudinal-or-transverse.
   *
   * ── Why `role` was not enough ──────────────────────────────────
   *
   * A 7-storey building's cage contains 1 444 closed ties and 6 768 crossties, and `role`
   * calls all 8 212 of them "transverse". On screen they became one orange thicket, and the
   * first QA reading was "these do not look like stirrups" — which was fair, because a closed
   * hoop and a single-leg crosstie with a hook at each end are different pieces doing
   * different jobs under different sub-clauses, and nothing distinguished them.
   *
   * Read from the producer's own naming rather than re-derived from geometry: the generators
   * name what they built, and inferring "is this a hoop" from a polyline is exactly the kind
   * of second opinion this module exists to avoid.
   */
  piece: 'longitudinal' | 'closedTie' | 'crosstie' | 'jointTie' | 'jointCrosstie' | 'stirrup';
  /**
   * The centreline, sampled in model coordinates, m.
   *
   * From `samplePath` at its default chord tolerance, so a hook is an arc of the correct
   * radius rather than a right angle — the same polyline the elevation draws and the
   * collision checker measures.
   */
  polyline: Point3[];
  /** Developed length including bends and hooks, m. The schedule's number, copied. */
  cuttingLength: number;
  /** True when this bar is named by an unresolved conflict. */
  conflicted: boolean;
}

/**
 * Which piece a bar is, from the id its generator gave it.
 *
 * The naming is the producers' contract with the schedule and the drawings — `col-<id>:ties`
 * for a column's own cage, `joint-<node>:ties` for the cage inside a beam-column joint,
 * `crosstie` for a single-leg piece — so reading it here keeps one vocabulary across the
 * schedule, the sheets and the view. A transverse piece whose id matches nothing known is
 * reported as a generic stirrup rather than guessed at.
 */
export function classifyPiece(bar: BarPath): SceneBar['piece'] {
  if (bar.role !== 'transverse') return 'longitudinal';
  const id = bar.id;
  const joint = id.startsWith('joint-');
  if (id.includes('crosstie')) return joint ? 'jointCrosstie' : 'crosstie';
  if (joint) return 'jointTie';
  if (id.startsWith('col-')) return 'closedTie';
  return 'stirrup';
}

// ─── Concrete ────────────────────────────────────────────────────

export type SceneSolidKind = 'beam' | 'column' | 'footing' | 'pedestal' | 'slab' | 'wall';

/**
 * Every concrete family, in one place.
 *
 * The layer switches, the renderer's batches and the tally all enumerate these, and three
 * copies of the same six strings is three chances for one of them to drift — a family missing
 * from the renderer's list would batch its bars as unknown and quietly stop answering its own
 * switch. Order is the order the switches present them, which is also the order the batches
 * are built in, so the two read the same way.
 */
export const SCENE_SOLID_KINDS: readonly SceneSolidKind[] = [
  'column', 'beam', 'slab', 'wall', 'footing', 'pedestal',
];

/**
 * A piece of concrete, as a prism.
 *
 * One shape covers every member this app details — a rectangular section swept along an
 * axis, a pad swept up through its thickness, a panel swept through its depth — so the
 * renderer has one case to handle and a new member type needs no new geometry kind.
 */
export interface SceneSolid {
  id: string;
  kind: SceneSolidKind;
  /**
   * The assembly this concrete belongs to, when one does.
   *
   * Absent for a member that no assembly claims — which is precisely the member whose design
   * was refused. It has concrete and no steel, and it must still appear.
   */
  assemblyId?: string;
  elementIds: number[];
  /** Closed base polygon in model coordinates, m. Never repeats the first point. */
  base: Point3[];
  /** Sweep from the base to the far face, m. */
  extrude: Point3;
  label: EngineMessage;
  /**
   * Whether any bar in this scene sits inside this concrete.
   *
   * ── The bug this field exists to end ───────────────────────────
   *
   * A member whose design was refused carries no reinforcement, so it joins no assembly, so
   * the document never mentions it, so the 3-D view drew nothing at all: `rc-qa-diagnostic`
   * showed 22 of its 26 members and the four the app could not design were simply ABSENT.
   * The user was left to notice a gap in a picture of a frame they had never seen complete.
   *
   * Hiding a failure is the worst thing a view of a design can do. So the concrete is drawn
   * either way and this flag says which it is; the renderer marks it and the panel names the
   * member and why it has no steel.
   */
  reinforced: boolean;
}

/**
 * A member's concrete, as the caller must supply it.
 *
 * ── Why this is an input rather than something read from the document ──
 *
 * Because the document does not contain it. Footings, slabs and walls carry a full geometry
 * snapshot on their design record — B, L, thickness, founding elevation, origin, span — and
 * those solids are built here from authoritative data. Beams and columns carry no such
 * snapshot: the elevation renderer frames them by taking the BOUNDING BOX OF THE STEEL,
 * which is honest for a drawing that only needs a frame and would be a lie in 3-D, where a
 * box drawn round the stirrups is not the beam.
 *
 * The alternative was to have this module reach into the model store for sections. That
 * would make a pure projection depend on live state and, worse, would let the scene show a
 * section that had been edited since the steel was designed — concrete from now wrapped
 * round bars from before, with nothing to reveal it.
 *
 * So the caller passes what it has, this module resolves it by `elementId`, and every member
 * it cannot resolve is REPORTED in `unresolvedMembers`. A missing beam is visible as a
 * missing beam.
 */
export interface MemberGeometry {
  elementId: number;
  kind: 'beam' | 'column';
  /** Member axis endpoints in model coordinates, m. */
  start: Point3;
  end: Point3;
  /** Section dimensions across the axis, m. */
  width: number;
  depth: number;
  /** Rotation of the section about the member axis, degrees. */
  rollDeg?: number;
}

// ─── Conflicts ───────────────────────────────────────────────────

/**
 * An unresolved conflict, placed in space.
 *
 * The document already carries these with everything an engineer needs to act; this adds
 * nothing to them except that it is now somewhere you can look at. A conflict listed in a
 * note at the bottom of a sheet is a sentence to decode. The same conflict as a marker
 * floating between the two bars that caused it is a thing to point at.
 */
export interface SceneConflictMarker {
  assemblyId: string;
  at: Point3;
  barIds: [string, string];
  /** Measured surface distance, m. Negative means interpenetration. */
  clearance: number;
  /** What the rule demanded, m. */
  required: number;
  /** How far short, m. */
  shortfall: number;
  /** `overlap` is interpenetration; `clearance` is a shortfall against a spacing rule. */
  severity: 'overlap' | 'clearance' | 'marginal';
  pairClass: string;
  /**
   * The members the two bars belong to.
   *
   * Carried so a marker picked in the viewport can name its PARENT without a second lookup
   * into the document. "Bar c12-4 and bar b31-2, 14 mm apart against 25 mm required" is a
   * measurement; "…in beam 88 at the joint with column 12" is something an engineer can go
   * and look at.
   */
  elementIds: number[];
}

// ─── The scene ───────────────────────────────────────────────────

/** The distinct values present, so a filter UI offers what exists and nothing else. */
export interface SceneFacets {
  assemblies: Array<{ id: string; label: EngineMessage; barCount: number }>;
  families: FloorFamily[];
  roles: BarRole[];
  layers: string[];
}

export interface SceneBounds { min: Point3; max: Point3 }

export interface SceneModel {
  /** Carried so the view can state which document it is showing, like every other output. */
  seriesId: string;
  revision: number;
  /**
   * What this document may claim.
   *
   * The 3-D view shows it for the same reason the drawings carry a watermark: a conflicted
   * floor rendered as a clean cage is the most persuasive wrong picture this app can
   * produce.
   */
  readiness: DocumentReadiness;
  bars: SceneBar[];
  solids: SceneSolid[];
  conflicts: SceneConflictMarker[];
  facets: SceneFacets;
  /** Null when the scene is empty; a camera cannot frame nothing. */
  bounds: SceneBounds | null;
  /**
   * Members whose concrete the caller did not supply, ascending.
   *
   * Reported rather than skipped. Steel floating with no member round it is a question the
   * user must be allowed to ask.
   */
  unresolvedMembers: number[];
  /**
   * Members drawn with concrete but carrying no steel, ascending.
   *
   * The scene states the FACT — this member has no reinforcement in this document. It does
   * not state the cause, because the cause is a design outcome and this module reads only the
   * document. The panel joins these ids to their outcomes and reports the reason, which keeps
   * the projection pure and still gets the user a complete answer.
   */
  unreinforcedMembers: number[];
  /**
   * Members whose steel in THIS document is a proposal, ascending.
   *
   * The counterpart of `unreinforcedMembers`: that list answers "which members have no steel",
   * this one answers "which members have steel you may not build from". A viewer that shows
   * one and not the other still leaves the user unable to tell a finished cage from an
   * unfinished one.
   */
  provisionalMembers: number[];
  /**
   * Members carrying torsion no check in this application evaluates, ascending.
   *
   * A third list beside the other two, and a third kind of incompleteness: `unreinforcedMembers`
   * is "no steel", `provisionalMembers` is "steel you may not build from", and this is "steel
   * that may be right and was never checked against an action the model says is there".
   *
   * The geometry stays. A member with unevaluated torsion is drawn exactly as it would be
   * otherwise, keeps its proposal if it has one, and is named here so the viewer can warn about
   * it. Hiding it, or turning it into a failure, would take away the picture the engineer needs
   * in order to make the judgement the application is declining to make for them.
   */
  torsionUnevaluatedMembers: number[];
}

export interface SceneOptions {
  /** Member concrete, by element. Absent members land in `unresolvedMembers`. */
  members?: readonly MemberGeometry[];
}

// ─── Building ────────────────────────────────────────────────────

function rectBase(
  centre: { x: number; y: number }, z: number, bx: number, by: number, rotDeg: number,
): Point3[] {
  const t = (rotDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const hx = bx / 2;
  const hy = by / 2;
  return ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as const).map(([u, v]) => ({
    x: centre.x + u * c - v * s,
    y: centre.y + u * s + v * c,
    z,
  }));
}

/**
 * A prismatic member's base rectangle, in the plane normal to its own axis.
 *
 * Built from a frame rather than from world axes because a column is vertical and a beam is
 * not, and a single hard-coded "extrude in z" would put every beam's section in the wrong
 * plane. `up` is the world vertical unless the member IS vertical, in which case there is no
 * projection of it onto the section plane and the global x axis stands in — the same
 * degenerate case every framing convention has to name, made explicit here rather than
 * producing a zero-length cross product and a NaN.
 */
function memberBase(m: MemberGeometry): { base: Point3[]; extrude: Point3 } {
  const ax = { x: m.end.x - m.start.x, y: m.end.y - m.start.y, z: m.end.z - m.start.z };
  const len = Math.hypot(ax.x, ax.y, ax.z) || 1;
  const n = { x: ax.x / len, y: ax.y / len, z: ax.z / len };

  const vertical = Math.abs(n.z) > 0.999;
  const ref = vertical ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  // u = ref × n, normalised; v = n × u. Right-handed and orthonormal by construction.
  let u = {
    x: ref.y * n.z - ref.z * n.y,
    y: ref.z * n.x - ref.x * n.z,
    z: ref.x * n.y - ref.y * n.x,
  };
  const ul = Math.hypot(u.x, u.y, u.z) || 1;
  u = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
  const v = {
    x: n.y * u.z - n.z * u.y,
    y: n.z * u.x - n.x * u.z,
    z: n.x * u.y - n.y * u.x,
  };

  const t = ((m.rollDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const hw = m.width / 2;
  const hd = m.depth / 2;
  const base = ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const).map(([a, b]) => {
    const p = a * c - b * s;
    const q = a * s + b * c;
    return {
      x: m.start.x + u.x * p + v.x * q,
      y: m.start.y + u.y * p + v.y * q,
      z: m.start.z + u.z * p + v.z * q,
    };
  });
  return { base, extrude: ax };
}

/**
 * Every solid a floor-family record describes.
 *
 * Returns an array because a footing with a pedestal is two prisms, and because a record
 * that describes no placeable geometry returns none rather than a degenerate box.
 */
function familySolids(
  rec: FloorFamilyDesignRecord, assemblyId: string, bars: readonly BarPath[],
): SceneSolid[] {
  /**
   * Did this record actually place steel?
   *
   * A footing whose ground states no bearing capacity gets a record, real dimensions and no
   * bars. Drawing its concrete and saying nothing would present an unverified foundation as
   * a finished one.
   */
  const placed = rec.barIds.length > 0;

  if (isFootingRecord(rec)) {
    const g = rec.geometry;
    const centre = footingPlanCentre(rec, bars);
    const out: SceneSolid[] = [{
      id: `footing:${g.footingId}`,
      kind: 'footing',
      assemblyId,
      elementIds: g.footingId >= 0 ? [g.footingId] : [],
      base: rectBase(centre, g.foundingElevation, g.B, g.L, g.rotationDeg),
      extrude: { x: 0, y: 0, z: g.thickness },
      label: msg('detailing.scene.solid.footing', { name: g.name }),
      reinforced: placed,
    }];
    if (g.pedestal) {
      out.push({
        id: `pedestal:${g.footingId}`,
        kind: 'pedestal',
        assemblyId,
        elementIds: [],
        base: rectBase(
          centre, g.foundingElevation + g.thickness,
          g.pedestal.B, g.pedestal.L, g.rotationDeg),
        extrude: { x: 0, y: 0, z: g.pedestal.height },
        label: msg('detailing.scene.solid.pedestal', { name: g.name }),
        reinforced: placed,
      });
    }
    return out;
  }

  if (isSlabRecord(rec)) {
    const g = rec.geometry;
    return [{
      id: `slab:${g.panelId}`,
      kind: 'slab',
      assemblyId,
      elementIds: [],
      base: [
        { x: g.origin.x, y: g.origin.y, z: g.origin.z },
        { x: g.origin.x + g.lx, y: g.origin.y, z: g.origin.z },
        { x: g.origin.x + g.lx, y: g.origin.y + g.ly, z: g.origin.z },
        { x: g.origin.x, y: g.origin.y + g.ly, z: g.origin.z },
      ],
      // Downwards: `origin.z` is the panel's reference surface and the slab hangs below it.
      extrude: { x: 0, y: 0, z: -g.thickness },
      label: msg('detailing.scene.solid.slab', { name: g.panelId }),
      reinforced: placed,
    }];
  }

  if (isWallRecord(rec)) {
    const g = rec.geometry;
    const d = { x: g.end.x - g.start.x, y: g.end.y - g.start.y };
    const len = Math.hypot(d.x, d.y) || 1;
    // Thickness is measured across the wall line, in plan.
    const nx = -d.y / len;
    const ny = d.x / len;
    const h = g.thickness / 2;
    return [{
      id: `wall:${g.wallId}`,
      kind: 'wall',
      assemblyId,
      elementIds: [],
      base: [
        { x: g.start.x + nx * h, y: g.start.y + ny * h, z: g.start.z },
        { x: g.end.x + nx * h, y: g.end.y + ny * h, z: g.start.z },
        { x: g.end.x - nx * h, y: g.end.y - ny * h, z: g.start.z },
        { x: g.start.x - nx * h, y: g.start.y - ny * h, z: g.start.z },
      ],
      extrude: { x: 0, y: 0, z: g.height },
      label: msg('detailing.scene.solid.wall', { name: g.wallId }),
      reinforced: placed,
    }];
  }

  return [];
}

/** Which family, if any, owns each bar in this assembly. */
function familyOfBar(a: DocumentAssembly): Map<string, FloorFamily> {
  const out = new Map<string, FloorFamily>();
  for (const rec of a.families) for (const id of rec.barIds) out.set(id, rec.family);
  return out;
}

/**
 * Project a document into a scene.
 *
 * Deterministic and free of the clock. Bars come out in document order — which is generator
 * order, not sorted — because that order is already stable across runs and re-sorting here
 * would give the view a different bar sequence from the schedule for no gain.
 */
export function buildSceneModel(doc: DocumentModel, opts: SceneOptions = {}): SceneModel {
  const byElement = new Map<number, MemberGeometry>();
  for (const m of opts.members ?? []) byElement.set(m.elementId, m);

  const conflictedBars = new Set<string>();
  for (const c of doc.openConflicts) {
    conflictedBars.add(c.barIds[0]);
    conflictedBars.add(c.barIds[1]);
  }

  const bars: SceneBar[] = [];
  const solids: SceneSolid[] = [];
  const wantedMembers = new Set<number>();
  const resolvedMembers = new Set<number>();
  const assemblyOfMember = new Map<number, string>();

  for (const a of doc.assemblies) {
    const markOf = new Map<string, string>();
    for (const m of a.source.marks) for (const id of m.barIds) markOf.set(id, m.mark);
    const familyOf = familyOfBar(a);

    for (const bar of a.bars) {
      bars.push({
        barId: bar.id,
        mark: markOf.get(bar.id),
        diameterMm: bar.diameterMm,
        role: bar.role,
        layerId: bar.layerId,
        assemblyId: a.id,
        elementIds: [...bar.ownerElementIds],
        family: familyOf.get(bar.id),
        // A floor family's bars name panels, walls and footings; frame bars name members.
        ownerScope: familyOf.get(bar.id) ? 'family' : 'frame',
        piece: classifyPiece(bar),
        polyline: samplePath(bar),
        cuttingLength: bar.cuttingLength,
        conflicted: conflictedBars.has(bar.id),
        provisional: bar.provisional,
        // `|| undefined` rather than the raw flag: `locked: false` on 20 917 scene bars is
        // 20 917 fields carrying no information, and the field's meaning is "set when pinned".
        locked: bar.locked || undefined,
        purpose: bar.purpose,
      });
    }

    for (const rec of a.families) solids.push(...familySolids(rec, a.id, a.bars));

    /**
     * Which assembly each member belongs to, for the solids built below.
     *
     * `a.elementIds` is what the assembly claims to span, so it — not the bars' owners — is
     * what decides membership. A beam line whose middle span was never detailed still owns
     * that member, and the user is entitled to see it rather than to see a two-span beam and
     * assume three.
     */
    for (const id of a.elementIds) {
      wantedMembers.add(id);
      if (!assemblyOfMember.has(id)) assemblyOfMember.set(id, a.id);
    }
  }

  /**
   * One solid per member the caller supplied, whether or not a document mentions it.
   *
   * Built from the CALLER's list rather than from the assemblies, because the members that
   * matter most here are exactly the ones no assembly claims: those whose design was refused.
   * Iterating the assemblies could never reach them, which is why they were invisible.
   */
  /**
   * Frame steel only, keyed by member.
   *
   * `ownerScope` is what makes this safe: including family bars would credit a column with a
   * slab panel that happens to share its number, and the whole point of `reinforced` is to be
   * the one field a user can trust about whether a member has steel in it.
   */
  const barsOfElement = new Set(
    bars.filter((b) => b.ownerScope === 'frame').flatMap((b) => b.elementIds));
  for (const m of opts.members ?? []) {
    wantedMembers.add(m.elementId);
    resolvedMembers.add(m.elementId);
    const { base, extrude } = memberBase(m);
    solids.push({
      id: `member:${m.elementId}`,
      kind: m.kind,
      assemblyId: assemblyOfMember.get(m.elementId),
      elementIds: [m.elementId],
      base,
      extrude,
      label: msg('detailing.scene.solid.member', { id: m.elementId }),
      reinforced: barsOfElement.has(m.elementId),
    });
  }

  const conflicts: SceneConflictMarker[] = doc.openConflicts.map((c: OpenConflict) => ({
    assemblyId: c.assemblyId,
    at: { x: c.at.x, y: c.at.y, z: c.at.z },
    barIds: [c.barIds[0], c.barIds[1]],
    clearance: c.clearance,
    required: c.required,
    shortfall: c.shortfall,
    severity: c.severity,
    pairClass: c.pairClass,
    elementIds: [...c.elementIds],
  }));

  return {
    seriesId: doc.seriesId,
    revision: doc.revision.number,
    readiness: doc.readiness,
    bars,
    solids,
    conflicts,
    facets: buildFacets(doc, bars),
    bounds: boundsOf(bars, solids),
    unresolvedMembers: [...wantedMembers].filter((id) => !resolvedMembers.has(id))
      .sort((x, y) => x - y),
    unreinforcedMembers: solids
      .filter((s) => !s.reinforced && (s.kind === 'beam' || s.kind === 'column'))
      .flatMap((s) => s.elementIds)
      .sort((x, y) => x - y),
    provisionalMembers: provisionalMembersOf(doc),
    torsionUnevaluatedMembers: torsionUnevaluatedOf(doc),
  };
}

/**
 * Members the DOCUMENT declares to carry unevaluated torsion, ascending and unique.
 *
 * Read from the assemblies' own record for the same reason `provisionalMembersOf` is: it is a
 * statement the detailing run made once, and re-deriving it here would be a second opinion
 * about which members the warning applies to.
 */
function torsionUnevaluatedOf(doc: DocumentModel): number[] {
  const out = new Set<number>();
  for (const a of doc.assemblies) {
    for (const id of a.source.torsionUnevaluatedMembers ?? []) out.add(id);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Members the DOCUMENT declares provisional, ascending and unique.
 *
 * Read from the assemblies' own record rather than inferred from which bars carry the mark.
 * Inferring it counted 202 members on the 7-storey building against 117 provisional beams,
 * because a bar continuous over a support belongs to the column it passes through as well as
 * to the beam it was designed for. The bar is correctly marked in both; the COLUMN's design
 * is certified, and calling it provisional would understate what was actually verified.
 */
function provisionalMembersOf(doc: DocumentModel): number[] {
  const out = new Set<number>();
  for (const a of doc.assemblies) for (const id of a.source.provisionalMembers ?? []) out.add(id);
  return [...out].sort((a, b) => a - b);
}

function buildFacets(doc: DocumentModel, bars: readonly SceneBar[]): SceneFacets {
  const perAssembly = new Map<string, number>();
  for (const b of bars) perAssembly.set(b.assemblyId, (perAssembly.get(b.assemblyId) ?? 0) + 1);

  const families = new Set<FloorFamily>();
  const roles = new Set<BarRole>();
  const layers = new Set<string>();
  for (const b of bars) {
    if (b.family) families.add(b.family);
    roles.add(b.role);
    if (b.layerId) layers.add(b.layerId);
  }

  return {
    // Assembly order follows the document, so the filter list and the drawing set agree.
    assemblies: doc.assemblies.map((a) => ({
      id: a.id, label: a.label, barCount: perAssembly.get(a.id) ?? 0,
    })),
    families: (['slab', 'wall', 'footing'] as const).filter((f) => families.has(f)),
    roles: (['longitudinal', 'transverse'] as const).filter((r) => roles.has(r)),
    layers: [...layers].sort(),
  };
}

function boundsOf(
  bars: readonly SceneBar[], solids: readonly SceneSolid[],
): SceneBounds | null {
  let min: Point3 | null = null;
  let max: Point3 | null = null;
  const eat = (p: Point3) => {
    if (!min || !max) {
      min = { ...p };
      max = { ...p };
      return;
    }
    min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z);
  };

  for (const b of bars) for (const p of b.polyline) eat(p);
  for (const s of solids) {
    for (const p of s.base) {
      eat(p);
      eat({ x: p.x + s.extrude.x, y: p.y + s.extrude.y, z: p.z + s.extrude.z });
    }
  }
  return min && max ? { min, max } : null;
}

// ─── Filtering ───────────────────────────────────────────────────

/**
 * What the user has chosen to see.
 *
 * Every field absent means "no restriction on this axis". An EMPTY array is a real
 * restriction that matches nothing — the two are different states and a UI that conflates
 * them shows the whole floor the moment the user deselects the last family.
 */
export interface SceneFilter {
  assemblyIds?: readonly string[];
  families?: readonly FloorFamily[];
  roles?: readonly BarRole[];
  layerIds?: readonly string[];
  /** Show only bars named by an unresolved conflict. */
  conflictedOnly?: boolean;
  /**
   * Hide the concrete of members that carry no steel.
   *
   * Off by default, deliberately. A member the app could not design is the most important
   * thing on the screen, and defaulting to hidden is how it went unnoticed in the first
   * place. The switch exists because once the user has SEEN them, wanting a clean picture of
   * the cage is a reasonable next thing to want.
   */
  hideUnreinforced?: boolean;
  /**
   * Which concrete families to draw, as LAYERS of one model.
   *
   * ── Why foundations are not a separate route ───────────────────
   *
   * A footing exists to carry a column, and a user checking whether the dowels line up with
   * the column bars above them needs both in one picture. Giving foundations their own view
   * makes the one question that matters — do these two agree — impossible to ask.
   *
   * So they are a layer here, alongside beams, columns, slabs and walls, switched the same
   * way. Absent means every family; an empty array means none, which is a real state and not
   * the same as absent.
   */
  solidKinds?: readonly SceneSolidKind[];
  /** Hide all reinforcement, leaving the concrete shell. */
  hideBars?: boolean;
  /** Show only these members. Used when the user isolates one element from the list. */
  elementIds?: readonly number[];
}

/**
 * Which family owns each member, from the concrete itself.
 *
 * ── Why this is one function and not three copies ──────────────────
 *
 * The filter, the tally and the renderer's batching all need it, and all three must agree
 * exactly: a bar the filter counts as slab steel and the renderer batches under columns is a
 * bar that disappears when the user switches columns off while the tally still claims it. That
 * is not a cosmetic disagreement — it is the id-collision failure this scene already carries a
 * whole field to prevent, arriving through a second implementation instead.
 *
 * Member solids are appended to the scene AFTER the family solids, so a frame member wins any
 * number it shares with a footing. That ordering is `buildSceneModel`'s, and the last-write
 * behaviour here is what carries it — stated so it is a property rather than an accident.
 */
export function kindByElement(
  solids: readonly SceneSolid[],
): ReadonlyMap<number, SceneSolidKind> {
  const out = new Map<number, SceneSolidKind>();
  for (const s of solids) for (const id of s.elementIds) out.set(id, s.kind);
  return out;
}

/**
 * Which layer switch governs a bar.
 *
 * A bar belongs to the family of the concrete it sits in: slab steel to `slab`, footing mats
 * and dowels to `footing`, and frame steel to the beam or column that owns it. The frame case
 * needs the solids to answer, because only they know whether member 84 is a beam or a column.
 */
export function barSolidKind(
  b: SceneBar, kindOfElement: ReadonlyMap<number, SceneSolidKind>,
): SceneSolidKind | undefined {
  if (b.family) return b.family;
  if (b.ownerScope !== 'frame') return undefined;
  for (const id of b.elementIds) {
    const k = kindOfElement.get(id);
    if (k) return k;
  }
  return undefined;
}

export function barMatchesFilter(
  b: SceneBar, f: SceneFilter, kindOfElement?: ReadonlyMap<number, SceneSolidKind>,
): boolean {
  if (f.hideBars) return false;
  /**
   * A layer switch takes the STEEL with it.
   *
   * Without this, turning off `Columns` removed 84 concrete prisms and left all 9 311 column
   * bars floating in place — which is what "the toggles do not work" meant, and why slabs and
   * walls could not be found: with 20 917 bars drawn no matter what, isolating a family was
   * impossible and the families looked absent.
   *
   * A bar whose family cannot be resolved is KEPT. Hiding steel because the scene could not
   * work out which switch owns it would be the same silent omission in a new place.
   */
  if (f.solidKinds && kindOfElement) {
    const kind = barSolidKind(b, kindOfElement);
    if (kind !== undefined && !f.solidKinds.includes(kind)) return false;
  }
  if (f.assemblyIds && !f.assemblyIds.includes(b.assemblyId)) return false;
  if (f.roles && !f.roles.includes(b.role)) return false;
  if (f.layerIds && (b.layerId === undefined || !f.layerIds.includes(b.layerId))) return false;
  if (f.conflictedOnly && !b.conflicted) return false;
  /**
   * Isolating members isolates their steel too.
   *
   * A bar owned by several members survives while ANY of them is shown: a bar continuous over
   * a support belongs to both spans, and dropping it when the user isolates one of them would
   * cut the bar in the picture at a point where it is not cut in the cage.
   */
  if (f.elementIds && !b.elementIds.some((id) => f.elementIds!.includes(id))) return false;
  /**
   * A bar with no family passes a family filter only when the filter is absent.
   *
   * Beam and column steel belongs to no floor family, so "show me the footings" must hide
   * it. Answering "it has no family, therefore it is not excluded" would put the whole frame
   * back on screen the moment a user narrowed to one footing.
   */
  if (f.families && (b.family === undefined || !f.families.includes(b.family))) return false;
  return true;
}

/**
 * Apply a filter, keeping the scene a whole scene.
 *
 * Solids and conflicts follow the bars rather than being filtered independently: hiding the
 * concrete a visible bar sits in, or the marker for a conflict between two visible bars, are
 * both ways of producing a picture that answers a question the user did not ask. Bounds are
 * recomputed so the camera frames what is left.
 */
export function solidMatchesFilter(s: SceneSolid, f: SceneFilter): boolean {
  if (f.solidKinds && !f.solidKinds.includes(s.kind)) return false;
  if (f.elementIds && !s.elementIds.some((id) => f.elementIds!.includes(id))) return false;
  if (f.hideUnreinforced && !s.reinforced) return false;
  /**
   * An assembly filter cannot exclude concrete that belongs to no assembly.
   *
   * A member whose design was refused is exactly that member, and `new Set(...).has(undefined)`
   * is false — so deriving solid visibility from the visible assemblies put it back in the
   * dark the instant a checkbox was touched. It is governed by `hideUnreinforced` above.
   */
  if (f.assemblyIds && s.assemblyId !== undefined && !f.assemblyIds.includes(s.assemblyId)) {
    return false;
  }
  return true;
}

export function filterScene(scene: SceneModel, f: SceneFilter): SceneModel {
  // Built from the UNFILTERED solids, so a bar's family is resolved against the whole model
  // rather than against whatever survived — otherwise hiding columns would make column bars
  // unresolvable and therefore kept.
  const kindOfElement = kindByElement(scene.solids);

  const bars = scene.bars.filter((b) => barMatchesFilter(b, f, kindOfElement));
  const visibleBarIds = new Set(bars.map((b) => b.barId));

  /**
   * Concrete is filtered on its OWN terms, not inferred from which bars survived.
   *
   * The earlier version derived solid visibility from the assemblies the visible bars
   * belonged to, which read as "the concrete follows the steel". It has two failure modes and
   * the workspace hits both: turning every bar off emptied the picture completely rather than
   * leaving the concrete shell the user asked to look at, and there was no way to switch
   * foundations or slabs on and off as layers because nothing but a bar could reach a solid.
   *
   * Filtering each on its own terms is also simply what the controls say they do. "Hide
   * reinforcement" hides reinforcement; it does not hide the building.
   */
  const solids = scene.solids.filter((s) => solidMatchesFilter(s, f));
  const conflicts = scene.conflicts.filter(
    (c) => visibleBarIds.has(c.barIds[0]) || visibleBarIds.has(c.barIds[1]));

  return {
    ...scene, bars, solids, conflicts,
    bounds: boundsOf(bars, solids),
    unreinforcedMembers: solids
      .filter((s) => !s.reinforced && (s.kind === 'beam' || s.kind === 'column'))
      .flatMap((s) => s.elementIds)
      .sort((x, y) => x - y),
    // Carried through the filter unchanged. Hiding a member's steel does not make its design
    // certified, and a legend that stopped saying "provisional" because a layer was switched
    // off would be telling the user what they had just asked not to see. The torsion warning
    // rides with it, for exactly the same reason.
    provisionalMembers: scene.provisionalMembers,
    torsionUnevaluatedMembers: scene.torsionUnevaluatedMembers,
  };
}

/**
 * The bounds of what a filter leaves visible, without materialising a filtered scene.
 *
 * ── Why this is not just `filterScene(...).bounds` ─────────────────
 *
 * Because the renderer no longer holds a filtered scene. It builds its geometry from the whole
 * model once and answers the layer switches with mesh visibility, so the only thing it still
 * needs from the filter is where to point the camera. Asking `filterScene` for that would
 * allocate two arrays of thousands of bars and solids to read six numbers off the end of them.
 */
export function visibleBounds(scene: SceneModel, f: SceneFilter): SceneBounds | null {
  const kindOfElement = kindByElement(scene.solids);
  return boundsOf(
    scene.bars.filter((b) => barMatchesFilter(b, f, kindOfElement)),
    scene.solids.filter((s) => solidMatchesFilter(s, f)),
  );
}

/**
 * A cheap content fingerprint of a scene.
 *
 * ── The freeze this exists to end ──────────────────────────────────
 *
 * The viewport rebuilt every tube whenever the `SceneModel` OBJECT changed, and
 * `filterScene` returns a new object on every recompute — as does the filter literal that
 * feeds it. So any reactive touch anywhere rebuilt 20 917 tubes from scratch. Switching to
 * another browser tab and back was the worst case: Svelte flushes the pending effects on
 * return, and the user got roughly three seconds of frozen camera and dead controls.
 *
 * Identity is the wrong question. What the renderer needs to know is whether the STEEL
 * changed, and that is answered by the ids and counts. Hashing 20 000 short strings costs
 * about a millisecond against seconds of geometry.
 *
 * Deliberately not a cryptographic hash: this decides whether to redraw, and the cost of an
 * astronomically unlikely collision is one stale frame until the next real change.
 */
export function sceneSignature(scene: SceneModel): string {
  let h = 2166136261;
  const eat = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  for (const b of scene.bars) eat(b.barId);
  for (const s of scene.solids) {
    eat(s.id);
    // `reinforced` decides which of the two concrete batches a solid lands in, so a change
    // in it changes the geometry even though the id set is identical.
    if (s.reinforced) h ^= 0x9e3779b9;
  }
  return `${scene.bars.length}:${scene.solids.length}:${scene.conflicts.length}:${h >>> 0}`;
}

// ─── Summary ─────────────────────────────────────────────────────

/**
 * What is on screen, counted.
 *
 * The same quantities the schedule totals, over the same bars, so a user comparing the two
 * is comparing one statement with itself.
 */
export interface SceneSummary {
  barCount: number;
  /** Total developed length, m. */
  totalLength: number;
  /** Steel mass, kg, at the density the schedule uses. */
  massKg: number;
  conflictedBars: number;
  byDiameter: Array<{ diameterMm: number; count: number; lengthM: number }>;
  /** Pieces of concrete on screen. */
  solidCount: number;
  /** How many of them have steel inside. */
  reinforcedSolidCount: number;
  /**
   * Bars and concrete per family, so a partial scene is visible as a number rather than as
   * an absence.
   *
   * ── Why this is in the summary and not left to the eye ─────────
   *
   * A 7-storey building rendered 12 705 bars and looked full, and 8 251 of the pieces it
   * should have had were missing: every column tie in the model. Nothing on screen said so,
   * because "lots of bars" and "all the bars" look identical in a cage. A per-family count
   * next to the picture is what turns that into something a reviewer can check — and what a
   * test can assert against the detailing source.
   */
  byFamily: Array<{
    family: SceneSolidKind | 'unknown';
    solids: number;
    longitudinal: number;
    transverse: number;
  }>;
}

export function summariseScene(
  scene: SceneModel, steelDensity = 7850,
): SceneSummary {
  const per = new Map<number, { count: number; lengthM: number }>();
  let totalLength = 0;
  let massKg = 0;
  let conflictedBars = 0;

  for (const b of scene.bars) {
    totalLength += b.cuttingLength;
    massKg += Math.PI * (b.diameterMm / 2000) ** 2 * b.cuttingLength * steelDensity;
    if (b.conflicted) conflictedBars += 1;
    const e = per.get(b.diameterMm) ?? { count: 0, lengthM: 0 };
    e.count += 1;
    e.lengthM += b.cuttingLength;
    per.set(b.diameterMm, e);
  }

  // ── Per family ──────────────────────────────────────────────
  const kindOfElement = kindByElement(scene.solids);

  const fam = new Map<SceneSolidKind | 'unknown',
  { solids: number; longitudinal: number; transverse: number }>();
  const bump = (k: SceneSolidKind | 'unknown') => {
    const e = fam.get(k) ?? { solids: 0, longitudinal: 0, transverse: 0 };
    fam.set(k, e);
    return e;
  };
  for (const s of scene.solids) bump(s.kind).solids += 1;
  for (const b of scene.bars) {
    const e = bump(barSolidKind(b, kindOfElement) ?? 'unknown');
    if (b.role === 'transverse') e.transverse += 1; else e.longitudinal += 1;
  }

  return {
    barCount: scene.bars.length,
    totalLength,
    massKg,
    conflictedBars,
    byDiameter: [...per.entries()]
      .map(([diameterMm, v]) => ({ diameterMm, ...v }))
      .sort((a, b) => a.diameterMm - b.diameterMm),
    solidCount: scene.solids.length,
    reinforcedSolidCount: scene.solids.filter((s) => s.reinforced).length,
    byFamily: [...fam.entries()]
      .map(([family, v]) => ({ family, ...v }))
      .sort((a, b) => String(a.family).localeCompare(String(b.family))),
  };
}
