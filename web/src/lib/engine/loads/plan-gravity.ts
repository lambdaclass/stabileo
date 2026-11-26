/**
 * Where the load plan puts an area load (dead, live, roof live): which members or shells carry
 * it, and how much of each square metre each one takes.
 *
 * ── Panels ────────────────────────────────────────────────────────
 *
 * Each floor's horizontal beams bound panels, and each panel sends its load to the beams around
 * it by tributary area, in two ways or in one (`floor-loads.ts`, the Floor load tool's own
 * function, run here once per level with a unit load). A beam then carries the real area it
 * collects, as partial linear loads, instead of one width for every beam of the model.
 *
 * ── Slabs drawn as shells ─────────────────────────────────────────
 *
 * A floor or roof drawn with shells already carries its load in those cells, which take the
 * area load as a surface load.
 *
 * A sloped shell is loaded like a sloped member: the dead load per square metre of its surface,
 * the live loads per square metre of its plan projection (`cos` below), both along global −Z, as
 * `SurfaceLoad3D` applies them. A shell steeper than a member may be (`beamLike`) is a wall and
 * takes no area load; one between that and vertical is named in the derivation, in case it is a
 * steep roof.
 *
 * ── The tributary width, as a fallback ────────────────────────────
 *
 * What bounds no panel (a cantilever, a beam that stops in the air, a sloped roof member, a plane
 * frame) is loaded with the tributary width given, as the plan always did, and counted, so the
 * derivation says how many members were loaded that way. A beam on the boundary of a loaded panel
 * never is, even when the panel gives it nothing: on a one-way slab the beams parallel to the
 * span carry no slab, and the width would load the panel twice.
 *
 * Pure: no store.
 */
import { canonicalFootprint, footprintArea, footprintBounds, footprintIntersection, planarShell, refuseGravityGeometry, ringArea, samePhysicalDeck, shellEdgeComponents, subtractFootprints, unionFootprints, type PlaneBasis, type ShellPlane } from './gravity-shell-partition';
import { gravityShellCells, gravityShellKey, gravityShellSurfaceArea, type GravityShellTarget, type GravityShellKey } from './gravity-shell-partition';
import { physicalRoofRuns, samePhysicalPoint, snowCoordinate } from './physical-roof-geometry';
import polygonClipping, { type Polygon } from 'polygon-clipping';
import { orient2d } from 'robust-predicates';
import { SupportMappingError, supportDofs3D } from '../support-dofs-3d';
import type { Element, Support } from '../../store/model.svelte';
import { agrees, roundoff, Sum } from '../accounting-math';
import { deckOverlapsInBand, deckRangeBand, deckSurface, physicalDeck, type Deck, type DeckFootprint, type DeckSurface } from './gravity-deck-geometry';
import { deckOverlaps } from './gravity-deck-geometry';
import { compareClearance, doubledPlanPoint, dyadicInteger, exactBeamHeight, exactElevation, exactPlaneHeight, exactProjectedBeamHeight, exactStripHeight, midpointElevation, sign, type DoubledPlanPoint } from './gravity-exact-height';
import { partitionGravityFloors } from './gravity-floor-ownership';
import { preparePhysicalFloorLoad, type FloorBay, type FloorBeam, type FloorPanel, type FloorLoadResult, type SideStretch } from './floor-loads';
import { EngineMessageError, msg, round, type EngineMessage } from '../../codes/message';
import type { Constraint3D } from '../types-3d';

export interface GravityModel {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId?: number; type?: 'frame' | 'truss' } & Partial<Pick<Element, 'releaseI' | 'releaseJ' | 'jointI' | 'jointJ' | 'behaviour' | 'offset'>>>;
  quads?: Map<number, { id: number; nodes: number[] }>;
  plates?: Map<number, { id: number; nodes: number[] }>;
  connectors?: ReadonlyMap<number, { nodeI: number; nodeJ: number }>;
  constraints?: readonly Constraint3D[];
  supports?: ReadonlyMap<number, Pick<Support, 'nodeId'> & Partial<Pick<Support, 'type' | 'dofRestraints' | 'dofFrame' | 'isInclined' | 'uplift' | 'curves'>>>;
}

export interface GravityOptions {
  /** `panels`: by tributary area where the beams close panels; `width`: one width everywhere. */
  mode: 'panels' | 'width';
  slab?: 'twoWay' | 'oneWay';
  spanAxis?: 'x' | 'y';
  /** m, for the members no panel loads. */
  tributaryWidth: number;
  /** Load every panel the beams close, also those within the roof's structure or too wide for a deck. */
  loadEveryPanel?: boolean;
  uniformPressure?: boolean;
}

export function loadSpanLength(span: { a?: number; b?: number }, length: number): number {
  return (span.b ?? length) - (span.a ?? 0);
}

/**
 * A stretch of a member and the depth of area it collects there, m (so q·w is kN/m), from one
 * panel; `roof` when nothing higher covers that panel.
 */
export interface GravityPiece { elementId: number; a?: number; b?: number; wI: number; wJ: number; roof: boolean; panel: number }

/** Area a panel brings to a node past the end of one of its sides (a re-entrant corner), m². */
export interface GravityPoint { nodeId: number; w: number; elementId: number; roof: boolean; panel: number }

export interface WidthSpan { t0: number; t1: number; width: number }

export function widthSpans(m: { spans?: WidthSpan[] }, tributaryWidth: number): WidthSpan[] {
  return m.spans ?? [{ t0: 0, t1: 1, width: tributaryWidth }];
}

type GravityShell = { target: GravityShellTarget; area: number; surface: number; z: number; cos: number };

export interface GravityLayout {
  pieces: GravityPiece[];
  points: GravityPoint[];
  panelAreas: Array<ReadonlyMap<number, number>>;
  memberMeasures: ReadonlyMap<number, { length: number; horizontalLength: number }>;
  /** Area each member collects from floors, m². */
  areaOf: Map<number, number>;
  /** Area each member collects from roofs, m². A beam at a step has both. */
  roofAreaOf: Map<number, number>;
  /**
   * Members loaded with the tributary width, and whether each is sloped (its load is per
   * projection); `spans` when a member within the roof's structure takes only the part of its
   * strip nothing above carries (`roofFringe`): the width, m, over stretches of it, as fractions
   * of its length, nothing elsewhere. `widthSpans` reads both.
   */
  widthMembers: Array<{ elementId: number; length: number; horizontalLength: number; spans?: WidthSpan[] }>;
  /**
   * Shells that take the area load themselves: their plan area, m², their mean height, and `cos`,
   * plan area over surface area (1 when horizontal), which turns a load per plan m² into one per
   * m² of shell.
   */
  shells: GravityShell[];
  areaByLevel: Map<number, number>;
  /** Members that carry roof: a roof panel, or (loaded by width) nothing higher over them. */
  roof: Set<number>;
  roofShells: Set<GravityShellKey>;
  /** Mid-height of each member that carries an area load, m. */
  zOf: Map<number, number>;
  /**
   * The checkerboard of alternate loading (CIRSOC 101 §4.3.3): a colour, 0 or 1, for each panel
   * (by `GravityPiece.panel`) and for each member loaded by width, so that neighbours on a level
   * differ and the pattern turns over from one level to the next.
   */
  panelColour: number[];
  widthColour: Map<number, number>;
  /** The loaded panels, by `GravityPiece.panel`: their outline in plan, their level, and whether a roof. */
  panels: Array<{ polygon: Array<[number, number]>; z: number; roof: boolean; oneWaySpan?: 'x' | 'y'; footprint?: Region }>;
  /** Members whose area load all comes from one side of their axis, ascending; its torque is in no load. */
  oneSided: number[];
  notes: EngineMessage[];
}

const TOL = 1e-3;
const MIN_COVER_RISE = 0.05;
const BEAM_SLOPE_LIMIT = 0.5;
type ShellCarrier = {
  footprint: [Polygon]; geometry: Deck;
  id: number; coverageId: number; key: GravityShellKey; poly: Polygon[number]; pts: Array<[number, number, number]>;
  nodes: number[]; pitched: boolean; plane?: ShellPlane; height: ShellPlane; low: number; high: number;
};
const levelIndex = (z: number) => Math.round(z / TOL);
const levelKey = (z: number) => levelIndex(z) * TOL;

/** True when a member is close enough to horizontal to carry an area load (|Δz|/L ≤ 0.5). */
export function beamLike(model: GravityModel, el: { id: number; nodeI: number; nodeJ: number }): { ok: boolean; length: number; horizontalLength: number } {
  const nI = model.nodes.get(el.nodeI), nJ = model.nodes.get(el.nodeJ);
  if (!nI || !nJ) return { ok: false, length: 0, horizontalLength: 0 };
  const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
  const L = Math.hypot(dx, dy, dz);
  if (L < 0.01) return { ok: false, length: 0, horizontalLength: 0 };
  const rise = Math.abs(dz);
  const limit = L * BEAM_SLOPE_LIMIT;
  const coordinateScale = Math.max(L, Math.abs(nI.x), Math.abs(nI.y), Math.abs(nI.z ?? 0), Math.abs(nJ.x), Math.abs(nJ.y), Math.abs(nJ.z ?? 0));
  if (Math.abs(rise - limit) <= 16 * Number.EPSILON * coordinateScale) {
    refuseGravityGeometry(msg('loadPlan.gravity.memberSlopeLimit', { id: el.id }));
  }
  return { ok: rise / L <= BEAM_SLOPE_LIMIT, length: L, horizontalLength: Math.hypot(dx, dy) };
}

function gravityShells(model: GravityModel, mode: GravityOptions['mode']) {
  const shellsAt = new Map<number, Array<Omit<GravityShell, 'z'>>>();
  const slopedShells: GravityShell[] = [];
  const levelCarriers: ShellCarrier[] = [];
  const slopedCarriers: ShellCarrier[] = [];
  const coverShells: ShellCarrier[] = [];
  const steep: number[] = [];
  let nextCarrierId = 0;
  for (const { cell: q, target } of gravityShellCells(model)) {
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    const xyz = pts.map((p) => [p!.x, p!.y, p!.z ?? 0] as [number, number, number]);
    const zs = xyz.map((p) => p[2]);
    const poly = xyz.map((p) => [p[0], p[1]] as [number, number]);
    const plan = ringArea(poly);
    const plane = mode === 'panels' && plan > 0 ? planarShell(q.id, xyz) : undefined;
    const low = Math.min(...zs), high = Math.max(...zs);
    const pitched = high - low > TOL;
    const height: ShellPlane = plane ?? (low === high ? () => low : ([x, y]) => heightIn(xyz, [x, y, 0]));
    const carrier: ShellCarrier = {
      id: q.id, coverageId: nextCarrierId++, key: gravityShellKey(target), poly, pts: xyz, nodes: q.nodes, plane, pitched, height, low, high,
      footprint: [[plan > 0 ? canonicalFootprint(poly) : poly]], geometry: physicalDeck(xyz, plane),
    };
    if (plan > 0) coverShells.push(carrier);
    const surface = gravityShellSurfaceArea(xyz);
    const cos = surface > 0 ? plan / surface : 0;
    if (!pitched) {
      const key = levelKey(low + (high - low) / 2);
      const list = shellsAt.get(key) ?? [];
      list.push({ target, area: plan, surface, cos });
      shellsAt.set(key, list);
      if (plan > 0) {
        levelCarriers.push(carrier);
      }
      continue;
    }
    if (cos >= Math.sqrt(0.75) - 1e-9) {
      slopedShells.push({ target, area: plan, surface, z: low + zs.sort((a, b) => a - b).reduce((sum, z) => sum + (z - low), 0) / zs.length, cos });
      slopedCarriers.push(carrier);
    } else if (cos > Math.cos((80 * Math.PI) / 180)) steep.push(q.id);
  }
  const carriers = [...levelCarriers, ...slopedCarriers];
  return { shellsAt, slopedShells, carriers, coverShells, steep };
}

function attachedShellCoverage(
  model: GravityModel, candidates: readonly { nodeI: number; nodeJ: number }[], members: Iterable<number>,
  carriers: ShellCarrier[], links: readonly VerticalShellLink[], terminals: ReadonlySet<number>, legacyGapMembers?: Set<number>,
): Map<number, AttachmentCoverage> {
  const offsetLinks = links.filter(link => link.geometry);
  if (!offsetLinks.length || !carriers.length) return new Map();
  const shellNodes = new Set(carriers.flatMap(carrier => carrier.nodes));
  const frameNodes = new Set(candidates.flatMap(({ nodeI, nodeJ }) => [nodeI, nodeJ]).filter(id => model.nodes.has(id)));
  const offsets = shellOffsets(model, shellNodes, frameNodes, new AttachmentComponents(offsetLinks, terminals));
  return rigidShellCoverage(model, offsets, carriers, members, legacyGapMembers);
}

export function hasBoundedRafterGap(model: GravityModel): boolean {
  const links = verticalShellLinks(model);
  if (!links.some(link => link.geometry) || !(model.quads?.size || model.plates?.size)) return false;
  try {
    const { carriers } = gravityShells(model, 'panels');
    const candidates = [...model.elements.values()].filter(e => e.type !== 'truss');
    const members = candidates.filter(e => beamLike(model, e).ok).map(e => e.id);
    const legacyGapMembers = new Set<number>();
    attachedShellCoverage(model, candidates, members, carriers, links, groundedStations(model), legacyGapMembers);
    for (const id of legacyGapMembers) {
      const { nodeI, nodeJ } = model.elements.get(id)!;
      const a = model.nodes.get(nodeI)!, b = model.nodes.get(nodeJ)!;
      const trace: Segment = [[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]];
      if (shellCoverage(trace, carriers) === 'none') return true;
    }
    return false;
  } catch (error) {
    if (error instanceof EngineMessageError) return false;
    throw error;
  }
}

