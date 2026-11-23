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
 * A floor or roof drawn with quads already carries its load in the shells: the quads take the
 * area load as a surface load.
 *
 * A sloped quad is loaded like a sloped member: the dead load per square metre of its surface,
 * the live loads per square metre of its plan projection (`cos` below), both along global −Z, as
 * `SurfaceLoad3D` applies them. A quad steeper than a member may be (`beamLike`) is a wall and
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
 * ── Roofs ─────────────────────────────────────────────────────────
 *
 * A member is a roof member when nothing higher covers it in plan: no panel, slab or beam of a
 * higher level over its midpoint. The top floor of a building, a lower roof beside a step and
 * every sloped roof member are roofs; the floors under them are not.
 *
 * Pure: no store.
 */
import { footprintArea, footprintIntersection, footprintsOverlap, planarShell, refuseGravityGeometry, ringArea, unionFootprints, type ShellPlane, type UncoveredStrips } from './gravity-shell-partition';
import { physicalRoofRuns, samePhysicalPoint, snowCoordinate } from './physical-roof-geometry';
import polygonClipping, { type Polygon } from 'polygon-clipping';
import { agrees, Sum } from '../accounting-math';
import { partitionGravityFloors } from './gravity-floor-ownership';
import { preparePhysicalFloorLoad, type FloorBay, type FloorBeam, type FloorPanel, type FloorLoadResult, type SideStretch } from './floor-loads';
import { EngineMessageError, msg, round, type EngineMessage } from '../../codes/message';
import type { Constraint3D } from '../types-3d';

export interface GravityModel {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId?: number; type?: 'frame' | 'truss' }>;
  quads?: Map<number, { id: number; nodes: number[] }>;
  constraints?: readonly Constraint3D[];
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

export interface GravityLayout {
  pieces: GravityPiece[];
  points: GravityPoint[];
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
   * Quads that take the area load themselves: their plan area, m², their mean height, and `cos`,
   * plan area over surface area (1 when horizontal), which turns a load per plan m² into one per
   * m² of shell.
   */
  shellQuads: Array<{ quadId: number; area: number; z: number; cos: number }>;
  shadowedRoofShells?: ReadonlyArray<{ quadId: number; surface: number }>;
  roofShellWeightUnresolved?: boolean;
  /** Loaded plan area per level elevation (rounded to the millimetre), m². */
  areaByLevel: Map<number, number>;
  /** Members that carry roof: a roof panel, or (loaded by width) nothing higher over them. */
  roof: Set<number>;
  roofQuads: Set<number>;
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
  panels: Array<{ polygon: Array<[number, number]>; z: number; roof: boolean }>;
  /** Members whose area load all comes from one side of their axis, ascending; its torque is in no load. */
  oneSided: number[];
  notes: EngineMessage[];
}