export function gravityLayout(model: GravityModel, opts: GravityOptions): GravityLayout {
  const eligibility = new Map<number, ReturnType<typeof beamLike>>();
  const out: GravityLayout = {
    pieces: [], points: [], panelAreas: [], memberMeasures: eligibility, areaOf: new Map(), roofAreaOf: new Map(), widthMembers: [], shells: [], areaByLevel: new Map(),
    roof: new Set(), roofShells: new Set(), zOf: new Map(), panelColour: [], widthColour: new Map(), panels: [], oneSided: [], notes: [],
  };
  const sidesOf = new Map<number, SideStretch[]>();
  const addSides = (id: number, sides: SideStretch[] | undefined) => {
    if (sides) (sidesOf.get(id) ?? sidesOf.set(id, []).get(id)!).push(...sides);
  };
  const width = (id: number, length: number, horizontalLength: number, spans?: WidthSpan[]) => {
    out.widthMembers.push({ elementId: id, length, horizontalLength, ...(spans ? { spans } : {}) });
  };
  const addArea = (map: Map<number, number>, id: number, a: number) => map.set(id, (map.get(id) ?? 0) + a);

  const candidates = [...model.elements.values()].filter((e) => e.type !== 'truss');
  for (const e of candidates) {
    const member = beamLike(model, e);
    if (member.ok) {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      out.zOf.set(e.id, ((a.z ?? 0) + (b.z ?? 0)) / 2);
    }
    eligibility.set(e.id, member);
  }

  const { shellsAt, slopedShells, carriers, coverShells, steep } = gravityShells(model, opts.mode);
  const links = opts.mode === 'panels' ? verticalShellLinks(model) : [];
  const terminals = links.length ? groundedStations(model) : new Set<number>();
  const attachedCoverage = opts.mode === 'panels'
    ? attachedShellCoverage(model, candidates, out.zOf.keys(), carriers, links, terminals)
    : new Map<number, AttachmentCoverage>();
  const shellMembership = new Map<number, boolean>();
  const inShell = (e: { id: number; nodeI: number; nodeJ: number }): boolean => {
    if (opts.mode !== 'panels' || !carriers.length) return false;
    if (shellMembership.has(e.id)) return shellMembership.get(e.id)!;

    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const p: Segment[0] = [a.x, a.y, a.z ?? 0], q: Segment[1] = [b.x, b.y, b.z ?? 0];
    const original = shellCoverage([p, q], carriers);
    const attached = attachedCoverage.get(e.id);
    if (original !== 'full' && attached === 'unresolvedOffset') {
      refuseGravityGeometry(msg('loadPlan.gravity.offsetRafter', { id: e.id }));
    }
    if (attached === 'conflictingGapDecks' || attached === 'eccentricGap' || original === 'partial' || (original !== 'full' && attached === 'partial')) {
      refuseGravityGeometry(msg('loadPlan.gravity.unresolvedMember', { id: e.id }));
    }
    const covered = original === 'full' || attached === 'full' || (typeof attached === 'object' && !attached.gaps.length);
    shellMembership.set(e.id, covered);
    return covered;
  };

  // Horizontal members, by level; the rest that can carry a load go by width.
  const beamsAt = new Map<number, FloorBeam[]>();
  for (const e of candidates) {
    const nI = model.nodes.get(e.nodeI), nJ = model.nodes.get(e.nodeJ);
    if (!nI || !nJ) continue;
    const b = eligibility.get(e.id)!;
    if (!b.ok) continue;
    const horizontal = Math.abs((nI.z ?? 0) - (nJ.z ?? 0)) <= TOL;
    // By width every member takes the width; its floor's panels still say what it covers. A
    // sloped member in a shell's surface is a rafter under the roof the shell carries.
    if (opts.mode === 'width' || (!horizontal && !inShell(e))) {
      const attached = attachedCoverage.get(e.id);
      width(e.id, b.length, b.horizontalLength, typeof attached === 'object' ? attached.gaps : undefined);
    }
    if (!horizontal) continue;
    const key = levelKey(out.zOf.get(e.id)!);
    const list = beamsAt.get(key) ?? [];
    list.push({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: 'frame', sectionId: e.sectionId ?? 0 });
    beamsAt.set(key, list);
  }

  // First pass: the panels of every level, which say what covers what.
  const slab = { distribution: opts.slab ?? 'twoWay', spanAxis: opts.spanAxis } as const;
  const physicalPiece = (piece: Omit<GravityPiece, 'roof' | 'panel'>) => {
    const { length, horizontalLength } = eligibility.get(piece.elementId)!;
    const cos = horizontalLength / length;
    const { a, b, wI, wJ, elementId } = piece;
    return {
      elementId,
      ...(a !== undefined ? { a: a / cos, b: b === undefined ? undefined : b / cos } : {}),
      wI: wI * cos, wJ: wJ * cos,
    };
  };
  const verifyBayArea = (
    z: number, footprint: Region, scale: number, pieces: readonly { elementId: number; a?: number; b?: number; wI: number; wJ: number }[],
    points: readonly { w: number }[],
  ) => {
    const load = new Sum();
    for (const piece of pieces) {
      load.add((piece.wI / 2 + piece.wJ / 2) * loadSpanLength(piece, eligibility.get(piece.elementId)!.length));
    }
    for (const point of points) load.add(point.w);
    const area = footprintArea(footprint);
    if (!(area > 0) || !(load.value > 0) || !agrees(load.value, area, scale)) {
      refuseGravityGeometry(msg('loadPlan.gravity.areaResultant', { z }));
    }
    return area;
  };
  type OwnedPanel = DeckFootprint & {
    panel: FloorPanel;
    area: number;
    areaScale: number;
    own: NonNullable<FloorPanel['own']>;
    pieces: Array<Omit<GravityPiece, 'roof' | 'panel'>>;
    points: Array<Omit<GravityPoint, 'roof' | 'panel'>>;
  };
  const levels = new Map<number, { res: FloorLoadResult; owned: OwnedPanel[] }>();
  const prepared = [...beamsAt].map(([z, beams]) => ({
    z, floor: preparePhysicalFloorLoad({ nodes: model.nodes, beams, q: 1, ...slab }, true),
  }));
  const coordinates = (id: number): Segment[0] => {
    const { x, y, z = 0 } = model.nodes.get(id)!;
    return [x, y, z];
  };
  const fixedShellStations = directlyGroundedShells(model, carriers, terminals);
  const frameComponents = opts.mode === 'panels' && opts.loadEveryPanel && !(model.quads?.size || model.plates?.size) && !model.constraints?.length
    ? new NodeComponents() : undefined;
  if (frameComponents) {
    for (const { nodeI, nodeJ } of model.elements.values()) frameComponents.join(nodeI, nodeJ);
  }
  let separateDecks: ReturnType<typeof independentDecks> | undefined;
  const ownership = opts.mode === 'panels' ? partitionGravityFloors(
    carriers, prepared.flatMap(({ floor }) => floor.bays), {
      deck: MIN_COVER_RISE, storeyHeadroom: MIN_STOREY_HEADROOM,
      explicitBeamBays: frameComponents && { tolerance: TOL, componentOf: node => frameComponents.root(node) },
    }, coordinates, shellBayAttachments(model, beamsAt, links, terminals),
    (first, second) => fixedShellStations.get(first)?.some(node => fixedShellStations.get(second)?.includes(node))
      ? TOL : MIN_COVER_RISE,
    (shell, bay) => (separateDecks ??= independentDecks(model))(shell, bay),
  ) : undefined;
  const panelsAt = new Map<number, DeckFootprint[]>();
  for (const { z, floor } of prepared) {
    const res = floor.generate(ownership?.bays);
    const owned = ownership ? floor.bays.flatMap((bay): OwnedPanel[] => {
      const { region: footprint, deck, independentShells } = ownership.bays.get(bay)!;
      if (!footprint.length) return [];
      if (!deck) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
      const panel = res.panels[bay.index];
      const own = panel?.own;
      const pieces = (own?.loads ?? []).map(l => physicalPiece({
        elementId: l.elementId, a: l.a, b: l.b, wI: l.qI, wJ: l.qJ,
      }));
      const points = (own?.nodal ?? []).map(n => ({ nodeId: n.nodeId, w: -n.fz, elementId: n.elementId }));
      const areaScale = bay.boundary.reduce((sum, ring) => sum + ringArea(ring), 0);
      const area = verifyBayArea(z, footprint, areaScale, pieces, points);
      if (!panel || !own) refuseGravityGeometry(msg('loadPlan.gravity.areaResultant', { z }));
      return [{ panel, footprint, geometry: { ...deck, independentShells }, area, areaScale, own, pieces, points }];
    }) : [];
    levels.set(z, { res, owned });
    panelsAt.set(z, ownership ? owned : floor.bays.map(bay => ({
      footprint: [bay.boundary], geometry: physicalDeck(bay.boundaryNodes.flat().map(coordinates)),
    })));
  }
  const wideCandidates = opts.loadEveryPanel ? [] : [...levels].flatMap(([z, { owned }]) =>
    owned.filter(({ panel }) => isWideDeck(panel.polygon)).map(panel => ({ z, ...panel })));
  const wide = new Map<number, DeckFootprint[]>();
  const deckReasons = new Map<FloorPanel, ReturnType<ReturnType<typeof notADeck>['why']>>();
  if (wideCandidates.length) {
    for (const [z, { owned }] of levels) {
      panelsAt.set(z, owned.filter(({ panel }) => !isWideDeck(panel.polygon)));
    }
    const preliminary = notADeck(model, carriers, coverage(model, out.zOf, panelsAt, coverShells), true);
    for (const { z, panel, footprint, geometry } of wideCandidates) {
      const reason = preliminary.why(panel.polygon, { footprint, geometry });
      deckReasons.set(panel, reason);
      const source = reason === 'wide' ? wide : panelsAt;
      source.set(z, [...source.get(z) ?? [], { footprint, geometry }]);
    }
  }
  const gapDecks = [...new Set(out.widthMembers.flatMap(({ elementId }) => {
    const attached = attachedCoverage.get(elementId);
    return typeof attached === 'object' ? attached.runGaps : [];
  }))];
  const preliminaryCover = coverage(model, out.zOf, panelsAt, coverShells, wide, gapDecks);
  const panelSides = new Map<number, SideStretch[]>();
  for (const { res } of levels.values()) for (const pn of res.panels) for (const [id, sides] of pn.own?.sides ?? []) {
    (panelSides.get(id) ?? panelSides.set(id, []).get(id)!).push(...sides);
  }
  if (opts.mode === 'width') levels.clear();
  const deck = opts.loadEveryPanel ? null : notADeck(model, carriers, preliminaryCover, opts.mode === 'panels');
  if (deck) for (const { owned } of levels.values()) for (const { panel, footprint, geometry } of owned) {
    if (!deckReasons.has(panel)) deckReasons.set(panel, deck.why(panel.polygon, { footprint, geometry }));
  }
  const memberFringes = new Map<number, DeckFootprint & { spans: WidthSpan[]; sides: SideStretch[] }>();
  let byWidth = 0, unresolved = 0, lowPanels = 0, widePanels = 0, unclear = 0, unclearRoof = 0, fringes = 0;
  const segment = (id: number): Segment => {
    const e = model.elements.get(id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return [[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]];
  };
  const isSloped = (m: { length: number; horizontalLength: number }) => Math.abs(m.length - m.horizontalLength) > TOL;
  const retainedBays: DeckFootprint[] = [];
  const retainedStrips: DeckFootprint[] = opts.tributaryWidth > 0
    ? out.widthMembers.filter(isSloped).map(m => memberStrip(segment(m.elementId), opts.tributaryWidth)) : [];
  const dropped = new Set<FloorPanel>();
  const fringeKept = new Map<FloorPanel, Region>();
  const droppedMembers = new Set<number>();
  const flatAt = new Map<number, FloorBeam[]>();
  for (const [z, beams] of beamsAt) {
    const loaded = new Set<number>();
    const level = levels.get(z);
    const panelBounds = [...(level?.owned.map(({ panel }) => panel) ?? []),
      ...(level?.res.panels.filter(panel => panel.shellCoverage?.kind === 'shell') ?? [])];
    for (const panel of panelBounds) {
      // Its members are every one along its sides, a second member between two nodes or a stub
      // along a side included: by the graph's one member per pair of nodes, those went by width
      // as well, the panel's area loaded twice.
      const members = panel.members ? new Set(panel.members) : null;
      for (const b of beams) if (members ? members.has(b.id) : onBoundary(model, b, panel.polygon)) loaded.add(b.id);
    }
    flatAt.set(z, beams.filter(b => opts.mode === 'width' || (!loaded.has(b.id) && !inShell(b))));
  }
  for (const z of [...beamsAt.keys()].sort((a, b) => b - a)) {
    if (!deck) break;
    for (const { panel, footprint, geometry } of levels.get(z)?.owned ?? []) {
      const preliminaryReason = deckReasons.get(panel);
      const why = preliminaryReason === 'headroomUnclear' && retainedBays.length
        ? deck.why(panel.polygon, { footprint, geometry }, retainedBays) : preliminaryReason;
      if (why !== preliminaryReason) deckReasons.set(panel, why ?? null);
      if (why === 'wide') continue;
      let unassigned = footprint;
      if (why === 'lowHeadroom') {
        const vacant = (levels.get(z)?.owned ?? []).filter(({ panel }) => deckReasons.get(panel) === 'wide');
        const regions: Region = [...footprint];
        for (const [, ...holes] of footprint) for (const hole of holes) {
          const match = vacant.find(({ footprint: [[outline]] }) =>
            subtractFootprints([hole], [[outline!]]).length === 0 && subtractFootprints([outline!], [[hole]]).length === 0);
          if (match) regions.push(...match.footprint);
        }
        unassigned = unionFootprints(regions);
      }
      const kept = deck.uncarried(
        { footprint: unassigned, geometry }, retainedBays, why === 'lowHeadroom' ? retainedStrips : [],
      );
      if (!kept.length) { dropped.add(panel); continue; }
      if (kept !== footprint) {
        if (kept.some(([exterior]) => isWideDeck(exterior!))) {
          refuseGravityGeometry(msg('loadPlan.gravity.widePanels', { n: 1, span: MAX_DECK_SPAN }));
        }
        fringeKept.set(panel, kept);
      }
      retainedBays.push({ footprint: kept, geometry });
    }
    for (const e of flatAt.get(z) ?? []) {
      const [a, b] = segment(e.id);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const start: PlanPoint = [a[0], a[1]], end: PlanPoint = [b[0], b[1]];
      const u: PlanPoint = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const strip = memberStrip([a, b], opts.tributaryWidth);
      const why = deck.why([start, end], strip, retainedBays);
      const panels = panelsAt.get(z) ?? [];
      const beside = panels.flatMap(panel => panel.footprint.filter(([exterior]) => onBoundary(model, e, exterior!))
        .map(footprint => deck.why(footprint[0]!, { ...panel, footprint: [footprint] })));
      const floorBeside = beside.some((w) => w === null || w === 'headroomUnclear');
      const low = why === 'lowHeadroom' || why === 'shellHeadroom' || headroomOverlaps(strip, retainedBays).length > 0;
      if (low && !floorBeside &&
        panels.some(panel => panel.footprint.some(([, ...holes]) => holes.some(hole => onBoundary(model, e, hole))))) {
        refuseGravityGeometry(msg('loadPlan.gravity.unresolvedMember', { id: e.id }));
      }
      if ((!low && why === 'headroomUnclear') || (low && floorBeside)) {
        if (preliminaryCover.memberCovered([a, b])) unclear++; else unclearRoof++;
      }
      if (low && !floorBeside) {
        const axis = { p: start, u, L };
        const kept = deck.uncarried(strip, retainedBays, why === 'lowHeadroom' ? retainedStrips : []);
        if (kept === strip.footprint) { retainedStrips.push(strip); continue; }
        const bins = kept.length ? areaAlong(kept, axis, FRINGE_BINS) : [];
        const spans: WidthSpan[] = [];
        bins.forEach(({ area, first }, k) => {
          if (!(area > 0)) return;
          const w = L / bins.length, c = first / area;
          const half = Math.abs(c - (k + 0.5) * w) <= 1e-9 * w ? w / 2 : Math.min(w / 2, c - k * w, (k + 1) * w - c);
          const [t0, t1] = half > 1e-9 ? [(c - half) / L, (c + half) / L] : [k / bins.length, (k + 1) / bins.length];
          const width = area / (L * (t1 - t0));
          const last = spans[spans.length - 1];
          if (last && Math.abs(last.t1 - t0) < 1e-12 && Math.abs(last.width - width) <= 1e-9 * width) last.t1 = t1;
          else spans.push({ t0, t1, width });
        });
        if (spans.length === 0) { droppedMembers.add(e.id); continue; }
        memberFringes.set(e.id, { spans, sides: loadedSides(kept, axis), footprint: kept, geometry: strip.geometry });
        retainedStrips.push({ footprint: kept, geometry: strip.geometry });
        fringes++;
        continue;
      }
      if (strip.footprint.length) retainedStrips.push(strip);
    }
  }

  if (opts.mode === 'panels') {
    for (const [z, layer] of shellsAt) {
      const shells = layer.filter(shell => shell.area > 0);
      if (!shells.length) continue;
      out.shells.push(...shells.map((shell) => ({ ...shell, z })));
      const area = shells.reduce((s, shell) => s + shell.area, 0);
      out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + area);
      out.notes.push(msg('loadPlan.gravity.shellLevel', { z: round(z, 2), n: shells.length, area: round(area, 1) }));
    }
    if (slopedShells.length > 0) {
      out.shells.push(...slopedShells);
      for (const shell of slopedShells) out.areaByLevel.set(shell.z, (out.areaByLevel.get(shell.z) ?? 0) + shell.area);
      out.notes.push(msg('loadPlan.gravity.slopedShells', { n: slopedShells.length, area: round(slopedShells.reduce((s, q) => s + q.area, 0), 1) }));
    }
    if (steep.length > 0) out.notes.push(msg('loadPlan.gravity.steepShells', { n: steep.length, ids: steep.slice(0, 10).join(', ') + (steep.length > 10 ? '…' : '') }));
  }

  const selectedPanels = new Map([...levels].map(([z, { owned }]) => [z, owned.flatMap(bay => {
    const { panel, footprint } = bay;
    if (dropped.has(panel)) { lowPanels++; return []; }
    const why = deckReasons.get(panel);
    if (why === 'wide') { widePanels++; return []; }
    const region = fringeKept.get(panel);
    return [{ ...bay, why, region, footprint: region ?? footprint }];
  })]));

  const coverAbove = opts.mode === 'panels' && (dropped.size || fringeKept.size)
    ? coverage(model, out.zOf, selectedPanels, coverShells, wide, gapDecks)
    : preliminaryCover;
  const levelOrder = [...levels.keys()].sort((a, b) => a - b);
  for (const z of levels.keys()) for (const b of flatAt.get(z) ?? []) {
    const g = eligibility.get(b.id)!;
    width(b.id, g.length, g.horizontalLength);
    byWidth++;
  }

  const beforeDepth = out.widthMembers.length;
  out.widthMembers = out.widthMembers.filter(m => !droppedMembers.has(m.elementId));
  for (const m of out.widthMembers) {
    const fringe = memberFringes.get(m.elementId);
    if (fringe) m.spans = fringe.spans;
    addSides(m.elementId, fringe?.sides ?? (opts.mode === 'width' ? panelSides.get(m.elementId) : undefined));
  }

  // Second pass: each panel on its own, as a floor or as a roof.
  const panelBeams: Array<Set<number>> = [];
  const panelLevel: number[] = [];
  for (const [z, { res }] of levels) {
    unresolved += res.skipped.unresolved;
    for (const bay of selectedPanels.get(z) ?? []) {
      const { panel, own, why, region, footprint, geometry, area, areaScale, pieces, points } = bay;
      if (region) fringes++;
      const roof = !coverAbove.areaCovered(bay, opts.uniformPressure === true, region ? undefined : {
        point: centroid(panel.polygon), z: geometry.range[1],
      });
      if (why === 'headroomUnclear') { if (roof) unclearRoof++; else unclear++; }
      const index = panelBeams.length;
      panelBeams.push(new Set(own.perBeam.keys()));
      panelLevel.push(levelOrder.indexOf(z));
      const oneWaySpan = roof && opts.slab === 'oneWay' && !region && footprint.length === 1 && footprint[0]!.length === 1 && geometry.range[0] === geometry.range[1]
        ? opts.spanAxis ?? 'x' : undefined;
      const polygon = oneWaySpan ? openRing(footprint[0]![0]!) : panel.polygon;
      const clipped = region || footprint.length !== 1 || footprint[0]!.length !== 1
        || !agrees(footprintArea(footprint), ringArea(panel.polygon), areaScale);
      out.panels.push({ polygon, z, roof, ...(oneWaySpan ? { oneWaySpan } : {}), ...(!oneWaySpan && clipped ? { footprint } : {}) });
      if (region) {
        const moved = regionToBeams(model, region, [...own.perBeam.keys()]);
        out.panelAreas.push(moved.areas);
        const physical = moved.pieces.map(physicalPiece);
        const kept = verifyBayArea(z, footprint, areaScale, physical, moved.points);
        for (const pc of physical) {
          out.pieces.push({ ...pc, roof, panel: index });
          addSides(pc.elementId, own.sides.get(pc.elementId));
          const a = pc.wI * loadSpanLength(pc, eligibility.get(pc.elementId)!.length);
          addArea(roof ? out.roofAreaOf : out.areaOf, pc.elementId, a);
          if (roof) out.roof.add(pc.elementId);
        }
        for (const pt of moved.points) {
          out.points.push({ ...pt, roof, panel: index });
          addArea(roof ? out.roofAreaOf : out.areaOf, pt.elementId, pt.w);
          if (roof) out.roof.add(pt.elementId);
        }
        out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + kept);
        continue;
      }
      const inputAreas = new Map(own.perBeam);
      for (const point of own.nodal) addArea(inputAreas, point.elementId, -point.fz);
      out.panelAreas.push(inputAreas);
      for (const p of pieces) {
        addSides(p.elementId, own.sides.get(p.elementId));
        out.pieces.push({ ...p, roof, panel: index });
      }
      for (const p of points) {
        out.points.push({ ...p, roof, panel: index });
        addArea(roof ? out.roofAreaOf : out.areaOf, p.elementId, p.w);
      }
      for (const [id, a] of own.perBeam) { addArea(roof ? out.roofAreaOf : out.areaOf, id, a); if (roof) out.roof.add(id); }
      out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + area);
    }
  }
  out.oneSided = [...sidesOf].filter(([, s]) => oneSidedSomewhere(s)).map(([id]) => id).sort((a, b) => a - b);
  if (out.widthMembers.length < beforeDepth) {
    out.notes.push(msg('loadPlan.gravity.membersLowHeadroom', { n: beforeDepth - out.widthMembers.length, h: MIN_STOREY_HEADROOM }));
  }
  if (unclear > 0) out.notes.push(msg('loadPlan.gravity.headroomUnclear', { n: unclear, h: MIN_STOREY_HEADROOM }));
  if (unclearRoof > 0) out.notes.push(msg('loadPlan.gravity.headroomUnclearRoof', { n: unclearRoof, h: MIN_STOREY_HEADROOM }));
  if (fringes > 0) out.notes.push(msg('loadPlan.gravity.roofFringe', { n: fringes }));
  out.panelColour = checkerboard(panelBeams.length, panelLevel,
    (i, j) => panelLevel[i] === panelLevel[j] && [...panelBeams[i]!].some((id) => panelBeams[j]!.has(id)));
  out.widthColour = widthCheckerboard(model, out.widthMembers.map((m) => m.elementId));

  const widthRoofs = new Set<number>();
  const roofStrips: DeckFootprint[] = [];
  for (const m of out.widthMembers) {
    if (typeof attachedCoverage.get(m.elementId) === 'object') continue;
    const fringe = memberFringes.get(m.elementId);
    const trace = segment(m.elementId);
    const roof = fringe && opts.mode === 'panels'
      ? !coverAbove.areaCovered(fringe, opts.uniformPressure === true)
      : !!fringe || !coverAbove.memberCovered(trace);
    if (!roof) continue;
    widthRoofs.add(m.elementId);
    if (gapDecks.length && opts.tributaryWidth > 0) {
      const strip = fringe ?? memberStrip(trace, opts.tributaryWidth);
      const area = footprintArea(strip.footprint);
      if (!(area > 0) || !Number.isFinite(area)) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
      roofStrips.push(strip);
    }
  }

  const runExposure = new Map<readonly CertifiedGap[], boolean>();
  for (const m of out.widthMembers) {
    const attached = attachedCoverage.get(m.elementId);
    let roof = widthRoofs.has(m.elementId);
    if (typeof attached === 'object') {
      const { runGaps } = attached;
      const known = runExposure.get(runGaps);
      if (known === undefined) {
        const exposure = new Set(runGaps.map(gap => coverAbove.areaExposure(gap, undefined, roofStrips)));
        if ((exposure.has('mixed') || exposure.size > 1) && !opts.uniformPressure) {
          refuseGravityGeometry(msg('loadPlan.gravity.mixedExposure'));
        }
        roof = exposure.has('exposed') || exposure.has('mixed');
        runExposure.set(runGaps, roof);
      } else {
        roof = known;
      }
    }
    addArea(roof ? out.roofAreaOf : out.areaOf, m.elementId, widthSpans(m, opts.tributaryWidth).reduce((s, w) => s + w.width * (w.t1 - w.t0), 0) * m.horizontalLength);
    if (roof) out.roof.add(m.elementId);
  }
  for (const shell of opts.mode === 'panels' ? carriers : coverShells) {
    const point = centroid(shell.poly);
    const roof = opts.mode === 'panels'
      ? !coverAbove.areaCovered(shell, opts.uniformPressure === true, {
        point, z: shell.height(point), ownMembers: ownership?.shellBayMembers.get(shell.key),
      }, shell.coverageId)
      : !coverAbove.pointCovered(point, shell.height(point), undefined, Infinity, shell.coverageId);
    if (roof) out.roofShells.add(shell.key);
  }

  if (opts.mode === 'panels') {
    const sloped = out.widthMembers.length - byWidth;
    if (out.pieces.length > 0) out.notes.push(msg('loadPlan.gravity.panels', { members: new Set(out.pieces.map((p) => p.elementId)).size }));
    if (out.widthMembers.length > 0) out.notes.push(msg('loadPlan.gravity.width', { n: out.widthMembers.length, sloped, width: round(opts.tributaryWidth, 2) }));
    if (unresolved > 0) out.notes.push(msg('loadPlan.gravity.unresolved', { n: unresolved }));
    if (lowPanels > 0) out.notes.push(msg('loadPlan.gravity.lowHeadroom', { n: lowPanels, h: MIN_STOREY_HEADROOM }));
    if (widePanels > 0) out.notes.push(msg('loadPlan.gravity.widePanels', { n: widePanels, span: MAX_DECK_SPAN }));
  }
  return out;
}

/** Less clear height than this under the roof's own members is the depth of the roof's structure, not a storey. */
export const MIN_STOREY_HEADROOM = 2.2;
/** A member within the roof's structure keeps its roof load in this many stretches along its length. */
const FRINGE_BINS = 200;
/** A ring of beams wider than this both ways, with no beam or slab inside, is no deck: no slab spans it. */
export const MAX_DECK_SPAN = 12;

type ShellCoverage = 'none' | 'partial' | 'full';
type RunInterval = [number, number];
type AttachmentCoverage = ShellCoverage | 'unresolvedOffset' | 'conflictingGapDecks' | 'eccentricGap' | { gaps: WidthSpan[]; runGaps: readonly CertifiedGap[] };
type ShellOffset = { offset: Segment[0]; error: number; shellNode: number };
type ShellAttachment = { offset: Segment[0]; anchors: Set<number>; shellNodes: Set<number>; error: number };

function attachmentPoint(point: { x: number; y: number; z?: number }, [dx, dy, dz]: Segment[0]): Segment[0] {
  return [point.x + dx, point.y + dy, (point.z ?? 0) + dz];
}

type VerticalShellLink = {
  masterNode: number;
  slaveNode: number;
  geometry?: 'fullMotion' | 'verticalMotion';
};

function verticalShellLinks(model: GravityModel): VerticalShellLink[] {
  const links: VerticalShellLink[] = [];
  const add = (masterNode: number, slaveNode: number, geometry?: VerticalShellLink['geometry']) => {
    if (masterNode !== slaveNode && model.nodes.has(masterNode) && model.nodes.has(slaveNode)) {
      links.push({ masterNode, slaveNode, geometry });
    }
  };
  const dofIndices = [0, 1, 2, 3, 4, 5];
  for (const constraint of model.constraints ?? []) {
    if (constraint.type === 'rigidLink') {
      const dofs = constraint.dofs?.length ? constraint.dofs : [0, 1, 2];
      const fullMotion = dofIndices.every(dof => dofs.includes(dof));
      if (dofs.includes(2)) add(constraint.masterNode, constraint.slaveNode, fullMotion ? 'fullMotion' : 'verticalMotion');
    } else if (constraint.type === 'eccentricConnection') {
      const { masterNode, slaveNode, releases } = constraint;
      const master = model.nodes.get(masterNode), slave = model.nodes.get(slaveNode);
      if (!master || !slave || releases?.[2]) continue;
      const [x, y, z] = attachmentPoint(master, [constraint.offsetX ?? 0, constraint.offsetY ?? 0, constraint.offsetZ ?? 0]);
      const fullMotion = dofIndices.every(dof => !releases?.[dof]);
      const geometry = samePhysicalPoint({ x, y, z }, slave) ? (fullMotion ? 'fullMotion' : 'verticalMotion') : undefined;
      add(masterNode, slaveNode, geometry);
    } else if (constraint.type === 'equalDOF' && constraint.dofs.includes(2)) {
      add(constraint.masterNode, constraint.slaveNode);
    } else if (constraint.type === 'diaphragm' && ['XZ', 'YZ'].includes(constraint.plane?.toUpperCase() ?? '')) {
      for (const slave of constraint.slaveNodes) add(constraint.masterNode, slave);
    } else if (constraint.type === 'linearMPC' && constraint.terms.length === 2) {
      const [first, second] = constraint.terms;
      if (first?.dof === 2 && second?.dof === 2 && Number.isFinite(first.coefficient)
        && first.coefficient !== 0 && first.coefficient === -second.coefficient) add(first.nodeId, second.nodeId);
    }
  }
  return links;
}