const TOL = 1e-3;
const MIN_COVER_RISE = 0.05;
const BEAM_SLOPE_LIMIT = 0.5;
type ShellCarrier = {
  id: number; z0: number; poly: Polygon[number]; pts: Array<[number, number, number]>;
  nodes: number[]; plane?: ShellPlane;
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

export function gravityLayout(model: GravityModel, opts: GravityOptions): GravityLayout {
  const out: GravityLayout = {
    pieces: [], points: [], areaOf: new Map(), roofAreaOf: new Map(), widthMembers: [], shellQuads: [], areaByLevel: new Map(),
    roof: new Set(), roofQuads: new Set(), zOf: new Map(), panelColour: [], widthColour: new Map(), panels: [], oneSided: [], notes: [],
  };
  const sidesOf = new Map<number, SideStretch[]>();
  const addSides = (id: number, sides: SideStretch[] | undefined) => {
    if (sides) (sidesOf.get(id) ?? sidesOf.set(id, []).get(id)!).push(...sides);
  };
  const width = (id: number, length: number, horizontalLength: number) => {
    out.widthMembers.push({ elementId: id, length, horizontalLength });
  };
  const addArea = (map: Map<number, number>, id: number, a: number) => map.set(id, (map.get(id) ?? 0) + a);

  const candidates = [...model.elements.values()].filter((e) => e.type !== 'truss');
  const eligibility = new Map(candidates.map(e => {
    const member = beamLike(model, e);
    if (member.ok) {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      out.zOf.set(e.id, ((a.z ?? 0) + (b.z ?? 0)) / 2);
    }
    return [e.id, member] as const;
  }));

  const quadsAt = new Map<number, Array<{ quadId: number; area: number; cos: number }>>();
  const slopedQuads: Array<{ quadId: number; area: number; z: number; cos: number }> = [];
  const levelCarriers: ShellCarrier[] = [];
  const slopedCarriers: ShellCarrier[] = [];
  const steep: number[] = [];
  const shellNodes = new Set<number>();
  for (const q of model.quads?.values() ?? []) {
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    const xyz = pts.map((p) => [p!.x, p!.y, p!.z ?? 0] as [number, number, number]);
    const zs = xyz.map((p) => p[2]);
    const poly = xyz.map((p) => [p[0], p[1]] as [number, number]);
    const plan = ringArea(poly);
    const plane = opts.mode === 'panels' && plan > 0 ? planarShell(q.id, xyz) : undefined;
    const carrier = { id: q.id, poly, pts: xyz, nodes: q.nodes, plane };
    const low = Math.min(...zs), high = Math.max(...zs);
    const surface = surfaceArea(xyz);
    const cos = surface > 0 ? plan / surface : 0;
    if (high - low <= TOL) {
      const key = levelKey(low + (high - low) / 2);
      const list = quadsAt.get(key) ?? [];
      list.push({ quadId: q.id, area: plan, cos });
      quadsAt.set(key, list);
      if (plan > 0) {
        levelCarriers.push({ ...carrier, z0: levelKey(low) });
        for (const id of q.nodes) shellNodes.add(id);
      }
      continue;
    }
    // |sin| ≤ 0,5, the members' rule: a roof; past 80° a wall; between, named.
    if (cos >= Math.sqrt(0.75) - 1e-9) {
      slopedQuads.push({ quadId: q.id, area: plan, z: low + zs.sort((a, b) => a - b).reduce((sum, z) => sum + (z - low), 0) / zs.length, cos });
      slopedCarriers.push({ ...carrier, z0: levelKey(low) });
      for (const id of q.nodes) shellNodes.add(id);
    } else if (cos > Math.cos((80 * Math.PI) / 180)) steep.push(q.id);
  }
  const carriers = [...levelCarriers, ...slopedCarriers];
  const roofs = opts.mode === 'panels' ? connectedShellGroups(slopedCarriers) : [];
  const links = opts.mode === 'panels' ? verticalShellLinks(model) : [];
  const linkedDecks = linkedShellDecks(model, carriers, links);
  const offsets = directShellOffsets(model, shellNodes, links);
  const attachedCoverage = rigidShellCoverage(model, offsets, carriers, out.zOf.keys());
  const shellMembership = new Map<number, boolean>();
  const inShell = (e: { id: number; nodeI: number; nodeJ: number }): boolean => {
    if (opts.mode !== 'panels' || !carriers.length) return false;
    if (shellMembership.has(e.id)) return shellMembership.get(e.id)!;

    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const p: Segment[0] = [a.x, a.y, a.z ?? 0], q: Segment[1] = [b.x, b.y, b.z ?? 0];
    const original = shellCoverage([p, q], carriers);
    const attached = attachedCoverage.get(e.id);
    if (original === 'partial' || (original !== 'full' && attached === 'partial')) {
      refuseGravityGeometry(msg('loadPlan.gravity.unresolvedMember', { id: e.id }));
    }
    const covered = original === 'full' || attached === 'full';
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
    if (opts.mode === 'width' || (!horizontal && !inShell(e))) width(e.id, b.length, b.horizontalLength);
    if (!horizontal) continue;
    const key = levelKey(out.zOf.get(e.id)!);
    const list = beamsAt.get(key) ?? [];
    list.push({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: 'frame', sectionId: e.sectionId ?? 0 });
    beamsAt.set(key, list);
  }

  // First pass: the panels of every level, which say what covers what.
  const slab = { distribution: opts.slab ?? 'twoWay', spanAxis: opts.spanAxis } as const;
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
  type OwnedPanel = {
    panel: FloorPanel;
    footprint: Region;
    area: number;
    areaScale: number;
    own: NonNullable<FloorPanel['own']>;
    pieces: Array<Omit<GravityPiece, 'roof' | 'panel'>>;
    points: Array<Omit<GravityPoint, 'roof' | 'panel'>>;
  };
  const levels = new Map<number, { res: FloorLoadResult; owned: OwnedPanel[] }>();
  const prepared = [...beamsAt].map(([z, beams]) => ({
    z, floor: preparePhysicalFloorLoad({ nodes: model.nodes, beams, q: 1, ...slab }),
  }));
  const stationsByBay = new Map<FloorBay, ReturnType<typeof linkedDecks.stationsOf>>();
  const stationsOfBay = (bay: FloorBay) => {
    const known = stationsByBay.get(bay);
    if (known) return known;
    const stations = linkedDecks.stationsOf(new Set([...bay.sides, ...bay.holes.flat()].flatMap(side =>
      side.segments.flatMap(({ elementId }) => {
        const { nodeI, nodeJ } = model.elements.get(elementId)!;
        return [nodeI, nodeJ];
      }))));
    stationsByBay.set(bay, stations);
    return stations;
  };
  const ownership = opts.mode === 'panels' ? partitionGravityFloors(carriers, prepared.flatMap(({ z, floor }) =>
    floor.bays.map(bay => {
      const { boundary, sides } = bay;
      const shellDecks = new Set(deckShells(boundary, sides.map(side => side.nodeA), z, levelCarriers, roofs));
      for (const shell of linkedDecks.shellsAt(stationsOfBay(bay))) shellDecks.add(shell);
      return { bay, z, shells: [...shellDecks] };
    })), TOL, linkedDecks.coupled, (a, b) => linkedDecks.connected(stationsOfBay(a), stationsOfBay(b))) : undefined;
  const ownedCarriers = carriers.filter(shell => ownership?.shells.has(shell));
  const nonOwners = new Set(carriers.filter(shell => !ownership?.shells.has(shell)).map(shell => shell.id));
  const panelsAt = new Map<number, Region>();
  for (const { z, floor } of prepared) {
    const res = floor.generate(ownership?.bays);
    const owned = ownership ? floor.bays.flatMap((bay): OwnedPanel[] => {
      const footprint = ownership.bays.get(bay)!.region;
      if (!footprint.length) return [];
      const panel = res.panels[bay.index];
      const own = panel?.own;
      const pieces = (own?.loads ?? []).map(l => ({ elementId: l.elementId,
        ...(l.a !== undefined ? { a: l.a, b: l.b } : {}), wI: l.qI, wJ: l.qJ }));
      const points = (own?.nodal ?? []).map(n => ({ nodeId: n.nodeId, w: -n.fz, elementId: n.elementId }));
      const areaScale = bay.boundary.reduce((sum, ring) => sum + ringArea(ring), 0);
      const area = verifyBayArea(z, footprint, areaScale, pieces, points);
      if (!panel || !own) refuseGravityGeometry(msg('loadPlan.gravity.areaResultant', { z }));
      return [{ panel, footprint, area, areaScale, own, pieces, points }];
    }) : [];
    levels.set(z, { res, owned });
    panelsAt.set(z, ownership ? owned.flatMap(bay => bay.footprint) : res.panels.map(panel => [panel.polygon]));
  }
  const coverAbove = coverage(model, out.zOf, panelsAt, ownership ? nonOwners : undefined);
  const covered = (pt: [number, number], zTop: number) => Number.isFinite(coverAbove(pt, zTop));
  const panelSides = new Map<number, SideStretch[]>();
  for (const { res } of levels.values()) for (const pn of res.panels) for (const [id, sides] of pn.own?.sides ?? []) {
    (panelSides.get(id) ?? panelSides.set(id, []).get(id)!).push(...sides);
  }
  if (opts.mode === 'width') levels.clear();
  const deck = opts.loadEveryPanel ? null : notADeck(model, ownership ? ownedCarriers : carriers, panelsAt, coverAbove, opts.tributaryWidth, opts.mode === 'panels');
  const deckless = (poly: Array<[number, number]>, z: number) => (deck ? deck.why(poly, z) : null);
  const deckReasons = new Map<FloorPanel, ReturnType<typeof deckless>>();
  if (deck) for (const [z, { owned }] of levels) for (const { panel } of owned) {
    if (panel.shellCoverage?.kind === 'strips') deck.checkStrips(panel.shellCoverage, z);
    else deckReasons.set(panel, deck.why(panel.polygon, z));
  }
  const fringeRoof = new Map<number, { spans: WidthSpan[]; sides: SideStretch[]; region: Region; z: number }>();
  let byWidth = 0, unresolved = 0, partly = 0, lowPanels = 0, widePanels = 0, unclear = 0, unclearRoof = 0, fringes = 0;
  const segment = (id: number): Segment => {
    const e = model.elements.get(id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return [[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]];
  };
  const isSloped = (m: { length: number; horizontalLength: number }) => Math.abs(m.length - m.horizontalLength) > TOL;
  const held: Held = { members: out.widthMembers.filter(isSloped).map((m) => segment(m.elementId)), regions: [] };
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
    for (const { panel, footprint } of deck ? levels.get(z)?.owned ?? [] : []) {
      const why = deckReasons.get(panel);
      if (why === 'wide') continue;
      if (why === 'lowHeadroom') {
        const within = (o: FloorPanel, p: FloorPanel) => o !== p && o.area < p.area && o.polygon.every(q => inside(q, p.polygon));
        const loading = (levels.get(z)?.owned ?? []).map(bay => bay.panel).filter(o => within(o, panel) && deckReasons.get(o) !== 'wide');
        const nested = loading.filter(o => !loading.some(m => within(o, m)));
        const { share, kept } = deck!.uncarried(panel.polygon, z, held, nested.map(o => o.polygon));
        if (share <= 0) { dropped.add(panel); continue; }
        fringeKept.set(panel, kept);
        held.regions.push({ region: kept, z });
        continue;
      }
      held.regions.push({ region: footprint, z });
    }
    for (const e of flatAt.get(z) ?? []) {
      const [a, b] = segment(e.id);
      const why = deckless([[a[0], a[1]], [b[0], b[1]]], z);
      const beside = (panelsAt.get(z) ?? []).flat().filter((poly) => onBoundary(model, e, poly)).map((poly) => deckless(poly, z));
      const floorBeside = beside.some((w) => w === null || w === 'headroomUnclear');
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (why === 'headroomUnclear' || (why === 'lowHeadroom' && floorBeside)) {
        if (covered(mid, z)) unclear++; else unclearRoof++;
      }
      if (why === 'lowHeadroom' && !floorBeside) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const axis = { p: [a[0], a[1]] as [number, number], u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] as [number, number], L };
        const { share, kept } = deck!.uncarried(tributaryStrip([a[0], a[1]], [b[0], b[1]], opts.tributaryWidth), z, held);
        const bins = share > 0 ? areaAlong(kept, axis, FRINGE_BINS) : [];
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
        fringeRoof.set(e.id, { spans, sides: loadedSides(kept, axis), region: kept, z });
        held.regions.push({ region: kept, z });
        fringes++;
        continue;
      }
      held.members.push([a, b]);
    }
  }

  if (opts.mode === 'panels') {
    for (const [z, layer] of quadsAt) {
      const quads = layer.filter(quad => quad.area > 0 && !nonOwners.has(quad.quadId));
      if (!quads.length) continue;
      out.shellQuads.push(...quads.map((q) => ({ ...q, z })));
      const area = quads.reduce((s, q) => s + q.area, 0);
      out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + area);
      out.notes.push(msg('loadPlan.gravity.shellLevel', { z: round(z, 2), n: quads.length, area: round(area, 1) }));
    }
    const ownedSlopes = slopedQuads.filter(quad => !nonOwners.has(quad.quadId));
    if (ownedSlopes.length > 0) {
      out.shellQuads.push(...ownedSlopes);
      for (const quad of ownedSlopes) out.areaByLevel.set(quad.z, (out.areaByLevel.get(quad.z) ?? 0) + quad.area);
      out.notes.push(msg('loadPlan.gravity.slopedShells', { n: ownedSlopes.length, area: round(ownedSlopes.reduce((s, q) => s + q.area, 0), 1) }));
    }
    if (steep.length > 0) out.notes.push(msg('loadPlan.gravity.steepShells', { n: steep.length, ids: steep.slice(0, 10).join(', ') + (steep.length > 10 ? '…' : '') }));
  }

  const selectedPanels = new Map([...levels].map(([z, { owned }]) => [z, owned.flatMap(bay => {
    const { panel, footprint } = bay;
    if (dropped.has(panel)) { lowPanels++; return []; }
    const why = deckReasons.get(panel);
    if (why === 'wide') { widePanels++; return []; }
    const strips = panel.shellCoverage?.kind === 'strips' ? panel.shellCoverage : undefined;
    const region = fringeKept.get(panel);
    return [{ ...bay, why, strips, region, footprint: region ?? footprint }];
  })]));

  const levelOrder = [...levels.keys()].sort((a, b) => a - b);
  for (const z of levels.keys()) for (const b of flatAt.get(z) ?? []) {
    const g = eligibility.get(b.id)!;
    width(b.id, g.length, g.horizontalLength);
    byWidth++;
  }

  const beforeDepth = out.widthMembers.length;
  out.widthMembers = out.widthMembers.filter(m => !droppedMembers.has(m.elementId));
  for (const m of out.widthMembers) {
    const fringe = fringeRoof.get(m.elementId);
    if (fringe) m.spans = fringe.spans;
    addSides(m.elementId, fringe?.sides ?? (opts.mode === 'width' ? panelSides.get(m.elementId) : undefined));
  }

  const widthFootprints: WidthFootprint[] = [];
  if (opts.tributaryWidth > 0 && [...selectedPanels.values()].some(panels => panels.some(panel => panel.strips))) {
    const wholeMembers: number[] = [];
    for (const m of out.widthMembers) {
      const fringe = fringeRoof.get(m.elementId);
      if (fringe) widthFootprints.push(fringe);
      else wholeMembers.push(m.elementId);
    }
    const runs = physicalRoofRuns(memberGeometry(model, wholeMembers),
      (a, b) => a.x === b.x && a.y === b.y && (a.z ?? 0) === (b.z ?? 0));
    for (const { a, b } of runs) {
      widthFootprints.push({ segment: [[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]], width: opts.tributaryWidth });
    }
  }

  // Second pass: each panel on its own, as a floor or as a roof.
  const panelBeams: Array<Set<number>> = [];
  const panelLevel: number[] = [];
  for (const [z, { res }] of levels) {
    unresolved += res.skipped.unresolved;
    let overhead: ReturnType<typeof higherFootprints> | undefined;
    for (const { panel, own: one, why, strips, region, footprint, area, areaScale, pieces, points } of selectedPanels.get(z) ?? []) {
      if (why === 'lowHeadroom') fringes++;
      if (why === 'headroomUnclear') { if (covered(centroid(panel.polygon), z)) unclear++; else unclearRoof++; }
      if (strips) partly++;
      const roof = strips
        ? uncoveredStripIsRoof(strips, overhead ??= higherFootprints(z, selectedPanels, ownedCarriers, widthFootprints))
        : why === 'lowHeadroom' || !covered(centroid(panel.polygon), z);
      const index = panelBeams.length;
      panelBeams.push(new Set(one.perBeam.keys()));
      panelLevel.push(levelOrder.indexOf(z));
      out.panels.push({ polygon: panel.polygon, z, roof });
      if (region) {
        const moved = regionToBeams(model, region, [...one.perBeam.keys()]);
        const kept = verifyBayArea(z, footprint, areaScale, moved.pieces, moved.points);
        for (const pc of moved.pieces) {
          out.pieces.push({ ...pc, roof, panel: index });
          addSides(pc.elementId, one.sides.get(pc.elementId));
          const a = pc.wI * (pc.b - pc.a);
          addArea(out.roofAreaOf, pc.elementId, a);
          out.roof.add(pc.elementId);
        }
        for (const pt of moved.points) {
          out.points.push({ ...pt, roof, panel: index });
          addArea(out.roofAreaOf, pt.elementId, pt.w);
          out.roof.add(pt.elementId);
        }
        out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + kept);
        continue;
      }
      for (const p of pieces) {
        if (!panel.shellCoverage) addSides(p.elementId, one.sides.get(p.elementId));
        out.pieces.push({ ...p, roof, panel: index });
      }
      for (const p of points) {
        out.points.push({ ...p, roof, panel: index });
        addArea(roof ? out.roofAreaOf : out.areaOf, p.elementId, p.w);
      }
      for (const [id, a] of one.perBeam) { addArea(roof ? out.roofAreaOf : out.areaOf, id, a); if (roof) out.roof.add(id); }
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

  // What goes by width is a roof when nothing higher stands over its midpoint.
  for (const m of out.widthMembers) {
    const e = model.elements.get(m.elementId)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const roof = fringeRoof.has(m.elementId) || !covered([(a.x + b.x) / 2, (a.y + b.y) / 2], Math.max(a.z ?? 0, b.z ?? 0));
    addArea(roof ? out.roofAreaOf : out.areaOf, m.elementId, widthSpans(m, opts.tributaryWidth).reduce((s, w) => s + w.width * (w.t1 - w.t0), 0) * m.horizontalLength);
    if (roof) out.roof.add(m.elementId);
  }
  for (const q of model.quads?.values() ?? []) {
    if (ownership && nonOwners.has(q.id)) continue;
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    const c = centroid(pts.map((p) => [p!.x, p!.y] as [number, number]));
    if (!covered(c, Math.max(...pts.map((p) => p!.z ?? 0)))) out.roofQuads.add(q.id);
  }

  if (ownership?.shadowedBy.size) {
    const shadowed: Array<{ quadId: number; surface: number }> = [];
    for (const [shell, above] of ownership.shadowedBy) {
      const reachable = new Set(above);
      for (const carrier of reachable) {
        for (const upper of ownership.shadowedBy.get(carrier) ?? []) reachable.add(upper);
      }
      const owners = [...reachable].filter(carrier => ownership.shells.has(carrier));
      if (owners.length === 0) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
      const roofCount = owners.filter(owner => out.roofQuads.has(owner.id)).length;
      if (roofCount === owners.length) shadowed.push({ quadId: shell.id, surface: surfaceArea(shell.pts) });
      else if (roofCount > 0) out.roofShellWeightUnresolved = true;
    }
    out.shadowedRoofShells = shadowed;
  }
  if (opts.mode === 'panels') {
    const sloped = out.widthMembers.length - byWidth;
    if (out.pieces.length > 0) out.notes.push(msg('loadPlan.gravity.panels', { members: new Set(out.pieces.map((p) => p.elementId)).size }));
    if (out.widthMembers.length > 0) out.notes.push(msg('loadPlan.gravity.width', { n: out.widthMembers.length, sloped, width: round(opts.tributaryWidth, 2) }));
    if (unresolved > 0) out.notes.push(msg('loadPlan.gravity.unresolved', { n: unresolved }));
    if (partly > 0) out.notes.push(msg('loadPlan.gravity.partlyUnderShells', { n: partly }));
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
type ShellOffset = { offset: Segment[0]; error: number };
type ShellAttachment = { offset: Segment[0]; anchors: Set<number>; error: number };

function attachmentPoint(point: { x: number; y: number; z?: number }, [dx, dy, dz]: Segment[0]): Segment[0] {
  return [point.x + dx, point.y + dy, (point.z ?? 0) + dz];
}

type VerticalShellLink = {
  masterNode: number;
  slaveNode: number;
  geometry?: { fullMotion: boolean; offset: boolean };
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
      if (dofs.includes(2)) add(constraint.masterNode, constraint.slaveNode, { fullMotion, offset: fullMotion });
    } else if (constraint.type === 'eccentricConnection') {
      const { masterNode, slaveNode, releases } = constraint;
      const master = model.nodes.get(masterNode), slave = model.nodes.get(slaveNode);
      if (!master || !slave || releases?.[2]) continue;
      const [x, y, z] = attachmentPoint(master, [constraint.offsetX ?? 0, constraint.offsetY ?? 0, constraint.offsetZ ?? 0]);
      const geometry = samePhysicalPoint({ x, y, z }, slave) ? { fullMotion: dofIndices.every(dof => !releases?.[dof]), offset: true } : undefined;
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

function directShellOffsets(
  model: GravityModel, shellNodes: ReadonlySet<number>, links: readonly VerticalShellLink[],
): Map<number, ShellOffset[]> {
  const offsets = new Map<number, ShellOffset[]>();
  for (const link of links) {
    if (!link.geometry) continue;
    const masterIsShell = shellNodes.has(link.masterNode), slaveIsShell = shellNodes.has(link.slaveNode);
    if (masterIsShell === slaveIsShell) continue;
    const frameNode = masterIsShell ? link.slaveNode : link.masterNode;
    const shellNode = masterIsShell ? link.masterNode : link.slaveNode;
    const member = model.nodes.get(frameNode)!, shell = model.nodes.get(shellNode)!;
    const mz = member.z ?? 0, sz = shell.z ?? 0;
    const offset: Segment[0] = [shell.x - member.x, shell.y - member.y, sz - mz];
    const error = 64 * Number.EPSILON * Math.max(Math.abs(member.x), Math.abs(member.y), Math.abs(mz), Math.abs(shell.x), Math.abs(shell.y), Math.abs(sz));
    if (Math.hypot(...offset) <= error) continue;
    const entries = offsets.get(frameNode) ?? [];
    entries.push({ offset, error });
    offsets.set(frameNode, entries);
  }
  return offsets;
}

function rigidShellCoverage(
  model: GravityModel, offsets: ReadonlyMap<number, ShellOffset[]>, carriers: ShellCarrier[], members: Iterable<number>,
): Map<number, ShellCoverage> {
  const byMember = new Map<number, ShellCoverage>();
  if (!offsets.size) return byMember;
  const axes = memberGeometry(model, members);
  const axesById = new Map(axes.map(axis => [axis.id, axis]));
  const runs = physicalRoofRuns(axes, (a, b) => a === b);
  for (const { members: ids } of runs) {
    const nodes = new Set([...ids].flatMap(id => {
      const { nodeI, nodeJ } = model.elements.get(id)!;
      return [nodeI, nodeJ];
    }));
    const attachments: ShellAttachment[] = [];
    for (const nodeId of nodes) for (const { offset, error } of offsets.get(nodeId) ?? []) {
      const matching = attachments.find(a => Math.hypot(offset[0] - a.offset[0], offset[1] - a.offset[1], offset[2] - a.offset[2]) <= Math.max(error, a.error));
      if (matching) matching.anchors.add(nodeId);
      else attachments.push({ offset, error, anchors: new Set([nodeId]) });
    }
    let coverage: ShellCoverage = 'none';
    for (const { offset, anchors } of attachments) {
      const traces: Segment[] = [...ids].map(id => {
        const { a, b } = axesById.get(id)!;
        return [attachmentPoint(a, offset), attachmentPoint(b, offset)];
      });
      const covered = traces.map(trace => shellCoverage(trace, carriers));
      if (anchors.size > 1 && covered.every(state => state === 'full')) {
        coverage = 'full';
      } else if (covered.some(state => state !== 'none') || traces.some(trace => shellCoverage(trace, carriers, false) !== 'none')) {
        coverage = 'partial';
        break;
      }
    }
    if (coverage !== 'none') for (const id of ids) byMember.set(id, coverage);
  }
  return byMember;
}

function shellCoverage([p, q]: Segment, carriers: ShellCarrier[], requireCoplanar = true): ShellCoverage {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const length = Math.hypot(dx, dy);
  const error = 64 * Number.EPSILON * Math.max(length, ...p.map(Math.abs), ...q.map(Math.abs));
  const eligible = requireCoplanar
    ? carriers.filter(c => [p, q].every(point => Math.abs(heightIn(c.pts, point) - point[2]) <= error))
    : carriers;
  if (!eligible.length) return 'none';
  const cuts = [0, 1];
  const add = (t: number) => { if (t > error / length && t < 1 - error / length) cuts.push(t); };
  for (const { poly } of eligible) for (let i = 0; i < poly.length; i++) {
    const [x, y] = poly[i]!, [xx, yy] = poly[(i + 1) % poly.length]!;
    const ex = xx - x, ey = yy - y;
    const det = dx * ey - dy * ex;
    const px = x - p[0], py = y - p[1];
    if (Math.abs(det) > error * Math.hypot(ex, ey)) {
      const u = (px * dy - py * dx) / det;
      if (u >= 0 && u <= 1) add((px * ey - py * ex) / det);
    } else if (Math.abs(px * dy - py * dx) <= error * length) {
      add((px * dx + py * dy) / length ** 2);
      add(((xx - p[0]) * dx + (yy - p[1]) * dy) / length ** 2);
    }
  }
  cuts.sort((x, y) => x - y);
  const classes = new Set(cuts.slice(1).flatMap((end, i) => {
    const start = cuts[i]!;
    if (end - start <= error / length) return [];
    const t = start + (end - start) / 2;
    const center: [number, number] = [p[0] + t * dx, p[1] + t * dy];
    return [eligible.some(c => inside(center, c.poly, error))];
  }));
  if (classes.size > 1) return 'partial';
  return classes.has(true) ? 'full' : 'none';
}

class NodeComponents {
  private readonly parent = new Map<number, number>();

  has(node: number): boolean {
    return this.parent.has(node);
  }

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

function connectedShellGroups(carriers: ShellCarrier[], components = new NodeComponents()): ShellCarrier[][] {
  for (const shell of carriers) for (const node of shell.nodes.slice(1)) components.join(node, shell.nodes[0]!);
  const groups = new Map<number, ShellCarrier[]>();
  for (const shell of carriers) {
    const id = components.root(shell.nodes[0]!);
    const group = groups.get(id) ?? [];
    group.push(shell);
    groups.set(id, group);
  }
  return [...groups.values()];
}

function shellSeamComponents(model: GravityModel, carriers: ShellCarrier[], fullMotion: NodeComponents): NodeComponents {
  const seams = new NodeComponents();
  const anchors = new Map<number, Set<number>>();
  for (const shell of carriers) for (const id of shell.nodes) {
    if (!fullMotion.has(id)) continue;
    const root = fullMotion.root(id);
    const component = anchors.get(root) ?? new Set<number>();
    if (component.has(id)) continue;
    const point = model.nodes.get(id)!;
    for (const other of component) {
      if (samePhysicalPoint(point, model.nodes.get(other)!)) seams.join(id, other);
    }
    component.add(id);
    anchors.set(root, component);
  }
  return seams;
}

function shellDeckGroups(carriers: ShellCarrier[], seams: NodeComponents): ShellCarrier[][] {
  const shells = new NodeComponents();
  const edges = new Map<string, number>();
  for (const shell of carriers) {
    const nodes = shell.nodes.map(node => seams.root(node));
    for (const [i, a] of nodes.entries()) {
      const b = nodes[(i + 1) % nodes.length]!;
      if (a === b) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const other = edges.get(key);
      if (other === undefined) edges.set(key, shell.id);
      else shells.join(shell.id, other);
    }
  }
  const groups = new Map<number, ShellCarrier[]>();
  for (const shell of carriers) {
    const root = shells.root(shell.id);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(shell);
  }
  return [...groups.values()];
}

function linkedShellDecks(
  model: GravityModel, carriers: ShellCarrier[], links: readonly VerticalShellLink[],
) {
  const vertical = new NodeComponents();
  const fullMotion = new NodeComponents();
  const offsets = new Map<number, Set<number>>();
  for (const { masterNode, slaveNode, geometry } of links) {
    vertical.join(masterNode, slaveNode);
    if (geometry?.fullMotion) fullMotion.join(masterNode, slaveNode);
    if (geometry?.offset) {
      (offsets.get(masterNode) ?? offsets.set(masterNode, new Set()).get(masterNode)!).add(slaveNode);
      (offsets.get(slaveNode) ?? offsets.set(slaveNode, new Set()).get(slaveNode)!).add(masterNode);
    }
  }
  type PlanPoint = { x: number; y: number };
  const planPoint = (node: number): PlanPoint => {
    const { x, y } = model.nodes.get(node)!;
    return { x, y };
  };
  const stationsOf = (nodes: ReadonlySet<number>) => {
    const stations = new Map<number, number[]>();
    for (const node of nodes) {
      const root = vertical.root(node);
      (stations.get(root) ?? stations.set(root, []).get(root)!).push(node);
    }
    return stations;
  };
  type Stations = ReturnType<typeof stationsOf>;
  const connected = (first: Stations, second: Stations) => {
    const shared = [...first.keys()].filter(root => second.has(root));
    if (shared.length < 2) return false;
    const matches: Array<{ root: number; a: PlanPoint; b: PlanPoint; offset: PlanPoint }> = [];
    for (const root of shared) for (const from of first.get(root)!) for (const to of second.get(root)!) {
      const a = planPoint(from), b = planPoint(to);
      const aligned = samePhysicalPoint(a, b);
      if (!aligned && !offsets.get(from)?.has(to)) continue;
      const offset = aligned ? { x: 0, y: 0 } : { x: b.x - a.x, y: b.y - a.y };
      if (matches.some(match => match.root !== root && samePhysicalPoint(match.offset, offset)
        && !samePhysicalPoint(match.a, a) && !samePhysicalPoint(match.b, b))) return true;
      matches.push({ root, a, b, offset });
    }
    return false;
  };

  type Deck = { shells: ShellCarrier[]; stations: Stations };
  const decksByRoot = new Map<number, Set<Deck>>();
  const deckOf = new Map<ShellCarrier, Deck>();
  const seams = shellSeamComponents(model, carriers, fullMotion);
  for (const shells of shellDeckGroups(carriers, seams)) {
    const stations = stationsOf(new Set(shells.flatMap(shell => shell.nodes)));
    const deck: Deck = { shells, stations };
    for (const shell of shells) deckOf.set(shell, deck);
    for (const root of stations.keys()) {
      (decksByRoot.get(root) ?? decksByRoot.set(root, new Set()).get(root)!).add(deck);
    }
  }
  return {
    *shellsAt(stations: Stations) {
      const candidates = new Set<Deck>();
      for (const root of stations.keys()) for (const deck of decksByRoot.get(root) ?? []) candidates.add(deck);
      for (const deck of candidates) if (connected(stations, deck.stations)) yield* deck.shells;
    },
    coupled(a: ShellCarrier, b: ShellCarrier): boolean {
      const first = deckOf.get(a)!, second = deckOf.get(b)!;
      return first === second || connected(first.stations, second.stations);
    },
    stationsOf,
    connected,
  };
}

const atDeckLevel = (height: number, z: number) => height >= z - TOL && height <= z + TOL;

function shellServesDeckLevel(shell: ShellCarrier, z: number): boolean {
  return shell.pts.every(p => atDeckLevel(p[2], z));
}

function deckShells(
  boundary: Polygon, corners: number[], z: number, level: ShellCarrier[], roofs: ShellCarrier[][],
): ShellCarrier[] {
  const atLevel = (height: number) => atDeckLevel(height, z);
  const nodesAtLevel = (roof: ShellCarrier[]) =>
    new Set(roof.flatMap(shell => shell.nodes.filter((_, i) => atLevel(shell.pts[i]![2]))));
  const serving = level.filter(shell => shellServesDeckLevel(shell, z));
  const coveringShells = [...serving];
  const overlaps = (shell: ShellCarrier) => footprintsOverlap(boundary, [shell.poly]);
  try {
    const served = new Set(serving);
    for (const shell of level) {
      if (served.has(shell)) continue;
      const cornersInBand = shell.pts.some(p => atLevel(p[2]));
      const allRoundIntoBand = shell.pts.every(p => atLevel(levelKey(p[2])));
      if ((cornersInBand || allRoundIntoBand) && overlaps(shell)) {
        refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
      }
    }
    for (const roof of roofs) {
      const eaveNodes = nodesAtLevel(roof);
      const isAttached = corners.some(id => eaveNodes.has(id));
      const springsAtLevel = (shell: ShellCarrier) => atLevel(shell.z0);
      if (!isAttached && !roof.some(springsAtLevel)) continue;
      const startsBelow = (shell: ShellCarrier) => shell.z0 < z - TOL;
      const below = roof.filter(startsBelow);
      if (!isAttached && below.length > 0 && !roof.some(shell => springsAtLevel(shell) && overlaps(shell))) continue;
      if (below.some(overlaps)) refuseGravityGeometry(msg('loadPlan.gravity.differentSlopedDeck'));
      const covering = below.length > 0 ? roof.filter(shell => !startsBelow(shell)) : roof;
      if (covering.length === 0) continue;
      const polygons = covering.map(shell => [shell.poly]);
      const projection = polygonClipping.union(polygons[0]!, ...polygons.slice(1));
      if (!footprintsOverlap(boundary, projection)) continue;
      const supportingNodes = covering === roof ? eaveNodes : nodesAtLevel(covering);
      if (boundary.length !== 1 || !corners.every(id => supportingNodes.has(id))
        || polygonClipping.difference(boundary, projection).length !== 0) {
        refuseGravityGeometry(msg('loadPlan.gravity.differentSlopedDeck'));
      }
      coveringShells.push(...covering);
    }
  } catch (err) {
    if (err instanceof EngineMessageError) throw err;
    refuseGravityGeometry(msg('loadPlan.gravity.deckCheckFailed', { detail: String(err) }));
  }
  return coveringShells;
}

function shellAbove(carrier: ShellCarrier, z: number): Polygon[number] {
  const above: Polygon[number] = [];
  carrier.pts.forEach(([x, y, height], i) => {
    const [xx, yy, next] = carrier.pts[(i + 1) % carrier.pts.length]!;
    if (height > z) above.push([x, y]);
    if ((height > z) !== (next > z)) {
      const t = (z - height) / (next - height);
      above.push([x + t * (xx - x), y + t * (yy - y)]);
    }
  });
  return above;
}

type WidthFootprint = { segment: Segment; width: number } | { region: Region; z: number };

function higherFootprints(
  z: number,
  selectedPanels: ReadonlyMap<number, ReadonlyArray<{ footprint: Region }>>,
  carriers: ShellCarrier[],
  widthFootprints: WidthFootprint[],
) {
  const elevation = z + MIN_COVER_RISE;
  const covers = [...selectedPanels].filter(([above]) => above > elevation).flatMap(([, panels]) => panels.flatMap(panel => panel.footprint));
  for (const carrier of carriers) {
    const above = shellAbove(carrier, elevation);
    if (ringArea(above) > 0) covers.push([above]);
  }
  const widthCovers: ReturnType<typeof widthCover>[] = [];
  for (const footprint of widthFootprints) {
    if ('region' in footprint) {
      if (footprint.z > elevation) covers.push(...footprint.region);
    } else {
      const { segment, width } = footprint;
      const range = lowRange(segment[0][2], segment[1][2], elevation, Infinity);
      if (range) widthCovers.push(widthCover(segment, range, width));
    }
  }
  covers.push(...widthCovers.map(cover => cover.footprint));
  return { covers, widthCovers };
}

function uncoveredStripIsRoof({ polygons }: UncoveredStrips, { covers, widthCovers }: ReturnType<typeof higherFootprints>): boolean {
  if (covers.length === 0) return true;
  const exposure = new Set<boolean>();
  try {
    let above: Region | undefined;
    for (const poly of polygons) {
      if (widthCovers.some(cover => cover.contains(poly))) {
        exposure.add(false);
        continue;
      }
      above ??= polygonClipping.union(covers[0]!, ...covers.slice(1));
      if (regionArea(polygonClipping.intersection([poly], above)) > 0) exposure.add(false);
      if (regionArea(polygonClipping.difference([poly], above)) > 0) exposure.add(true);
    }
  } catch (err) {
    refuseGravityGeometry(msg('loadPlan.gravity.exposureCheckFailed', { detail: String(err) }));
  }
  if (exposure.size !== 1) refuseGravityGeometry(msg('loadPlan.gravity.mixedExposure'));
  return exposure.has(true);
}

/** Why a panel of beams is not a floor or a roof deck, if it is not. */
function notADeck(
  model: GravityModel,
  carriers: ShellCarrier[],
  panelsAt: ReadonlyMap<number, Region>,
  coverAbove: (pt: [number, number], zTop: number) => number,
  tributaryWidth: number,
  shellsLoaded: boolean,
): {
  why: (poly: Array<[number, number]>, z: number) => 'lowHeadroom' | 'wide' | 'headroomUnclear' | null;
  checkStrips: (strips: UncoveredStrips, z: number) => void;
  uncarried: (area: Array<[number, number]>, z: number, held: Held, holes?: Array<Array<[number, number]>>) => { share: number; kept: Region };
} {
  const roofMembers: Array<[[number, number, number], [number, number, number]]> = [];
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    if (!a || !b || !beamLike(model, e).ok) continue;
    if (Number.isFinite(coverAbove([(a.x + b.x) / 2, (a.y + b.y) / 2], Math.max(a.z ?? 0, b.z ?? 0)))) continue;
    roofMembers.push([[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]]);
  }
  const roofShells = carriers.filter(c => 'nodes' in c);
  const heightAbove = (p: [number, number], z: number): number => {
    let h = Infinity;
    for (const [a, b] of roofMembers) {
      if (!nearSegment(p, [a[0], a[1]], [b[0], b[1]], 0.1)) continue;
      const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2)) : 0;
      const dz = a[2] + t * (b[2] - a[2]) - z;
      if (dz > TOL) h = Math.min(h, dz);
    }
    for (const c of roofShells) {
      if (!inside(p, c.poly)) continue;
      const dz = heightIn(c.pts, [p[0], p[1], z]) - z;
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
      for (const [a, b] of roofMembers) {
        if (Math.max(a[2], b[2]) <= z + TOL) continue;
        const da = across([a[0], a[1]]), db = across([b[0], b[1]]);
        if ((da > 1e-9 && db > 1e-9) || (da < -1e-9 && db < -1e-9) || Math.abs(da - db) <= 1e-12) continue;
        const t = Math.max(0, Math.min(1, da / (da - db)));
        const off = alongOf([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        const dz = a[2] + t * (b[2] - a[2]) - z;
        if (dz < -TOL || off < lo || off > hi) continue;
        if (off < 0 && (!below || off > below[0])) below = [off, dz];
        if (off > 0 && (!above || off < above[0])) above = [off, dz];
      }
      if (below && above) h = Math.min(h, Math.max(0, below[1] + ((above[1] - below[1]) * -below[0]) / (above[0] - below[0])));
    }
    return h;
  };
  /**
   * The part of `area` that no load already kept less than a storey above carries, and its share
   * of `area`: what is left once the loaded panels, the tributary strips of members kept by width
   * (over the stretch of each that is low), the shells loaded by panels (all of whose corners are
   * low) and what panels and members within the roof's structure kept for themselves are taken
   * away, as are `holes`, the outermost panels nested in it that load their own area. Geometry that cannot be
   * resolved keeps all of `area`.
   */
  const uncarried = (area: Array<[number, number]>, z: number, held: Held, holes: Array<Array<[number, number]>> = []): { share: number; kept: Region } => {
    const low = (dz: number) => dz > TOL && dz < MIN_STOREY_HEADROOM;
    const whole: Region = [[closeRing(area)]];
    const cover: Region[] = holes.map((h) => [[closeRing(h)]]);
    const total = regionArea(whole) - cover.reduce((s, h) => s + regionArea(h), 0);
    if (!(total > 1e-12)) return { share: 1, kept: whole };
    for (const k of held.regions) if (low(k.z - z)) cover.push(k.region);
    if (shellsLoaded) for (const c of carriers) if (c.pts.every((p) => low(p[2] - z))) cover.push([[closeRing(c.poly)]]);
    for (const [a, b] of held.members) {
      const range = lowRange(a[2] - z, b[2] - z, TOL, MIN_STOREY_HEADROOM);
      if (!range || Math.hypot(b[0] - a[0], b[1] - a[1]) * (range[1] - range[0]) <= 1e-9) continue;
      cover.push([[closeRing(widthFootprint([a, b], range, tributaryWidth))]]);
    }
    if (cover.length === 0) return { share: 1, kept: whole };
    const o = area[0]!;
    for (const step of [1e-9, 1e-6, 1e-4]) {
      try {
        const local = (r: Region) => snap(shift(r, -o[0], -o[1]), step);
        const rest = polygonClipping.difference(local(whole) as never, ...(cover.map(local) as never[])) as unknown as Region;
        const kept = shift(rest.filter((poly) => regionArea([poly]) > 1e-9 * total), o[0], o[1]);
        return { share: Math.min(1, Math.max(0, regionArea(kept) / total)), kept };
      } catch {
        continue;
      }
    }
    return { share: 1, kept: whole };
  };
  const headroom = (poly: Array<[number, number]>, z: number): 'lowHeadroom' | 'headroomUnclear' | null => {
    const probes: Array<[number, number]> = [centroid(poly)];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      for (const t of [0.25, 0.5, 0.75]) probes.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    });
    const heights = probes.map((p) => {
      const h = heightAbove(p, z);
      return Number.isFinite(h) ? h : between(p, z, poly);
    });
    const roofed = heights.filter(Number.isFinite);
    const low = roofed.some((h) => h > TOL && h < MIN_STOREY_HEADROOM);
    if (low && roofed.length === probes.length && Math.max(...roofed) < MIN_STOREY_HEADROOM
      && coverAbove(centroid(poly), z) < MIN_STOREY_HEADROOM) return 'lowHeadroom';
    return low ? 'headroomUnclear' : null;
  };
  const why = (poly: Array<[number, number]>, z: number) => {
    const clearance = headroom(poly, z);
    if (clearance === 'lowHeadroom') return clearance;
    return narrowestWidth(poly) > MAX_DECK_SPAN ? 'wide' : clearance;
  };
  const checkStrips = ({ span, polygons }: UncoveredStrips, z: number) => {
    if (span > MAX_DECK_SPAN) refuseGravityGeometry(msg('loadPlan.gravity.stripSpan'));
    const lowPanels = [...panelsAt].filter(([elevation]) => elevation - z > TOL && elevation - z < MIN_STOREY_HEADROOM)
      .flatMap(([, polys]) => polys);
    const lowShells = carriers.filter(({ pts }) => {
      const heights = pts.map(p => p[2] - z);
      return Math.max(...heights) > TOL && Math.min(...heights) < MIN_STOREY_HEADROOM;
    });
    for (const poly of polygons) {
      const overlap = (above: Array<[number, number]>) => {
        try {
          return polygonClipping.intersection([poly], [above]).map(([outer]) => outer!).filter(ring => ringArea(ring) > 0);
        } catch (err) {
          return refuseGravityGeometry(msg('loadPlan.gravity.headroomCheckFailed', { detail: String(err) }));
        }
      };
      const shellBelowHeadroom = ({ poly: above, pts }: (typeof lowShells)[number]) => overlap(above).some(ring => {
        const heights = ring.map(p => heightIn(pts, [p[0], p[1], z]) - z);
        return !heights.every(Number.isFinite) || (Math.max(...heights) > TOL && Math.min(...heights) < MIN_STOREY_HEADROOM);
      });
      if (headroom(poly, z) || lowPanels.some(above => footprintArea(footprintIntersection([poly], above)) > 0) || lowShells.some(shellBelowHeadroom)) {
        refuseGravityGeometry(msg('loadPlan.gravity.stripHeadroom'));
      }
    }
  };
  return { why, checkStrips, uncarried };
}

/** A quad's surface area, m²: its two triangles, as `quadCornerShares` integrates a flat one. */
function surfaceArea(p: Array<[number, number, number]>): number {
  const tri = (a: number[], b: number[], c: number[]) => {
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    return Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
  };
  let s = 0;
  for (let i = 1; i + 1 < p.length; i++) s += tri(p[0]!, p[i]!, p[i + 1]!);
  return s;
}

/** The height of a quad over a plan point, from the triangle of its fan the point falls in. */
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

/** What the loads already kept carry: whole panels, members' strips, and what fringe panels and members kept. */
type Held = { members: Segment[]; regions: Array<{ region: Region; z: number }> };

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

/** A region with its coordinates rounded to `step`, which polygon-clipping needs to close rings whose edges nearly coincide. */
function snap(r: Region, step: number): Region {
  return r.map((poly) => poly.map((ring) => ring.map(([x, y]) => [Math.round(x / step) * step, Math.round(y / step) * step] as [number, number])));
}

/** Area of a region: outer rings less their holes. */
function regionArea(r: Region): number {
  let s = 0;
  for (const poly of r) poly.forEach((ring, k) => { s += (k === 0 ? 1 : -1) * Math.abs(signedArea(openRing(ring))); });
  return s;
}

/** Where along [0, 1] a height above the level, linear from `d0` to `d1`, lies strictly between `lo` and `hi`. */
function lowRange(d0: number, d1: number, lo: number, hi: number): [number, number] | null {
  let t0 = 0, t1 = 1;
  for (const [f0, f1] of [[d0 - lo, d1 - lo], [hi - d0, hi - d1]] as const) {
    if (f0 <= 0 && f1 <= 0) return null;
    if (f0 > 0 && f1 > 0) continue;
    const t = f0 / (f0 - f1);
    if (f0 > 0) t1 = Math.min(t1, t); else t0 = Math.max(t0, t);
  }
  return t1 > t0 ? [t0, t1] : null;
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
} {
  const BINS = 40;
  const beams = beamIds.flatMap((id) => {
    const e = model.elements.get(id);
    const p = e && model.nodes.get(e.nodeI), q = e && model.nodes.get(e.nodeJ);
    if (!e || !p || !q) return [];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    return L > 0 ? [{ id, ends: [e.nodeI, e.nodeJ] as [number, number], p: [p.x, p.y] as [number, number], u: [(q.x - p.x) / L, (q.y - p.y) / L] as [number, number], L, area: new Array(BINS).fill(0) as number[], first: new Array(BINS).fill(0) as number[] }] : [];
  });
  const out = { pieces: [] as Array<{ elementId: number; a: number; b: number; wI: number; wJ: number }>, points: [] as Array<{ nodeId: number; w: number; elementId: number }> };
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

function widthFootprint([a, b]: Segment, [start, end]: [number, number], width: number): Array<[number, number]> {
  const at = (t: number): [number, number] => {
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  return tributaryStrip(at(start), at(end), width);
}

function widthCover(run: Segment, [start, end]: [number, number], width: number) {
  const [a, b] = run;
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = Math.hypot(dx, dy);
  const origin: [number, number] = [a[0], a[1]];
  const axis: [number, number] = [dx / length, dy / length];
  const normal: [number, number] = [-axis[1], axis[0]];
  const [lo, hi] = [start * length, end * length];
  const half = width / 2;
  return {
    footprint: [widthFootprint(run, [start, end], width)] as Polygon,
    contains: (polygon: Polygon[number]) => polygon.every(point => {
      const station = snowCoordinate(point, origin, axis, [lo, hi]);
      const offset = snowCoordinate(point, origin, normal, [-half, half]);
      return station >= lo && station <= hi && Math.abs(offset) <= half;
    }),
  };
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
function inside(pt: [number, number], poly: Array<[number, number]>, tol = 0.05): boolean {
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
function coverage(model: GravityModel, zOf: Map<number, number>, panelsAt: ReadonlyMap<number, Region>, excludedShells?: ReadonlySet<number>): (pt: [number, number], zTop: number) => number {
  type Cover = { z: number; polys: Region };
  const covers: Cover[] = [];
  const coverAt = (z: number) => {
    let c = covers.find((x) => Math.abs(x.z - z) <= TOL);
    if (!c) { c = { z, polys: [] }; covers.push(c); }
    return c;
  };
  for (const [z, polys] of panelsAt) coverAt(z).polys.push(...polys);
  for (const q of model.quads?.values() ?? []) {
    if (excludedShells?.has(q.id)) continue;
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    coverAt(Math.min(...pts.map((p) => p!.z ?? 0))).polys.push([pts.map((p) => [p!.x, p!.y] as [number, number])]);
  }
  const footprints = [...panelsAt].flatMap(([z, polys]) => unionFootprints(polys).map(rings => ({ z, rings: rings.map(openRing) })));
  const contains = (pt: [number, number], rings: Polygon, tol = TOL) => inside(pt, rings[0]!, tol)
    && rings.slice(1).every(hole => !inside(pt, hole, 0) || hole.some((p, i) => nearSegment(pt, p, hole[(i + 1) % hole.length]!, TOL)));
  const runs = physicalRoofRuns(memberGeometry(model, zOf.keys())).map(({ a, b }) => {
    const start: [number, number] = [a.x, a.y], end: [number, number] = [b.x, b.y];
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
    const eave = (a.z ?? 0) <= (b.z ?? 0) ? a : b;
    const within = (rings: Array<Array<[number, number]>>) => {
      if (!contains(start, rings) || !contains(end, rings)) return false;
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
        return contains([a.x + mid * dx, a.y + mid * dy], rings);
      });
    };
    const ownPanels = footprints.filter(({ z, rings }) => Math.abs(z - (eave.z ?? 0)) <= TOL
      && rings.some(poly => poly.some((p, i) => nearSegment([eave.x, eave.y], p, poly[(i + 1) % poly.length]!, TOL))) && within(rings));
    return {
      start, end, ownPanels,
      heightAt: (pt: [number, number]) => {
        const t = Math.max(0, Math.min(1, ((pt[0] - a.x) * dx + (pt[1] - a.y) * dy) / length2));
        return (a.z ?? 0) + t * ((b.z ?? 0) - (a.z ?? 0));
      },
    };
  });
  return (pt: [number, number], zTop: number) => {
    let h = covers.reduce((h, c) => c.z > zTop + MIN_COVER_RISE && c.polys.some(poly => contains(pt, poly, 0.05)) ? Math.min(h, c.z - zTop) : h, Infinity);
    for (const run of runs) {
      if (!nearSegment(pt, run.start, run.end, 0.05)) continue;
      if (run.ownPanels.some(({ z, rings }) => Math.abs(z - zTop) <= TOL && contains(pt, rings))) continue;
      const z = run.heightAt(pt);
      if (z > zTop + MIN_COVER_RISE) h = Math.min(h, z - zTop);
    }
    return h;
  };
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