function groundedStations(model: GravityModel, requireAll = false): Set<number> {
  const grounded = new Set<number>();
  for (const [id, support] of model.supports ?? []) {
    if (!support.type) continue;
    try {
      const dofs = supportDofs3D({ ...support, id, type: support.type });
      const vertical = dofs.rz && (support.dofFrame !== 'local' || (dofs.rx && dofs.ry));
      const fixed = dofs.rx && dofs.ry && dofs.rz && dofs.rrx && dofs.rry && dofs.rrz
        && !support.uplift && !support.curves && !support.isInclined;
      if (requireAll ? fixed : vertical) grounded.add(support.nodeId);
    } catch (error) {
      if (!(error instanceof SupportMappingError)) throw error;
    }
  }
  return grounded;
}

function shellOffsets(
  model: GravityModel, shellNodes: ReadonlySet<number>, frameNodes: ReadonlySet<number>, geometry: AttachmentComponents,
): Map<number, ShellOffset[]> {
  const offsets = new Map<number, ShellOffset[]>();
  const shellsByComponent = geometry.index(shellNodes);
  for (const frameNode of frameNodes) {
    const member = model.nodes.get(frameNode)!;
    const matches = new Set(geometry.roots(frameNode).flatMap(root => shellsByComponent.get(root) ?? []));
    for (const shellNode of matches) {
      const shell = model.nodes.get(shellNode)!;
      const mz = member.z ?? 0, sz = shell.z ?? 0;
      const offset: Segment[0] = [shell.x - member.x, shell.y - member.y, sz - mz];
      const error = 64 * Number.EPSILON * Math.max(Math.abs(member.x), Math.abs(member.y), Math.abs(mz), Math.abs(shell.x), Math.abs(shell.y), Math.abs(sz));
      if (Math.hypot(...offset) <= error) continue;
      (offsets.get(frameNode) ?? offsets.set(frameNode, []).get(frameNode)!).push({ offset, error, shellNode });
    }
  }
  return offsets;
}

type CertifiedGap = WidthSpan & DeckFootprint & { centered: boolean };

function gapFootprint([start, end]: Segment, t0: number, t1: number, [lo, hi]: RunInterval, centered: boolean): CertifiedGap {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const ring: PlanPoint[] = [[t0, lo], [t1, lo], [t1, hi], [t0, hi]];
  const footprint = ring.map(([t, side]): PlanPoint => [
    start[0] + t * dx - side * dy / length, start[1] + t * dy + side * dx / length,
  ]);
  const width = hi - lo;
  return { t0, t1, width, centered, footprint: [[footprint]], geometry: memberStrip([start, end], width).geometry };
}

function gapTraceShells([start, end]: Segment, carriers: readonly ShellCarrier[], error: number): ShellCarrier[] {
  return carriers.filter(({ plane }) => plane && samePhysicalDeck([
    [plane([start[0], start[1]]), start[2]], [plane([end[0], end[1]]), end[2]],
  ], error));
}

function refuseGapAttachment(members: ReadonlySet<number>, shells: readonly ShellCarrier[]): never {
  return refuseGravityGeometry(msg('loadPlan.gravity.gapAttachment', {
    members: [...members].sort((a, b) => a - b).join(', '),
    shells: [...new Set(shells.map(shell => shell.key))].sort().join(', '),
  }));
}

function boundedGapSpans(
  [start, end]: Segment, intervals: readonly RunInterval[], members: ReadonlySet<number>,
  { attached, detached, error }: { attached: readonly ShellCarrier[]; detached: readonly ShellCarrier[]; error: number },
): CertifiedGap[] | undefined {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const along = (x: number, y: number) => ((x - start[0]) * dx + (y - start[1]) * dy) / length;
  const across = (x: number, y: number) => ((y - start[1]) * dx - (x - start[0]) * dy) / length;
  const project = ({ pts }: ShellCarrier) => pts.map(([x, y, z]) => [along(x, y), across(x, y), z] as const);
  const shells = attached.map(project);
  const others = detached.map(shell => ({ shell, points: project(shell) }));
  const stationEdges = (points: ReturnType<typeof project>, station: number, sign: number) => {
    if (points.some(([a]) => (a - station) * sign < -error)) return [];
    return points.flatMap((p, i) => {
      const q = points[(i + 1) % points.length]!;
      return Math.abs(p[0] - station) <= error && Math.abs(q[0] - station) <= error && Math.abs(p[1] - q[1]) > error
        ? [[p, q] as const] : [];
    });
  };
  const boundary = (station: number, sign: number, elevation: number): RunInterval | undefined => {
    const edges: RunInterval[] = [];
    for (const points of shells) {
      for (const [[, b, z], [, d, w]] of stationEdges(points, station, sign)) {
        if (Math.abs(z - elevation) > error || Math.abs(w - elevation) > error) return undefined;
        edges.push([Math.min(b, d), Math.max(b, d)]);
      }
    }
    edges.sort(([a], [b]) => a - b);
    const first = edges[0];
    if (!first) return undefined;
    let far = first[1];
    for (const [lo, hi] of edges.slice(1)) {
      if (Math.abs(lo - far) > error) return undefined;
      far = hi;
    }
    return first[0] <= error && far >= -error ? [first[0], far] : undefined;
  };
  const gaps: RunInterval[] = [];
  for (const [t0, t1] of intervals) {
    const previous = gaps.at(-1);
    if (previous && (t0 - previous[1]) * length <= error) previous[1] = t1;
    else gaps.push([t0, t1]);
  }
  const spans: CertifiedGap[] = [];
  const elevationAt = (t: number) => start[2] + (end[2] - start[2]) * t;
  for (const [t0, t1] of gaps) {
    const a = t0 * length, b = t1 * length;
    const left = boundary(a, -1, elevationAt(t0)), right = boundary(b, 1, elevationAt(t1));
    if (!left || !right || Math.abs(left[0] - right[0]) > error || Math.abs(left[1] - right[1]) > error) {
      const unproven = others.filter(({ points }) => stationEdges(points, a, -1).length || stationEdges(points, b, 1).length);
      if (unproven.length) refuseGapAttachment(members, unproven.map(({ shell }) => shell));
      return undefined;
    }
    const [lo, hi] = left;
    const gap: Polygon = [[[a, lo], [b, lo], [b, hi], [a, hi]]];
    const intrudes = (points: ReturnType<typeof project>) =>
      points.some(([station]) => station > a + error) && points.some(([station]) => station < b - error)
      && footprintIntersection(gap, [points.map(([x, y]): PlanPoint => [x, y])]).length > 0;
    const unproven = others.filter(({ points }) => intrudes(points));
    if (unproven.length) refuseGapAttachment(members, unproven.map(({ shell }) => shell));
    if (shells.some(intrudes)) return undefined;
    const centered = Math.abs(lo + hi) <= error && Math.abs(right[0] + right[1]) <= error;
    spans.push(gapFootprint([start, end], t0, t1, left, centered));
  }
  return spans;
}

function rigidShellCoverage(
  model: GravityModel, offsets: ReadonlyMap<number, ShellOffset[]>, carriers: ShellCarrier[], members: Iterable<number>,
  legacyGapMembers?: Set<number>,
): Map<number, AttachmentCoverage> {
  const byMember = new Map<number, AttachmentCoverage>();
  if (!offsets.size) return byMember;
  const shellsAtNode = new Map<number, ShellCarrier[]>();
  for (const carrier of carriers) for (const node of carrier.nodes) {
    (shellsAtNode.get(node) ?? shellsAtNode.set(node, []).get(node)!).push(carrier);
  }
  const axes = memberGeometry(model, members);
  const axesById = new Map(axes.map(axis => [axis.id, axis]));
  const runs = physicalRoofRuns(axes, (a, b) => a === b);
  const trace = (id: number, offset: Segment[0]): Segment => {
    const { a, b } = axesById.get(id)!;
    return [attachmentPoint(a, offset), attachmentPoint(b, offset)];
  };
  const sharesShellTrace = (id: number): boolean => {
    const { nodeI, nodeJ } = model.elements.get(id)!;
    const shells = [...shellsAtNode.get(nodeI) ?? [], ...shellsAtNode.get(nodeJ) ?? []];
    return shells.length > 0 && shellCoverage(trace(id, [0, 0, 0]), shells, false) !== 'none';
  };
  const claimedGaps: CertifiedGap[] = [];
  for (const run of runs) {
    const { members: ids } = run;
    const nodes = new Set([...ids].flatMap(id => {
      const { nodeI, nodeJ } = model.elements.get(id)!;
      return [nodeI, nodeJ];
    }));
    const attachments: ShellAttachment[] = [];
    for (const nodeId of nodes) for (const { offset, error, shellNode } of offsets.get(nodeId) ?? []) {
      const matching = attachments.find(a => Math.hypot(offset[0] - a.offset[0], offset[1] - a.offset[1], offset[2] - a.offset[2]) <= Math.max(error, a.error));
      if (matching) {
        matching.anchors.add(nodeId);
        matching.shellNodes.add(shellNode);
      } else {
        attachments.push({ offset, error, anchors: new Set([nodeId]), shellNodes: new Set([shellNode]) });
      }
    }
    let coverage: Exclude<AttachmentCoverage, object> = 'none';
    let boundedGap:
      | { kind: 'legacy'; intervals: RunInterval[]; members: Set<number> }
      | { kind: 'certified'; spans: CertifiedGap[] }
      | undefined;
    const unresolvedVerticalAnchors = new Set<number>();
    for (const { offset, anchors, shellNodes, error } of attachments) {
      if (Math.abs(offset[2]) >= MIN_STOREY_HEADROOM) continue;
      const traces = [...ids].map(id => trace(id, offset));
      const covered = traces.map(trace => shellCoverage(trace, carriers));
      if (!samePhysicalDeck([[offset[2], 0]], MIN_COVER_RISE)) {
        if (covered.every(state => state === 'none')) {
          if (Math.hypot(offset[0], offset[1]) <= error) {
            const linkedShells = [...new Set([...shellNodes].flatMap(node => shellsAtNode.get(node) ?? []))];
            if (traces.some(trace => shellCoverage(trace, linkedShells, false) !== 'none')) {
              for (const anchor of anchors) unresolvedVerticalAnchors.add(anchor);
            }
          }
          continue;
        }
        coverage = 'unresolvedOffset';
        break;
      }
      const anchored = [run.a, run.b].every(end => [...anchors].some(id => model.nodes.get(id) === end));
      const runTrace: Segment = [attachmentPoint(run.a, offset), attachmentPoint(run.b, offset)];
      const canBoundGap = anchored && Math.hypot(offset[0], offset[1]) <= error && Math.abs(runTrace[1][2] - runTrace[0][2]) > TOL;
      const traceError = 64 * Number.EPSILON * Math.max(run.length, ...runTrace.flat().map(Math.abs));
      const matching = canBoundGap && !legacyGapMembers ? gapTraceShells(runTrace, carriers, traceError) : [];
      const components = shellEdgeComponents(matching, shell => shell.nodes);
      const established = new Set(matching.filter(shell => shell.nodes.some(node => shellNodes.has(node)))
        .flatMap(shell => components.get(shell)!));
      const attached = [...established];
      const detached = matching.filter(shell => !established.has(shell));
      const gaps = canBoundGap ? shellTrace(runTrace, legacyGapMembers ? carriers : attached).gaps : [];
      const bounded = (spans: readonly RunInterval[]) => spans.length > 0 && spans.every(([t0, t1]) => t0 > 0 && t1 < 1);
      if (detached.length && gaps.length && !bounded(gaps)) {
        const combined = shellTrace(runTrace, matching);
        if (combined.coverage === 'full' || bounded(combined.gaps)) {
          refuseGapAttachment(ids, detached.filter(shell => shellCoverage(runTrace, [shell]) !== 'none'));
        }
      }
      if (bounded(gaps)) {
        if (coverage !== 'none') { coverage = 'partial'; break; }
        if (legacyGapMembers) {
          if (!boundedGap) boundedGap = { kind: 'legacy', intervals: [], members: legacyGapMembers };
          if (boundedGap.kind === 'legacy') boundedGap.intervals.push(...gaps);
          continue;
        }
        const certified = boundedGapSpans(runTrace, gaps, ids, { attached, detached, error: traceError });
        if (!certified) { coverage = 'partial'; break; }
        if (boundedGap) { coverage = 'conflictingGapDecks'; break; }
        boundedGap = { kind: 'certified', spans: certified };
      } else if (anchors.size > 1 && covered.every(state => state === 'full')) {
        if (boundedGap) { coverage = 'partial'; break; }
        coverage = 'full';
      } else if (covered.some(state => state !== 'none') || traces.some(trace => shellCoverage(trace, carriers, false) !== 'none')) {
        coverage = 'partial';
        break;
      }
    }
    if (coverage === 'none' && (unresolvedVerticalAnchors.size > 1 ||
      (unresolvedVerticalAnchors.size === 1 && [...ids].some(sharesShellTrace)))) {
      coverage = 'unresolvedOffset';
    }
    if (boundedGap && coverage === 'none' && !unresolvedVerticalAnchors.size) {
      if (boundedGap.kind === 'certified' && boundedGap.spans.some(gap =>
        claimedGaps.some(other => deckOverlaps(gap, other).some(part => !part.separated(TOL))))) {
        for (const id of ids) byMember.set(id, 'partial');
        continue;
      }
      const station = (point: { x: number; y: number }) =>
        ((point.x - run.a.x) * run.direction[0] + (point.y - run.a.y) * run.direction[1]) / run.length;
      const parts = [...ids].map(id => {
        const axis = axesById.get(id)!;
        const a = station(axis.a), b = station(axis.b);
        const tolerance = 64 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
        return { id, a, b, start: Math.min(a, b), end: Math.max(a, b), tolerance };
      }).sort((a, b) => a.start - b.start);
      if (parts.some((part, i) => i > 0 && part.start !== parts[i - 1]!.end)) {
        for (const id of ids) byMember.set(id, 'partial');
        continue;
      }
      if (boundedGap.kind === 'legacy') {
        for (const { id, start, end, tolerance } of parts) {
          if (boundedGap.intervals.some(([t0, t1]) => Math.min(t1, end) - Math.max(t0, start) > tolerance)) boundedGap.members.add(id);
        }
        continue;
      }
      const gapSpans = boundedGap.spans;
      claimedGaps.push(...gapSpans);
      if (gapSpans.some(gap => !gap.centered)) {
        for (const id of ids) byMember.set(id, 'eccentricGap');
        continue;
      }
      for (const { id, a, b, start, end, tolerance } of parts) {
        const gaps: WidthSpan[] = [];
        for (const { t0, t1, width } of gapSpans) {
          const lo = Math.max(t0, start), hi = Math.min(t1, end);
          if (hi - lo <= tolerance) continue;
          const first = ((a < b ? lo : hi) - a) / (b - a);
          const last = ((a < b ? hi : lo) - a) / (b - a);
          gaps.push({ t0: Math.max(0, first), t1: Math.min(1, last), width });
        }
        byMember.set(id, { gaps: gaps.sort((a, b) => a.t0 - b.t0), runGaps: gapSpans });
      }
    } else if (coverage !== 'none' || boundedGap) {
      for (const id of ids) byMember.set(id, coverage === 'none' ? 'partial' : coverage);
    }
  }
  return byMember;
}

function shellCoverage(trace: Segment, carriers: ShellCarrier[], requireCoplanar = true): ShellCoverage {
  return shellTrace(trace, carriers, requireCoplanar).coverage;
}

function cutPlanTrace(p: Segment[0], q: Segment[1], a: PlanPoint, b: PlanPoint, add: (t: number) => void, error: number) {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const px = a[0] - p[0], py = a[1] - p[1];
  const length = Math.hypot(dx, dy);
  const det = dx * ey - dy * ex;
  if (Math.abs(det) > error * Math.hypot(ex, ey)) {
    const u = (px * dy - py * dx) / det;
    if (u >= 0 && u <= 1) add((px * ey - py * ex) / det);
  } else if (Math.abs(px * dy - py * dx) <= error * length) {
    add((px * dx + py * dy) / length ** 2);
    add(((b[0] - p[0]) * dx + (b[1] - p[1]) * dy) / length ** 2);
  }
}

function shellTrace([p, q]: Segment, carriers: ShellCarrier[], requireCoplanar = true): { coverage: ShellCoverage; gaps: RunInterval[] } {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const length = Math.hypot(dx, dy);
  const error = 64 * Number.EPSILON * Math.max(length, ...p.map(Math.abs), ...q.map(Math.abs));
  const eligible = carriers.filter(({ poly }) => {
    const { left, right, bottom, top } = footprintBounds(poly);
    return Math.max(p[0], q[0]) >= left - error && Math.min(p[0], q[0]) <= right + error
      && Math.max(p[1], q[1]) >= bottom - error && Math.min(p[1], q[1]) <= top + error;
  });
  if (!eligible.length) return { coverage: 'none', gaps: [[0, 1]] };
  const pointAt = (t: number): [number, number] => [p[0] + t * dx, p[1] + t * dy];
  const cuts = [0, 1];
  const add = (t: number) => { if (t > error / length && t < 1 - error / length) cuts.push(t); };
  for (const { poly } of eligible) {
    poly.forEach((a, i) => cutPlanTrace(p, q, a, poly[(i + 1) % poly.length]!, add, error));
  }
  cuts.sort((x, y) => x - y);
  const intervals = cuts.slice(1).flatMap((end, i) => {
    const start = cuts[i]!;
    return end - start <= error / length ? [] : [{ start, end, center: pointAt(start + (end - start) / 2) }];
  });
  const covered = new Set<number>();
  for (const carrier of eligible) {
    const overlaps = intervals.flatMap(({ center }, i) => inside(center, carrier.poly, error) ? [i] : []);
    if (overlaps.length === 0) continue;
    if (requireCoplanar) {
      const elevations = overlaps.flatMap(i => {
        const { start, end } = intervals[i]!;
        return [start, end].map(t => [carrier.plane?.(pointAt(t)) ?? NaN, p[2] + t * (q[2] - p[2])] as const);
      });
      if (!samePhysicalDeck(elevations, error)) continue;
    }
    for (const index of overlaps) covered.add(index);
  }
  const gaps = intervals.flatMap(({ start, end }, i): RunInterval[] => covered.has(i) ? [] : [[start, end]]);
  return { coverage: !covered.size ? 'none' : gaps.length ? 'partial' : 'full', gaps };
}

class NodeComponents {
  private readonly parent = new Map<number, number>();

  root(node: number): number {
    let parent = this.parent.get(node);
    while (parent !== undefined && parent !== node) {
      const next = this.parent.get(parent)!;
      this.parent.set(node, next);
      node = parent;
      parent = next;
    }
    return node;
  }

  join(a: number, b: number): void {
    const root = this.root(b);
    if (!this.parent.has(root)) this.parent.set(root, root);
    this.parent.set(this.root(a), root);
  }
}

type AttachmentRoot = number | VerticalShellLink;

class AttachmentComponents {
  private readonly interior = new NodeComponents();
  private readonly ends = new Map<number, Set<AttachmentRoot>>();

  constructor(links: readonly VerticalShellLink[], terminals: ReadonlySet<number>) {
    for (const { masterNode, slaveNode } of links) {
      if (!terminals.has(masterNode) && !terminals.has(slaveNode)) this.interior.join(masterNode, slaveNode);
    }
    const attach = (node: number, other: number, link: VerticalShellLink) => {
      if (!terminals.has(node)) return;
      const root = terminals.has(other) ? link : this.interior.root(other);
      (this.ends.get(node) ?? this.ends.set(node, new Set()).get(node)!).add(root);
    };
    for (const link of links) {
      attach(link.masterNode, link.slaveNode, link);
      attach(link.slaveNode, link.masterNode, link);
    }
  }

  roots(node: number): AttachmentRoot[] {
    return [this.interior.root(node), ...this.ends.get(node) ?? []];
  }

  index(nodes: ReadonlySet<number>): Map<AttachmentRoot, number[]> {
    const byRoot = new Map<AttachmentRoot, number[]>();
    for (const node of nodes) for (const root of this.roots(node)) {
      (byRoot.get(root) ?? byRoot.set(root, []).get(root)!).push(node);
    }
    return byRoot;
  }
}

function directlyGroundedShells(model: GravityModel, shells: ShellCarrier[], grounded: ReadonlySet<number>) {
  const fixedBy = new Map<number, Set<number>>();
  for (const constraint of model.constraints ?? []) {
    if (constraint.type !== 'equalDOF' || !constraint.dofs.includes(2) || !grounded.has(constraint.masterNode)) continue;
    const masters = fixedBy.get(constraint.slaveNode) ?? new Set<number>();
    masters.add(constraint.masterNode);
    fixedBy.set(constraint.slaveNode, masters);
  }
  const result = new Map<ShellCarrier, number[]>();
  if (!fixedBy.size) return result;
  for (const shell of shells) {
    const stations = new Map<number, Polygon[number]>();
    shell.nodes.forEach((id, i) => {
      for (const master of fixedBy.get(id) ?? []) {
        const points = stations.get(master) ?? [];
        points.push(shell.poly[i]!);
        stations.set(master, points);
      }
    });
    for (const [master, [a, b, ...other]] of stations) {
      if (!a || !b || !other.some(c => orient2d(...a, ...b, ...c) !== 0)) continue;
      const masters = result.get(shell) ?? [];
      masters.push(master);
      result.set(shell, masters);
    }
  }
  return result;
}

function verticalSupportPaths(model: GravityModel, supports: ReadonlySet<number>): ReadonlySet<number> {
  const above = new Map<number, number[]>();
  for (const member of model.elements.values()) {
    const { nodeI, nodeJ, behaviour, offset, jointI, jointJ, releaseI, releaseJ } = member;
    const a = model.nodes.get(nodeI), b = model.nodes.get(nodeJ);
    if (!a || !b || a.x !== b.x || a.y !== b.y || (a.z ?? 0) === (b.z ?? 0)) continue;
    if (behaviour || offset || jointI?.dof[2] || jointJ?.dof[2] || releaseI?.slide || releaseJ?.slide) continue;
    const [base, top] = (a.z ?? 0) < (b.z ?? 0) ? [nodeI, nodeJ] : [nodeJ, nodeI];
    (above.get(base) ?? above.set(base, []).get(base)!).push(top);
  }
  const reachable = new Set(supports);
  for (const base of reachable) for (const top of above.get(base) ?? []) reachable.add(top);
  return reachable;
}

function independentDecks(model: GravityModel) {
  const supports = groundedStations(model);
  for (const support of model.supports?.values() ?? []) {
    if (support.uplift || support.curves || support.isInclined) supports.delete(support.nodeId);
  }
  if (supports.size === 0) return () => false;
  const reachable = verticalSupportPaths(model, supports);
  const fixed = groundedStations(model, true);
  const connection = new NodeComponents();
  const join = ([first, ...others]: number[]) => {
    if (first !== undefined) for (const node of others) connection.join(first, node);
  };
  for (const { nodeI, nodeJ, type } of model.elements.values()) {
    if (type !== 'truss' || !fixed.has(nodeI) || !fixed.has(nodeJ)) connection.join(nodeI, nodeJ);
  }
  for (const { nodeI, nodeJ } of model.connectors?.values() ?? []) connection.join(nodeI, nodeJ);
  for (const { cell } of gravityShellCells(model)) join(cell.nodes);
  for (const constraint of model.constraints ?? []) {
    if (constraint.type === 'linearMPC') join(constraint.terms.map(term => term.nodeId));
    else if (constraint.type === 'diaphragm') join([constraint.masterNode, ...constraint.slaveNodes]);
    else connection.join(constraint.masterNode, constraint.slaveNode);
  }
  return (shell: ShellCarrier, bay: FloorBay) => {
    const boundary = bay.boundaryNodes.flat();
    if (!shell.nodes.every(node => reachable.has(node)) || !bay.sides.every(side => reachable.has(side.nodeA))) return false;
    const roots = new Set(boundary.map(node => connection.root(node)));
    return shell.nodes.every(node => !roots.has(connection.root(node)));
  };
}

function shellBayAttachments(
  model: GravityModel, levels: ReadonlyMap<number, FloorBeam[]>,
  links: readonly VerticalShellLink[], terminals: ReadonlySet<number>,
) {
  if (!links.length) return () => 'independent' as const;
  const coupled = new AttachmentComponents(links, terminals);
  const frames = new NodeComponents();
  const rigidLinks = links.filter(link => link.geometry === 'fullMotion');
  const motion = new AttachmentComponents(rigidLinks, terminals);
  const flatNodes = new Set<number>();
  const point = (id: number) => model.nodes.get(id)!;
  const height = (id: number) => point(id).z ?? 0;
  for (const beams of levels.values()) for (const { nodeI, nodeJ } of beams) {
    if (height(nodeI) !== height(nodeJ)) continue;
    frames.join(nodeI, nodeJ);
    flatNodes.add(nodeI);
    flatNodes.add(nodeJ);
  }
  const stations = motion.index(flatNodes);
  return (shell: ShellCarrier, bay: FloorBay): 'independent' | 'linked' | 'attached' => {
    const boundary = bay.boundaryNodes[0]!;
    const roots = new Set(bay.boundaryNodes.flat().flatMap(node => coupled.roots(node)));
    const linked = shell.nodes.some(node => coupled.roots(node).some(root => roots.has(root)));
    const first = boundary[0]!;
    const z = height(first);
    const shellZ = shell.pts[0]![2];
    const flat = shellZ !== z && shell.pts.every(p => p[2] === shellZ)
      && boundary.every(id => height(id) === z && frames.root(id) === frames.root(first));
    if (flat && shell.nodes.every(node => motion.roots(node).some(root => stations.get(root)?.some(other =>
      frames.root(other) === frames.root(first) && point(other).x === point(node).x && point(other).y === point(node).y)))) {
      return 'attached';
    }
    return linked ? 'linked' : 'independent';
  };
}

/** Why a panel of beams is not a floor or a roof deck, if it is not. */
function notADeck(
  model: GravityModel,
  carriers: ShellCarrier[],
  coverAbove: ReturnType<typeof coverage>,
  panelMode: boolean,
): {
  why: (poly: PlanPoint[], deck: DeckFootprint, retainedBays?: readonly DeckFootprint[]) => 'lowHeadroom' | 'shellHeadroom' | 'wide' | 'headroomUnclear' | null;
  uncarried: (deck: DeckFootprint, bays: readonly DeckFootprint[], strips: readonly DeckFootprint[]) => Region;
} {
  const headroomMembers = new Map<number, Segment>();
  const roofStatus = new Map<number, boolean>();
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    if (!a || !b || !beamLike(model, e).ok) continue;
    const member: Segment = [[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]];
    headroomMembers.set(e.id, member);
  }
  const isRoof = (id: number, segment: Segment) => {
    const known = roofStatus.get(id);
    if (known !== undefined) return known;
    const roof = !coverAbove.memberCovered(segment);
    roofStatus.set(id, roof);
    return roof;
  };
  const heightAbove = (p: [number, number], z: number, includeShells: boolean): number => {
    let h = Infinity;
    for (const [id, segment] of headroomMembers) {
      const [a, b] = segment;
      if (!nearSegment(p, [a[0], a[1]], [b[0], b[1]], 0.1)) continue;
      const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2)) : 0;
      const dz = a[2] + t * (b[2] - a[2]) - z;
      if (dz > TOL && dz < h && isRoof(id, segment)) h = dz;
    }
    for (const c of includeShells ? carriers : []) {
      if (ringLocation(pointQuery(p), c.poly) === 'outside') continue;
      const dz = c.height(p) - z;
      if (dz > TOL) h = Math.min(h, dz);
    }
    return h;
  };
  const between = (p: [number, number], z: number, poly: Array<[number, number]>): number => {
    let h = Infinity;
    for (const v of scanDirections(poly)) {
      const across = (q: [number, number]) => (q[0] - p[0]) * -v[1] + (q[1] - p[1]) * v[0];
      const alongOf = (q: [number, number]) => (q[0] - p[0]) * v[0] + (q[1] - p[1]) * v[1];
      const extent = poly.map(alongOf);
      const lo = Math.min(...extent) - 0.1, hi = Math.max(...extent) + 0.1;
      let below: [number, number] | null = null, above: [number, number] | null = null;
      for (const [id, segment] of headroomMembers) {
        const [a, b] = segment;
        if (Math.max(a[2], b[2]) <= z + TOL) continue;
        const da = across([a[0], a[1]]), db = across([b[0], b[1]]);
        if ((da > 1e-9 && db > 1e-9) || (da < -1e-9 && db < -1e-9) || Math.abs(da - db) <= 1e-12) continue;
        const t = Math.max(0, Math.min(1, da / (da - db)));
        const off = alongOf([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        const dz = a[2] + t * (b[2] - a[2]) - z;
        if (dz < -TOL || off < lo || off > hi) continue;
        if (off < 0 && (!below || off > below[0]) && isRoof(id, segment)) below = [off, dz];
        if (off > 0 && (!above || off < above[0]) && isRoof(id, segment)) above = [off, dz];
      }
      if (below && above) h = Math.min(h, Math.max(0, below[1] + ((above[1] - below[1]) * -below[0]) / (above[0] - below[0])));
    }
    return h;
  };
  const uncarried = ({ footprint, geometry }: DeckFootprint, bays: readonly DeckFootprint[], strips: readonly DeckFootprint[]): Region => {
    const flat = (deck: DeckSurface) => deck.range[0] === deck.range[1];
    const trimFraming = (region: Region, cover: Region): Region => cover.length ? region.flatMap(polygon => {
      const [x, y] = polygon[0]![0]!;
      const local = (p: Polygon) => shift([p], -x, -y)[0]!;
      const source = local(polygon), obstructions = cover.map(local);
      const total = footprintArea([polygon]);
      const kept = trimFootprint(source, obstructions, total);
      return shift(kept, x, y);
    }) : region;
    const trimShells = (region: Region, shells: readonly DeckFootprint[], pending: Set<DeckFootprint>): Region => {
      if (!shells.length) return region;
      let clipped = false;
      const remaining = region.flatMap(polygon => {
        const cover = unionFootprints(headroomCover({ footprint: [polygon], geometry }, shells, pending));
        if (!cover.length) return [polygon];
        clipped = true;
        const remainder = subtractFootprints(polygon, cover);
        const originalArea = footprintArea([polygon]);
        const coveredArea = footprintArea(cover);
        if (!(coveredArea > 0) || !agrees(footprintArea(remainder) + coveredArea, originalArea, originalArea)) {
          refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
        }
        return remainder;
      });
      return clipped ? remaining : region;
    };

    let framing = bays;
    let inferred = strips;
    let shells: readonly DeckFootprint[] = panelMode ? carriers : [];
    let region = footprint;
    for (;;) {
      const pendingFraming = new Set<DeckFootprint>(), pendingShells = new Set<DeckFootprint>();
      const lower = { footprint: region, geometry };
      const stripCover = inferred.flatMap(upper => {
        const band = deckRangeBand(geometry, upper.geometry, TOL, MIN_STOREY_HEADROOM);
        return band === 'full' && flat(geometry) && flat(upper.geometry)
          ? upper.footprint : headroomCover(lower, [upper], pendingFraming);
      });
      const cover = [...headroomCover(lower, framing, pendingFraming), ...stripCover];
      const retained = trimFraming(region, cover);
      const remaining = trimShells(retained, shells, pendingShells);
      if (!remaining.length || (!pendingFraming.size && !pendingShells.size)) return remaining;
      if (remaining === region || footprintArea(remaining) >= footprintArea(region)) {
        refuseGravityGeometry(msg('loadPlan.gravity.uncertainDeckCover'));
      }
      region = remaining;
      framing = [...pendingFraming];
      shells = [...pendingShells];
      inferred = [];
    }
  };
  const headroom = (poly: PlanPoint[], deck: DeckFootprint, retainedBays: readonly DeckFootprint[]): 'lowHeadroom' | 'headroomUnclear' | null => {
    const probes: Array<[number, number]> = [centroid(poly)];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      for (const t of [0.25, 0.5, 0.75]) probes.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    });
    const { geometry } = deck;
    const heights = probes.map(p => {
      const [, z] = geometry.heights(p);
      const h = heightAbove(p, z, !panelMode);
      return Number.isFinite(h) ? h : between(p, z, poly);
    });
    const roofed = heights.filter(Number.isFinite);
    const low = roofed.some((h) => h > TOL && h < MIN_STOREY_HEADROOM);
    if (low && roofed.length === probes.length) {
      const center = probes[0]!;
      const z = geometry.heights(center)[1];
      const allLow = Math.max(...roofed) < MIN_STOREY_HEADROOM;
      if (allLow && coverAbove.pointCovered(center, z, undefined, MIN_STOREY_HEADROOM)) return 'lowHeadroom';
      if (panelMode && !allLow && headroomOverlaps(deck, retainedBays).length && coverAbove.pointCovered(center, z)) {
        return 'lowHeadroom';
      }
    }
    return low ? 'headroomUnclear' : null;
  };
  const why = (poly: PlanPoint[], deck: DeckFootprint, retainedBays: readonly DeckFootprint[] = []) => {
    const clearance = headroom(poly, deck, retainedBays);
    if (clearance === 'lowHeadroom') return clearance;
    if (panelMode && headroomOverlaps(deck, carriers).length) {
      return 'shellHeadroom';
    }
    return isWideDeck(poly) ? 'wide' : clearance;
  };
  return { why, uncarried };
}

/** The height of a shell over a plan point, from the triangle of its fan the point falls in. */
function heightIn(p: Array<[number, number, number]>, pt: [number, number, number]): number {
  let best = Infinity, z = NaN;
  for (let i = 1; i + 1 < p.length; i++) {
    const a = p[0]!, b = p[i]!, c = p[i + 1]!;
    const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(det) < 1e-12) continue;
    const u = ((pt[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (pt[1] - a[1])) / det;
    const v = ((b[0] - a[0]) * (pt[1] - a[1]) - (pt[0] - a[0]) * (b[1] - a[1])) / det;
    // How far outside the triangle the point is; the nearest triangle wins on a shared edge.
    const out = Math.max(0, -u, -v, u + v - 1);
    if (out < best) { best = out; z = a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]); }
  }
  return z;
}

type Segment = [[number, number, number], [number, number, number]];

/** The directions along and across the sides of `poly`, each once, so a panel is probed alike at any angle in plan. */
function scanDirections(poly: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const add = (v: [number, number]) => {
    if (!out.some((w) => Math.abs(w[0] * v[1] - w[1] * v[0]) < 1e-9)) out.push(v);
  };
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L <= 1e-12) return;
    const u: [number, number] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    add(u);
    add([-u[1], u[0]]);
  });
  return out.length > 0 ? out : [[1, 0], [0, 1]];
}

type Region = Polygon[];

type Axis = { p: [number, number]; u: [number, number]; L: number };

function signedArea(ring: Array<[number, number]>): number {
  const o = ring[0];
  if (!o) return 0;
  let s = 0;
  ring.forEach((a, k) => {
    const b = ring[(k + 1) % ring.length]!;
    s += (a[0] - o[0]) * (b[1] - o[1]) - (b[0] - o[0]) * (a[1] - o[1]);
  });
  return s / 2;
}

function closeRing(poly: Array<[number, number]>): Array<[number, number]> {
  const a = signedArea(poly) < 0 ? [...poly].reverse() : poly;
  return [...a, a[0]!];
}

function openRing(ring: Array<[number, number]>): Array<[number, number]> {
  const n = ring.length;
  return n > 1 && ring[0]![0] === ring[n - 1]![0] && ring[0]![1] === ring[n - 1]![1] ? ring.slice(0, -1) : ring;
}

function shift(r: Region, dx: number, dy: number): Region {
  return r.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x + dx, y + dy] as [number, number])));
}

function trimFootprint(source: Polygon, cover: Polygon[], total: number): Region {
  const significant = (part: Polygon) => !agrees(footprintArea([part]), 0, total);
  const snap = (p: Polygon, step: number) => p.map(ring => ring.map(([x, y]): PlanPoint =>
    [Math.round(x / step) * step, Math.round(y / step) * step]));
  const grid = 1e-9;
  const onGrid = source.length === 1 && source[0]!.every(point =>
    point.every(value => Math.round(value / grid) * grid === value));
  if (onGrid) return subtractFootprints(source.map(closeRing), cover.map(poly => snap(poly.map(closeRing), grid))).filter(significant);

  try {
    return subtractFootprints(source, cover).filter(significant);
  } catch (error) {
    if (source.length !== 1) throw error;
    const { left, right, bottom, top } = footprintBounds(source[0]!);
    const step = roundoff * Math.min(right - left, top - bottom);
    if (!(step > 0)) throw error;
    const snapped = snap(source, step);
    if (!agrees(footprintArea([snapped]), total, total)) throw error;
    const remainder = subtractFootprints(snapped, cover.map(poly => snap(poly, step))).filter(significant);
    if (remainder.length) throw error;
    return remainder;
  }
}

type HeadroomOverlaps = ReturnType<typeof deckOverlapsInBand>;

function isIndependentShell(lower: DeckFootprint, upper: DeckFootprint): boolean {
  const key = (upper as Partial<ShellCarrier>).key;
  return key !== undefined && lower.geometry.independentShells?.has(key) === true;
}

function headroomOverlaps(lower: DeckFootprint, upper: readonly DeckFootprint[]): HeadroomOverlaps {
  upper = upper.filter(deck => !isIndependentShell(lower, deck));
  return upper.flatMap(deck => deckOverlapsInBand(lower, deck, TOL, MIN_STOREY_HEADROOM));
}

function headroomCover(lower: DeckFootprint, upper: readonly DeckFootprint[], pending: Set<DeckFootprint>): Region {
  return upper.flatMap(deck => headroomOverlaps(lower, [deck]).flatMap(({ part, coverage, margin }) => {
    if (coverage === 'full') return [part];
    if (!margin) {
      pending.add(deck);
      return [];
    }
    const { left, right, bottom, top } = footprintBounds(part[0]!);
    const bounds: PlanPoint[] = [[left, bottom], [right, bottom], [right, top], [left, top]];
    const above = clipClearance(bounds, point => margin(point, TOL));
    const clipped = clipClearance(above, point => -margin(point, MIN_STOREY_HEADROOM));
    const covered = clipped.length >= 3 ? footprintIntersection(part, [clipped]) : [];
    if (!covered.length) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    return covered;
  }));
}

function clipClearance(ring: PlanPoint[], margin: (point: PlanPoint) => number): PlanPoint[] {
  const heights = ring.map(margin);
  return ring.flatMap((a, i) => {
    const j = (i + 1) % ring.length;
    const b = ring[j]!;
    const ha = heights[i]!, hb = heights[j]!;
    const points = ha >= 0 ? [a] : [];
    if ((ha < 0 && hb > 0) || (ha > 0 && hb < 0)) {
      const t = ha / (ha - hb);
      points.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
    return points;
  });
}

export function loadedSides(r: Array<Array<Array<[number, number]>>>, axis: { p: [number, number]; u: [number, number]; L: number }): SideStretch[] {
  const n = FRINGE_BINS, w = axis.L / n;
  const bins = Array.from({ length: n }, () => ({ 1: 0, [-1]: 0 } as Record<number, number>));
  const local = (q: [number, number]): [number, number] => {
    const dx = q[0] - axis.p[0], dy = q[1] - axis.p[1];
    return [dx * axis.u[0] + dy * axis.u[1], dy * axis.u[0] - dx * axis.u[1]];
  };
  const rings: Array<Array<[number, number]>> = [];
  for (const poly of r) poly.forEach((ring, k) => {
    const pts = openRing(ring).map(local);
    rings.push(pts);
    for (let b = 0; b < n; b++) for (const side of [1, -1]) {
      const part = clipToBox(pts, side > 0 ? { x0: b * w, y0: 0, x1: (b + 1) * w, y1: 1e9 } : { x0: b * w, y0: -1e9, x1: (b + 1) * w, y1: 0 });
      if (part.length >= 3) bins[b]![side]! += (k === 0 ? 1 : -1) * Math.abs(signedArea(part));
    }
  });
  const breaks = new Set<number>(Array.from({ length: n + 1 }, (_, b) => b * w));
  for (const pts of rings) pts.forEach((q, i) => {
    const e = pts[(i + 1) % pts.length]!;
    breaks.add(q[0]);
    if ((q[1] < 0 && e[1] > 0) || (q[1] > 0 && e[1] < 0)) breaks.add(q[0] + (e[0] - q[0]) * (q[1] / (q[1] - e[1])));
  });
  const stations = [...breaks].filter((x) => x >= 0 && x <= axis.L).sort((x, y) => x - y);
  const chord = (x: number, side: 1 | -1) => {
    const ys: number[] = [];
    for (const pts of rings) pts.forEach((q, i) => {
      const e = pts[(i + 1) % pts.length]!;
      if ((q[0] <= x && x < e[0]) || (e[0] <= x && x < q[0])) ys.push(side * (q[1] + (e[1] - q[1]) * ((x - q[0]) / (e[0] - q[0]))));
    });
    ys.sort((y0, y1) => y0 - y1);
    let len = 0;
    for (let i = 0; i + 1 < ys.length; i += 2) len += Math.max(0, ys[i + 1]! - Math.max(0, ys[i]!));
    return len;
  };
  const total = bins.reduce((s, a) => s + a[1]! + a[-1]!, 0);
  const out: SideStretch[] = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    const x0 = stations[i]!, x1 = stations[i + 1]!;
    if (!(x1 - x0 > 1e-12 * axis.L)) continue;
    const mid = (x0 + x1) / 2, a = bins[Math.min(n - 1, Math.floor(mid / w))]!;
    const here = a[1]! + a[-1]!;
    if (!(here > 1e-6 * total)) continue;
    for (const side of [1, -1] as const) {
      if (a[side]! > 0.01 * here && chord(mid, side) > 0.01 * here / w) out.push({ t0: x0 / axis.L, t1: x1 / axis.L, side });
    }
  }
  return out;
}

export function oneSidedSomewhere(list: SideStretch[]): boolean {
  const merged = (side: number) => {
    const out: Array<[number, number]> = [];
    for (const s of list.filter((x) => x.side === side).sort((x, y) => x.t0 - y.t0)) {
      const last = out[out.length - 1];
      if (last && s.t0 <= last[1] + 1e-9) last[1] = Math.max(last[1], s.t1); else out.push([s.t0, s.t1]);
    }
    return out;
  };
  const left = merged(1), right = merged(-1);
  const uncovered = (a: Array<[number, number]>, b: Array<[number, number]>) => a.some(([t0, t1]) => {
    let open = t1 - t0;
    for (const [u0, u1] of b) open -= Math.max(0, Math.min(t1, u1) - Math.max(t0, u0));
    return open > 1e-6;
  });
  return uncovered(left, right) || uncovered(right, left);
}

/** A region cut on a grid of `cells` × `cells` over its bounding box: each piece's area (holes taken away) and centroid. */
function regionPieces(r: Region, cells: number): Array<{ area: number; c: [number, number] }> {
  const pts = r.flat(2);
  if (pts.length === 0) return [];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const dx = (Math.max(...xs) - x0) / cells || 1, dy = (Math.max(...ys) - y0) / cells || 1;
  const out: Array<{ area: number; c: [number, number] }> = [];
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const box = { x0: x0 + i * dx, y0: y0 + j * dy, x1: x0 + (i + 1) * dx, y1: y0 + (j + 1) * dy };
    let area = 0, mx = 0, my = 0;
    for (const poly of r) poly.forEach((ring, k) => {
      const part = clipToBox(openRing(ring), box);
      if (part.length < 3) return;
      const a = (k === 0 ? 1 : -1) * Math.abs(signedArea(part));
      const c = areaCentroid(part);
      area += a; mx += a * c[0]; my += a * c[1];
    });
    if (area > 1e-12) out.push({ area, c: [mx / area, my / area] });
  }
  return out;
}

/** A region's area, and its first moment about `axis.p` along the axis, in each of `n` equal stretches along `axis`. */
function areaAlong(r: Region, axis: Axis, n: number): Array<{ area: number; first: number }> {
  const bins = Array.from({ length: n }, () => ({ area: 0, first: 0 }));
  const w = axis.L / n;
  const local = (q: [number, number]): [number, number] => {
    const dx = q[0] - axis.p[0], dy = q[1] - axis.p[1];
    return [dx * axis.u[0] + dy * axis.u[1], dy * axis.u[0] - dx * axis.u[1]];
  };
  for (const poly of r) poly.forEach((ring, k) => {
    const pts = openRing(ring).map(local);
    for (let b = 0; b < n; b++) {
      const part = clipToBox(pts, { x0: b * w, y0: -1e9, x1: (b + 1) * w, y1: 1e9 });
      if (part.length < 3) continue;
      const a = (k === 0 ? 1 : -1) * Math.abs(signedArea(part));
      bins[b]!.area += a;
      bins[b]!.first += a * areaCentroid(part)[0];
    }
  });
  return bins;
}

/**
 * What a panel kept for itself, cut on a 20 × 20 grid, carried to its beams as a one-way slab: each cell from the
 * nearest beam across to the beam opposite (or, where nothing lies opposite, as in a notch of a
 * concave panel, between the beams first met either way along some line through the cell's
 * centroid), split by the lever rule, so the beams' loads keep the cells' resultant and both its
 * plan moments. On each beam a uniform piece per fortieth, centred
 * on the moment of what it took; one at an end goes to the end's node.
 */
function regionToBeams(model: GravityModel, region: Region, beamIds: number[]): {
  pieces: Array<{ elementId: number; a: number; b: number; wI: number; wJ: number }>;
  points: Array<{ nodeId: number; w: number; elementId: number }>;
  areas: Map<number, number>;
} {
  const BINS = 40;
  const beams = beamIds.flatMap((id) => {
    const e = model.elements.get(id);
    const p = e && model.nodes.get(e.nodeI), q = e && model.nodes.get(e.nodeJ);
    if (!e || !p || !q) return [];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    return L > 0 ? [{ id, ends: [e.nodeI, e.nodeJ] as [number, number], p: [p.x, p.y] as [number, number], u: [(q.x - p.x) / L, (q.y - p.y) / L] as [number, number], L, area: new Array(BINS).fill(0) as number[], first: new Array(BINS).fill(0) as number[] }] : [];
  });
  const out = { pieces: [] as Array<{ elementId: number; a: number; b: number; wI: number; wJ: number }>, points: [] as Array<{ nodeId: number; w: number; elementId: number }>, areas: new Map<number, number>() };
  if (beams.length === 0) return out;
  type B = (typeof beams)[number];
  const along = (bm: B, c: [number, number]) => Math.max(0, Math.min(bm.L, (c[0] - bm.p[0]) * bm.u[0] + (c[1] - bm.p[1]) * bm.u[1]));
  const distance = (bm: B, c: [number, number]) => {
    const t = along(bm, c);
    return Math.hypot(c[0] - bm.p[0] - t * bm.u[0], c[1] - bm.p[1] - t * bm.u[1]);
  };
  type Hit = { bm: B; s: number; t: number };
  const across = (c: [number, number], v: [number, number]): [Hit, Hit] | null => {
    let back: Hit | null = null, ahead: Hit | null = null;
    for (const bm of beams) {
      const den = v[0] * bm.u[1] - v[1] * bm.u[0];
      if (Math.abs(den) < 1e-12) continue;
      const wx = bm.p[0] - c[0], wy = bm.p[1] - c[1];
      const t = (wx * bm.u[1] - wy * bm.u[0]) / den;
      const s = (wx * v[1] - wy * v[0]) / den;
      if (s < -1e-9 || s > bm.L + 1e-9) continue;
      const hit = { bm, s: Math.max(0, Math.min(bm.L, s)), t };
      if (t > 1e-9 && (!ahead || t < ahead.t)) ahead = hit;
      if (t < -1e-9 && (!back || t > back.t)) back = hit;
    }
    return back && ahead ? [back, ahead] : null;
  };
  const put = (bm: B, s: number, a: number) => {
    const k = Math.min(BINS - 1, Math.floor((s / bm.L) * BINS + 1e-9));
    bm.area[k]! += a;
    bm.first[k]! += a * s;
  };
  const transfer = (near: B, c: [number, number], area: number) => {
    const s0 = along(near, c);
    const foot: [number, number] = [near.p[0] + s0 * near.u[0], near.p[1] + s0 * near.u[1]];
    const d = Math.hypot(c[0] - foot[0], c[1] - foot[1]);
    if (d <= 1e-9) { put(near, s0, area); return; }
    const directions: Array<[number, number]> = [[(c[0] - foot[0]) / d, (c[1] - foot[1]) / d]];
    for (let k = 0; k < 90; k++) directions.push([Math.cos((k * Math.PI) / 90), Math.sin((k * Math.PI) / 90)]);
    let pair: [Hit, Hit] | null = null;
    for (const v of directions) if ((pair = across(c, v))) break;
    if (!pair) { put(near, s0, area); return; }
    const [back, ahead] = pair;
    put(back.bm, back.s, (area * ahead.t) / (ahead.t - back.t));
    put(ahead.bm, ahead.s, (area * -back.t) / (ahead.t - back.t));
  };
  for (const { area, c } of regionPieces(region, 20)) {
    const least = Math.min(...beams.map((bm) => distance(bm, c)));
    const nearest = beams.filter((bm) => distance(bm, c) <= least + 1e-9);
    for (const near of nearest) transfer(near, c, area / nearest.length);
  }
  for (const bm of beams) {
    const area = new Sum();
    for (const assigned of bm.area) area.add(assigned);
    out.areas.set(bm.id, area.value);
    const w = bm.L / BINS;
    bm.area.forEach((a, k) => {
      if (!(a > 0)) return;
      const c = bm.first[k]! / a;
      const half = Math.min(w / 2, c, bm.L - c);
      if (half > 1e-9) { out.pieces.push({ elementId: bm.id, a: c - half, b: c + half, wI: a / (2 * half), wJ: a / (2 * half) }); return; }
      out.points.push({ nodeId: c < bm.L / 2 ? bm.ends[0] : bm.ends[1], w: a, elementId: bm.id });
    });
  }
  return out;
}

/** The least width of `poly` across any direction: its convex hull's, by the normals of the hull's sides. */
function isWideDeck(poly: Polygon[number]): boolean {
  return narrowestWidth(poly) > MAX_DECK_SPAN;
}

function narrowestWidth(poly: Array<[number, number]>): number {
  const pts = [...poly].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: [number, number], p: [number, number], q: [number, number]) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const half = (list: Array<[number, number]>) => {
    const h: Array<[number, number]> = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  const hull = [...half(pts), ...half([...pts].reverse())];
  if (hull.length < 3) return 0;
  let least = Infinity;
  hull.forEach((p, k) => {
    const q = hull[(k + 1) % hull.length]!;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L === 0) return;
    least = Math.min(least, Math.max(...hull.map((r) => Math.abs(cross(p, q, r)) / L)));
  });
  return least;
}

function areaCentroid(poly: Array<[number, number]>): [number, number] {
  const o = poly[0];
  if (!o) return [0, 0];
  let a = 0, x = 0, y = 0;
  poly.forEach((p0, k) => {
    const q0 = poly[(k + 1) % poly.length]!;
    const p = [p0[0] - o[0], p0[1] - o[1]], q = [q0[0] - o[0], q0[1] - o[1]];
    const cross = p[0]! * q[1]! - q[0]! * p[1]!;
    a += cross; x += (p[0]! + q[0]!) * cross; y += (p[1]! + q[1]!) * cross;
  });
  return Math.abs(a) > 1e-15 ? [o[0] + x / (3 * a), o[1] + y / (3 * a)] : centroid(poly);
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** The part of `poly` inside the box (Sutherland–Hodgman). */
function clipToBox(poly: Array<[number, number]>, box: Box): Array<[number, number]> {
  const sides: Array<[(p: [number, number]) => number]> = [
    [(p) => p[0] - box.x0], [(p) => box.x1 - p[0]], [(p) => p[1] - box.y0], [(p) => box.y1 - p[1]],
  ];
  let out = poly;
  for (const [d] of sides) {
    const next: Array<[number, number]> = [];
    out.forEach((a, k) => {
      const b = out[(k + 1) % out.length]!;
      const da = d(a), db = d(b);
      if (da >= 0) next.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); next.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    });
    out = next;
    if (out.length === 0) break;
  }
  return out;
}

function tributaryStrip(a: [number, number], b: [number, number], width: number): Array<[number, number]> {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / L) * (width / 2), ny = ((b[0] - a[0]) / L) * (width / 2);
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
}

function memberStrip([a, b]: Segment, width: number): DeckFootprint {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const u: PlanPoint = [dx / length, dy / length];
  const geometry = deckSurface([Math.min(a[2], b[2]), Math.max(a[2], b[2])], {
    height: ([x, y]) => a[2] + ((x - a[0]) * u[0] + (y - a[1]) * u[1]) / length * (b[2] - a[2]),
    exactHeight: point => exactStripHeight(a, b, point),
  });
  const footprint = width > 0 ? [[tributaryStrip([a[0], a[1]], [b[0], b[1]], width)]] : [];
  return { footprint, geometry };
}

function centroid(poly: Array<[number, number]>): [number, number] {
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
}

/** A beam lies on a panel's boundary: both ends and its midpoint on its sides. */
function onBoundary(model: GravityModel, b: { nodeI: number; nodeJ: number }, poly: Array<[number, number]>): boolean {
  const a = model.nodes.get(b.nodeI)!, c = model.nodes.get(b.nodeJ)!;
  const pts: Array<[number, number]> = [[a.x, a.y], [c.x, c.y], [(a.x + c.x) / 2, (a.y + c.y) / 2]];
  return pts.every((p) => poly.some((v, i) => nearSegment(p, v, poly[(i + 1) % poly.length]!, 1e-3)));
}

/** Point in polygon, the boundary included (within `tol`). */
function inside(pt: [number, number], poly: Array<[number, number]>, tol: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (nearSegment(pt, [xi, yi], [xj, yj], tol)) return true;
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function nearSegment(p: [number, number], a: [number, number], b: [number, number], tol: number): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) <= tol;
}

function nearBoundary(point: [number, number], ring: Polygon[number], tolerance: number): boolean {
  return ring.some((a, i) => nearSegment(point, a, ring[(i + 1) % ring.length]!, tolerance));
}

type PlanPoint = Polygon[number][number];
type PlanQuery = {
  exact: () => DoubledPlanPoint;
  compare: (axis: 0 | 1, limit: number) => number;
  side: (a: PlanPoint, b: PlanPoint) => number;
};
type CoverQuery = {
  plan: PlanQuery;
  elevation: number;
  compareClearance: (upper: ReturnType<typeof exactElevation>, limit: number) => number;
} & ({ sample: PlanPoint; midpointOf?: never } | { sample?: never; midpointOf: [PlanPoint, PlanPoint] });
type RingLocation = 'boundary' | 'inside' | 'outside';

function pointQuery(point: PlanPoint): PlanQuery {
  return {
    exact: () => doubledPlanPoint(point),
    compare: (axis, limit) => Math.sign(point[axis] - limit),
    side: (a, b) => orient2d(...a, ...b, ...point),
  };
}

function pointCoverQuery(point: PlanPoint, elevation: number): CoverQuery {
  let base: ReturnType<typeof exactElevation> | undefined;
  return {
    plan: pointQuery(point), elevation, sample: point,
    compareClearance: (upper, limit) => compareClearance(upper, base ??= exactElevation(elevation), limit),
  };
}

function memberMidpointQuery([start, end]: Segment): CoverQuery {
  const a: PlanPoint = [start[0], start[1]], b: PlanPoint = [end[0], end[1]];
  const average = (x: number, y: number) => Number.isFinite(x + y) ? (x + y) / 2 : x / 2 + y / 2;
  const point: PlanPoint = [average(a[0], b[0]), average(a[1], b[1])];
  let sums: DoubledPlanPoint | undefined;
  const exact = () => sums ??= [dyadicInteger(a[0]) + dyadicInteger(b[0]), dyadicInteger(a[1]) + dyadicInteger(b[1])];
  const plan: PlanQuery = {
    exact,
    compare: (axis, limit) => point[axis] === limit
      ? sign(exact()[axis] - 2n * dyadicInteger(limit))
      : Math.sign(point[axis] - limit),
    side: (p, q) => {
      const first = Math.sign(orient2d(...p, ...q, ...a)), second = Math.sign(orient2d(...p, ...q, ...b));
      if (first !== 0 && first === second) return first;
      const [px, py] = p.map(dyadicInteger) as [bigint, bigint];
      const [qx, qy] = q.map(dyadicInteger) as [bigint, bigint];
      const [x, y] = exact();
      return sign((qy - py) * (x - 2n * px) - (qx - px) * (y - 2n * py));
    },
  };
  let base: ReturnType<typeof exactElevation> | undefined;
  return {
    plan, elevation: average(start[2], end[2]), midpointOf: [a, b],
    compareClearance: (upper, limit) => compareClearance(upper, base ??= midpointElevation(start[2], end[2]), limit),
  };
}

function withinSegmentBounds(query: PlanQuery, a: PlanPoint, b: PlanPoint): boolean {
  return ([0, 1] as const).every(axis =>
    query.compare(axis, Math.min(a[axis], b[axis])) >= 0 && query.compare(axis, Math.max(a[axis], b[axis])) <= 0);
}

function ringLocation(query: PlanQuery, ring: Polygon[number]): RingLocation {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!, b = ring[i]!;
    const side = query.side(a, b);
    if (side === 0 && withinSegmentBounds(query, a, b)) return 'boundary';
    if ((query.compare(1, a[1]) < 0) !== (query.compare(1, b[1]) < 0) && (side < 0) === (b[1] > a[1])) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

function footprintContains(query: PlanQuery, [exterior, ...holes]: Polygon): boolean {
  return !!exterior && ringLocation(query, exterior) !== 'outside'
    && holes.every(hole => ringLocation(query, hole) !== 'inside');
}

function containingShellFacet(shell: ShellCarrier, query: PlanQuery): PlaneBasis | undefined {
  const [origin, ...corners] = shell.pts;
  if (!origin) return undefined;
  for (let i = 0; i + 1 < corners.length; i++) {
    const basis: PlaneBasis = [origin, corners[i]!, corners[i + 1]!];
    const [a, b, c] = basis.map(([x, y]): PlanPoint => [x, y]) as [PlanPoint, PlanPoint, PlanPoint];
    if (orient2d(...a, ...b, ...c) !== 0 && ringLocation(query, [a, b, c]) !== 'outside') return basis;
  }
  return undefined;
}

export function connectedRoofFootprints(polys: Array<Array<[number, number]>>) {
  return polys.length ? polygonClipping.union(polys.map(poly => [closeRing(poly)])).map(rings => rings.map(openRing)) : [];
}

function memberGeometry(model: GravityModel, ids: Iterable<number>) {
  return [...ids].map(id => {
    const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z ?? 0) - (a.z ?? 0);
    return { id, a, b, dx, dy, dz, lh: Math.hypot(dx, dy) };
  });
}

/** How far above `zTop` the lowest panel, slab or beam over a plan point is (see the header); Infinity when none is. */
function coverage(
  model: GravityModel, zOf: Map<number, number>, panelsAt: ReadonlyMap<number, DeckFootprint[]>,
  carriers: readonly ShellCarrier[], rejected: ReadonlyMap<number, DeckFootprint[]> = new Map(),
  gaps: readonly CertifiedGap[] = [],
) {
  const shells = carriers.map(shell => ({ ...shell, id: shell.coverageId }));
  const footprints = [...panelsAt].flatMap(([z, polys]) => unionFootprints(polys.flatMap(panel => panel.footprint)).map(rings => ({ z, rings: rings.map(openRing) })));
  const areaCovers: Array<{ deck: DeckFootprint; shell?: ShellCarrier }> = [
    ...[...panelsAt.values()].flat().map(deck => ({ deck })),
    ...shells.map(shell => ({ deck: shell, shell })),
    ...gaps.map(deck => ({ deck })),
  ];
  const rejectedPanels = [...rejected.values()].flat();
  const geometry = memberGeometry(model, zOf.keys());
  const byMember = new Map(geometry.map(member => [member.id, member]));
  const runs = physicalRoofRuns(geometry).map(({ a, b, members }) => {
    const start: [number, number] = [a.x, a.y], end: [number, number] = [b.x, b.y];
    const dx = b.x - a.x, dy = b.y - a.y;
    const eave = (a.z ?? 0) <= (b.z ?? 0) ? a : b;
    const within = (rings: Array<Array<[number, number]>>) => {
      const containsRunPoint = (p: PlanPoint) => {
        const query = pointQuery(p);
        const [exterior, ...holes] = rings;
        return (ringLocation(query, exterior!) !== 'outside' || nearBoundary(p, exterior!, TOL))
          && holes.every(hole => ringLocation(query, hole) !== 'inside');
      };
      if (!containsRunPoint(start) || !containsRunPoint(end)) return false;
      const cuts = [0, 1];
      rings.forEach(poly => poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length]!;
        const ex = q[0] - p[0], ey = q[1] - p[1], det = dx * ey - dy * ex;
        if (Math.abs(det) <= 1e-12) return;
        const t = ((p[0] - a.x) * ey - (p[1] - a.y) * ex) / det;
        const u = ((p[0] - a.x) * dy - (p[1] - a.y) * dx) / det;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      }));
      cuts.sort((x, y) => x - y);
      return cuts.slice(1).every((t, i) => {
        const mid = (cuts[i]! + t) / 2;
        return containsRunPoint([a.x + mid * dx, a.y + mid * dy]);
      });
    };
    const ownPanels = footprints.filter(({ z, rings }) => Math.abs(z - (eave.z ?? 0)) <= TOL
      && nearBoundary([eave.x, eave.y], rings[0]!, TOL) && within(rings));
    const segments = [...members].map(id => byMember.get(id)!);
    return { segments, ownPanels };
  });
  const coveredWithin = (
    { plan: query, elevation: zTop, sample, midpointOf, compareClearance }: CoverQuery, limit: number, ownMembers?: ReadonlySet<number>, ownShell?: number, includeAreaCover = true,
  ): boolean => {
    const above = (z: ReturnType<typeof exactElevation>) => compareClearance(z, MIN_COVER_RISE) > 0;
    const below = (z: ReturnType<typeof exactElevation>) => limit === Infinity || compareClearance(z, limit) < 0;
    const qualifies = (z: ReturnType<typeof exactElevation>) => above(z) && below(z);
    const deckCover = ({ range: [low, high], exactHeight }: DeckSurface, height = exactHeight): ShellCoverage => {
      if (height && low !== high) return qualifies(height(query.exact())) ? 'full' : 'none';
      const bottom = exactElevation(low), top = exactElevation(high);
      if (!above(top) || !below(bottom)) return 'none';
      return above(bottom) && below(top) ? 'full' : 'partial';
    };
    let uncertain = false;
    if (includeAreaCover) {
      for (const { deck, shell } of areaCovers) {
        if (shell && shell.id === ownShell) continue;
        if (!deck.footprint.some(poly => footprintContains(query, poly))) continue;
        const basis = shell && !deck.geometry.exactHeight && containingShellFacet(shell, query);
        const cover = deckCover(deck.geometry, basis ? point => exactPlaneHeight(basis, point) : undefined);
        if (cover === 'full') return true;
        uncertain ||= cover === 'partial';
      }
    }
    for (const { segments, ownPanels } of runs) {
      if (ownPanels.some(({ z, rings }) => Math.abs(z - zTop) <= TOL && footprintContains(query, rings))) continue;
      for (const { id, a, b, dx, dy, dz, lh } of segments) {
        if (ownMembers?.has(id)) continue;
        const start: PlanPoint = [a.x, a.y], end: PlanPoint = [b.x, b.y];
        const normal: PlanPoint = [-dy / lh, dx / lh];
        if (sample) {
          if (!withinSegmentBounds(query, start, end) || snowCoordinate(sample, start, normal, [0]) !== 0) continue;
          const station = snowCoordinate(sample, start, [dx / lh, dy / lh], [0, lh]);
          if (qualifies(exactElevation((a.z ?? 0) + station / lh * dz))) return true;
        } else {
          const topStart: Segment[number] = [...start, a.z ?? 0], topEnd: Segment[number] = [...end, b.z ?? 0];
          if (withinSegmentBounds(query, start, end) && query.side(start, end) === 0) {
            if (qualifies(exactBeamHeight(topStart, topEnd, query.exact()))) return true;
          } else if (midpointOf.every(point => snowCoordinate(point, start, normal, [0]) === 0)) {
            const z = exactProjectedBeamHeight(topStart, topEnd, query.exact());
            if (z && qualifies(z)) return true;
          }
        }
      }
    }
    for (const panel of rejectedPanels) {
      if (panel.footprint.some(poly => footprintContains(query, poly)) && deckCover(panel.geometry) !== 'none') {
        refuseGravityGeometry(msg('loadPlan.gravity.widePanels', { n: 1, span: MAX_DECK_SPAN }));
      }
    }
    if (uncertain) refuseGravityGeometry(msg('loadPlan.gravity.uncertainDeckCover'));
    return false;
  };
  const memberCovered = (segment: Segment) => coveredWithin(memberMidpointQuery(segment), Infinity);
  const pointCovered = (pt: PlanPoint, zTop: number, ownMembers?: ReadonlySet<number>, limit = Infinity, ownShell?: number) =>
    coveredWithin(pointCoverQuery(pt, zTop), limit, ownMembers, ownShell);
  const areaExposure = (lower: DeckFootprint, ownShell?: number, roofStrips: readonly DeckFootprint[] = []) => {
    const cover: Polygon[] = [];
    let partial = false;
    const compare = (upper: DeckFootprint) => deckOverlapsInBand(lower, upper, MIN_COVER_RISE, Infinity);
    const addCover = (upper: DeckFootprint) => {
      if (upper === lower) return;
      const overlaps = isIndependentShell(lower, upper)
        ? deckOverlapsInBand(lower, upper, 0, Infinity, 'open')
        : compare(upper);
      for (const { part, coverage } of overlaps) {
        if (coverage === 'full') cover.push(part);
        else partial = true;
      }
    };
    for (const { deck, shell } of areaCovers) {
      if (!shell || shell.id !== ownShell) addCover(deck);
    }
    roofStrips.forEach(addCover);
    if (cover.length && lower.footprint.every(part => subtractFootprints(part, cover).length === 0)) return 'sheltered';
    if (rejectedPanels.some(panel => compare(panel).length)) {
      refuseGravityGeometry(msg('loadPlan.gravity.widePanels', { n: 1, span: MAX_DECK_SPAN }));
    }
    return partial || cover.length ? 'mixed' : 'exposed';
  };
  const areaCovered = (
    lower: DeckFootprint, uniformPressure: boolean,
    bareRun?: { point: PlanPoint; z: number; ownMembers?: ReadonlySet<number> }, ownShell?: number,
  ) => {
    const exposure = areaExposure(lower, ownShell);
    if (exposure === 'mixed' && !uniformPressure) refuseGravityGeometry(msg('loadPlan.gravity.mixedExposure'));
    if (exposure !== 'exposed') return true;
    if (!bareRun) return false;
    const center = pointCoverQuery(bareRun.point, bareRun.z);
    return lower.footprint.some(part => footprintContains(center.plan, part))
      && coveredWithin(center, Infinity, bareRun.ownMembers, ownShell, false);
  };
  return { pointCovered, memberCovered, areaExposure, areaCovered };
}

/**
 * Two colours over units, neighbours apart (breadth first; a unit with no neighbour starts its
 * own island at colour 0), turned over on odd levels so floors alternate in elevation too.
 */
function checkerboard(n: number, level: number[], adjacent: (i: number, j: number) => boolean): number[] {
  const colour = new Array<number>(n).fill(-1);
  for (let s = 0; s < n; s++) {
    if (colour[s] !== -1) continue;
    colour[s] = 0;
    const queue = [s];
    while (queue.length) {
      const i = queue.shift()!;
      for (let j = 0; j < n; j++) {
        if (colour[j] !== -1 || !adjacent(i, j)) continue;
        colour[j] = 1 - colour[i]!;
        queue.push(j);
      }
    }
  }
  return colour.map((c, i) => (level[i]! % 2 === 0 ? c : 1 - c));
}

/** Members loaded by width: alternate spans along each line of collinear members on a level. */
function widthCheckerboard(model: GravityModel, ids: number[]): Map<number, number> {
  const ends = ids.map((id) => {
    const e = model.elements.get(id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { id, i: e.nodeI, j: e.nodeJ, dir: [(b.x - a.x) / L, (b.y - a.y) / L] as const, z: Math.min(a.z ?? 0, b.z ?? 0) };
  });
  const zs = [...new Set(ends.map((e) => Math.round(e.z / 0.05)))].sort((a, b) => a - b);
  const colour = checkerboard(ends.length, ends.map((e) => zs.indexOf(Math.round(e.z / 0.05))), (p, q) => {
    const A = ends[p]!, B = ends[q]!;
    const shared = A.i === B.i || A.i === B.j || A.j === B.i || A.j === B.j;
    return shared && Math.abs(A.dir[0] * B.dir[1] - A.dir[1] * B.dir[0]) < 0.17;
  });
  return new Map(ends.map((e, k) => [e.id, colour[k]!]));
}
