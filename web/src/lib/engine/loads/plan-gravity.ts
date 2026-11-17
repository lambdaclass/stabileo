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
import { assertPlanarShell, refuseGravityGeometry, ringArea, type UncoveredStrips } from './gravity-shell-partition';
import { physicalRoofRuns } from './physical-roof-geometry';
import polygonClipping, { type Polygon } from 'polygon-clipping';
import { physicalFloorLoad as floorLoad, type FloorBeam, type FloorPanel, type SideStretch } from './floor-loads';
import { EngineMessageError, msg, round, type EngineMessage } from '../../codes/message';

export interface GravityModel {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId?: number; type?: 'frame' | 'truss' }>;
  quads?: Map<number, { id: number; nodes: number[] }>;
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
type ShellCarrier = { z0: number; poly: Polygon[number]; pts: Array<[number, number, number]> };
type SlopedCarrier = ShellCarrier & { nodes: number[] };
const levelKey = (z: number) => Math.round(z / TOL) * TOL;

/** True when a member is close enough to horizontal to carry an area load (|Δz|/L ≤ 0.5). */
export function beamLike(model: GravityModel, el: { nodeI: number; nodeJ: number }): { ok: boolean; length: number; horizontalLength: number } {
  const nI = model.nodes.get(el.nodeI), nJ = model.nodes.get(el.nodeJ);
  if (!nI || !nJ) return { ok: false, length: 0, horizontalLength: 0 };
  const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
  const L = Math.hypot(dx, dy, dz);
  if (L < 0.01) return { ok: false, length: 0, horizontalLength: 0 };
  return { ok: Math.abs(dz) / L <= 0.5, length: L, horizontalLength: Math.hypot(dx, dy) };
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
  for (const e of candidates) {
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    if (a && b && beamLike(model, e).ok) out.zOf.set(e.id, ((a.z ?? 0) + (b.z ?? 0)) / 2);
  }

  const quadsAt = new Map<number, Array<{ quadId: number; area: number }>>();
  const slopedQuads: Array<{ quadId: number; area: number; z: number; cos: number }> = [];
  const levelCarriers: ShellCarrier[] = [];
  const slopedCarriers: SlopedCarrier[] = [];
  const steep: number[] = [];
  for (const q of model.quads?.values() ?? []) {
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    const xyz = pts.map((p) => [p!.x, p!.y, p!.z ?? 0] as [number, number, number]);
    const zs = xyz.map((p) => p[2]);
    const poly = xyz.map((p) => [p[0], p[1]] as [number, number]);
    const plan = ringArea(poly);
    if (opts.mode === 'panels' && plan > 0) assertPlanarShell(q.id, xyz);
    if (Math.max(...zs) - Math.min(...zs) <= TOL) {
      const key = levelKey(zs[0]!);
      const list = quadsAt.get(key) ?? [];
      list.push({ quadId: q.id, area: plan });
      quadsAt.set(key, list);
      if (plan > 0) levelCarriers.push({ z0: key, poly, pts: xyz });
      continue;
    }
    const surface = surfaceArea(xyz);
    const cos = surface > 0 ? plan / surface : 0;
    // |sin| ≤ 0,5, the members' rule: a roof; past 80° a wall; between, named.
    if (cos >= Math.sqrt(0.75) - 1e-9) {
      slopedQuads.push({ quadId: q.id, area: plan, z: zs.reduce((s, z) => s + z, 0) / zs.length, cos });
      slopedCarriers.push({ z0: levelKey(Math.min(...zs)), poly, pts: xyz, nodes: q.nodes });
    } else if (cos > Math.cos((80 * Math.PI) / 180)) steep.push(q.id);
  }
  const carriers = [...levelCarriers, ...slopedCarriers];
  const roofs = opts.mode === 'panels' ? connectedShellRoofs(slopedCarriers) : [];
  const shellMembership = new Map<number, boolean>();
  const inShell = (e: { id: number; nodeI: number; nodeJ: number }): boolean => {
    if (opts.mode !== 'panels' || !carriers.length) return false;
    if (shellMembership.has(e.id)) return shellMembership.get(e.id)!;

    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const p: Segment[0] = [a.x, a.y, a.z ?? 0], q: Segment[1] = [b.x, b.y, b.z ?? 0];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const length = Math.hypot(dx, dy);
    const error = 64 * Number.EPSILON * Math.max(length, ...p.map(Math.abs), ...q.map(Math.abs));
    const onPlane = carriers.filter(c => [p, q].every(point => Math.abs(heightIn(c.pts, point) - point[2]) <= error));
    const cuts = [0, 1];
    const add = (t: number) => { if (t > error / length && t < 1 - error / length) cuts.push(t); };
    for (const { poly } of onPlane) for (let i = 0; i < poly.length; i++) {
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
      return [onPlane.some(c => inside(center, c.poly, error))];
    }));
    if (classes.size > 1) refuseGravityGeometry(msg('loadPlan.gravity.unresolvedMember', { id: e.id }));
    const covered = classes.has(true);
    shellMembership.set(e.id, covered);
    return covered;
  };

  // Horizontal members, by level; the rest that can carry a load go by width.
  const beamsAt = new Map<number, FloorBeam[]>();
  for (const e of candidates) {
    const nI = model.nodes.get(e.nodeI), nJ = model.nodes.get(e.nodeJ);
    if (!nI || !nJ) continue;
    const b = beamLike(model, e);
    if (!b.ok) continue;
    const horizontal = Math.abs((nI.z ?? 0) - (nJ.z ?? 0)) <= TOL;
    // By width every member takes the width; its floor's panels still say what it covers. A
    // sloped member in a shell's surface is a rafter under the roof the shell carries.
    if (opts.mode === 'width' || (!horizontal && !inShell(e))) width(e.id, b.length, b.horizontalLength);
    if (!horizontal) continue;
    const key = levelKey(nI.z ?? 0);
    const list = beamsAt.get(key) ?? [];
    list.push({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: 'frame', sectionId: e.sectionId ?? 0 });
    beamsAt.set(key, list);
  }

  // First pass: the panels of every level, which say what covers what.
  const slab = { distribution: opts.slab ?? 'twoWay', spanAxis: opts.spanAxis } as const;
  const levels = new Map<number, { beams: FloorBeam[]; res: ReturnType<typeof floorLoad> }>();
  const panelsAt = new Map<number, Array<Array<[number, number]>>>();
  for (const [z, beams] of beamsAt) {
    const shellFootprints = opts.mode === 'panels'
      ? (boundary: Polygon, corners: number[]) => deckFootprints(boundary, corners, z, levelCarriers, roofs)
      : undefined;
    const res = floorLoad({ nodes: model.nodes, beams, q: 1, shellFootprints, ...slab });
    levels.set(z, { beams, res });
    panelsAt.set(z, res.panels.map((pn) => pn.polygon));
  }
  const coverAbove = coverage(model, out.zOf, panelsAt);
  const covered = (pt: [number, number], zTop: number) => Number.isFinite(coverAbove(pt, zTop));
  const panelSides = new Map<number, SideStretch[]>();
  for (const { res } of levels.values()) for (const pn of res.panels) for (const [id, sides] of pn.own?.sides ?? []) {
    (panelSides.get(id) ?? panelSides.set(id, []).get(id)!).push(...sides);
  }
  if (opts.mode === 'width') levels.clear();
  const deck = opts.loadEveryPanel ? null : notADeck(model, carriers, panelsAt, coverAbove, opts.tributaryWidth, opts.mode === 'panels');
  const deckless = (poly: Array<[number, number]>, z: number) => (deck ? deck.why(poly, z) : null);
  const deckReasons = new Map<FloorPanel, ReturnType<typeof deckless>>();
  if (deck) for (const [z, { res }] of levels) for (const panel of res.panels) {
    if (!panel.loaded) continue;
    if (panel.shellCoverage?.kind === 'strips') deck.checkStrips(panel.shellCoverage, z);
    else deckReasons.set(panel, deck.why(panel.polygon, z));
  }
  const fringeRoof = new Map<number, WidthSpan[]>();
  const fringeSides = new Map<number, SideStretch[]>();
  let byWidth = 0, unresolved = 0, partly = 0, lowPanels = 0, widePanels = 0, unclear = 0, unclearRoof = 0, fringes = 0;
  const segment = (id: number): Segment => {
    const e = model.elements.get(id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return [[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]];
  };
  const isSloped = (m: { length: number; horizontalLength: number }) => Math.abs(m.length - m.horizontalLength) > TOL;
  const held: Held = { panels: [], members: out.widthMembers.filter(isSloped).map((m) => segment(m.elementId)), kept: [] };
  const dropped = new Set<FloorPanel>();
  const fringeKept = new Map<FloorPanel, Region>();
  const droppedMembers = new Set<number>();
  const panelLoadedAt = new Map<number, Set<number>>();
  for (const [z, { beams, res }] of levels) {
    const loaded = new Set<number>();
    for (const panel of res.panels) {
      if (!panel.loaded && panel.shellCoverage?.kind !== 'shell') continue;
      // Its members are every one along its sides, a second member between two nodes or a stub
      // along a side included: by the graph's one member per pair of nodes, those went by width
      // as well, the panel's area loaded twice.
      const members = panel.members ? new Set(panel.members) : null;
      for (const b of beams) if (members ? members.has(b.id) : onBoundary(model, b, panel.polygon)) loaded.add(b.id);
    }
    panelLoadedAt.set(z, loaded);
  }
  for (const z of [...beamsAt.keys()].sort((a, b) => b - a)) {
    for (const panel of deck ? levels.get(z)?.res.panels ?? [] : []) {
      if (!panel.loaded || !panel.own) continue;
      const why = deckReasons.get(panel);
      if (why === 'wide') continue;
      if (why === 'lowHeadroom') {
        const within = (o: { polygon: Array<[number, number]>; area: number }, p: { polygon: Array<[number, number]>; area: number }) => o !== p && o.area < p.area && o.polygon.every((q) => inside(q, p.polygon));
        const all = levels.get(z)?.res.panels ?? [];
        const loading = all.filter((o) => o.loaded && o.own && within(o, panel) && deckReasons.get(o) !== 'wide');
        const nested = loading.filter((o) => !loading.some((m) => within(o, m)));
        const { share, kept } = deck!.uncarried(panel.polygon, z, held, nested.map((o) => o.polygon));
        if (share <= 0) { dropped.add(panel); continue; }
        fringeKept.set(panel, kept);
        held.kept.push({ region: kept, z });
        continue;
      }
      const footprints = panel.shellCoverage?.kind === 'strips' ? panel.shellCoverage.polygons : [panel.polygon];
      for (const poly of footprints) held.panels.push({ poly, z });
    }
    const flat = (beamsAt.get(z) ?? []).filter((b) => opts.mode === 'width' || (!panelLoadedAt.get(z)?.has(b.id) && !inShell(b)));
    for (const e of flat) {
      const [a, b] = segment(e.id);
      const why = deckless([[a[0], a[1]], [b[0], b[1]]], z);
      const beside = (panelsAt.get(z) ?? []).filter((poly) => onBoundary(model, e, poly)).map((poly) => deckless(poly, z));
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
        fringeRoof.set(e.id, spans);
        fringeSides.set(e.id, loadedSides(kept, axis));
        held.kept.push({ region: kept, z });
        fringes++;
        continue;
      }
      held.members.push([a, b]);
    }
  }

  if (opts.mode === 'panels') {
    for (const [z, quads] of quadsAt) {
      out.shellQuads.push(...quads.map((q) => ({ ...q, z, cos: 1 })));
      const area = quads.reduce((s, q) => s + q.area, 0);
      out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + area);
      out.notes.push(msg('loadPlan.gravity.shellLevel', { z: round(z, 2), n: quads.length, area: round(area, 1) }));
    }
    if (slopedQuads.length > 0) {
      out.shellQuads.push(...slopedQuads);
      out.notes.push(msg('loadPlan.gravity.slopedShells', { n: slopedQuads.length, area: round(slopedQuads.reduce((s, q) => s + q.area, 0), 1) }));
    }
    if (steep.length > 0) out.notes.push(msg('loadPlan.gravity.steepShells', { n: steep.length, ids: steep.slice(0, 10).join(', ') + (steep.length > 10 ? '…' : '') }));
  }

  const selectedPanels = new Map([...levels].map(([z, { res }]) => [z, res.panels.flatMap(panel => {
    if (!panel.loaded || !panel.own) return [];
    if (dropped.has(panel)) { lowPanels++; return []; }
    const why = deckReasons.get(panel);
    if (why === 'wide') { widePanels++; return []; }
    const strips = panel.shellCoverage?.kind === 'strips' ? panel.shellCoverage : undefined;
    const region = fringeKept.get(panel);
    const footprint = region ?? (strips ? strips.polygons.map(poly => [poly]) : [[panel.polygon, ...(panel.holes ?? [])]]);
    return [{ panel, own: panel.own, why, strips, region, footprint }];
  })]));

  // Second pass: each panel on its own, as a floor or as a roof.
  const panelBeams: Array<Set<number>> = [];
  const panelLevel: number[] = [];
  const levelOrder = [...levels.keys()].sort((a, b) => a - b);
  for (const [z, { beams, res }] of levels) {
    unresolved += res.skipped.unresolved;
    const loaded = panelLoadedAt.get(z)!;
    let overhead: Polygon[] | undefined;
    for (const { panel, own: one, why, strips, region } of selectedPanels.get(z) ?? []) {
      if (why === 'lowHeadroom') fringes++;
      if (why === 'headroomUnclear') { if (covered(centroid(panel.polygon), z)) unclear++; else unclearRoof++; }
      if (strips) partly++;
      const roof = strips
        ? uncoveredStripIsRoof(strips, overhead ??= higherFootprints(z, selectedPanels, carriers))
        : why === 'lowHeadroom' || !covered(centroid(panel.polygon), z);
      const index = panelBeams.length;
      panelBeams.push(new Set(one.perBeam.keys()));
      panelLevel.push(levelOrder.indexOf(z));
      out.panels.push({ polygon: panel.polygon, z, roof });
      if (region) {
        let kept = 0;
        const moved = regionToBeams(model, region, [...one.perBeam.keys()]);
        for (const pc of moved.pieces) {
          out.pieces.push({ ...pc, roof, panel: index });
          addSides(pc.elementId, one.sides.get(pc.elementId));
          const a = pc.wI * (pc.b - pc.a);
          addArea(out.roofAreaOf, pc.elementId, a);
          out.roof.add(pc.elementId);
          kept += a;
        }
        for (const pt of moved.points) {
          out.points.push({ ...pt, roof, panel: index });
          addArea(out.roofAreaOf, pt.elementId, pt.w);
          out.roof.add(pt.elementId);
          kept += pt.w;
        }
        out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + kept);
        continue;
      }
      for (const l of one.loads) {
        if (!panel.shellCoverage) addSides(l.elementId, one.sides.get(l.elementId));
        out.pieces.push({ elementId: l.elementId, ...(l.a !== undefined ? { a: l.a, b: l.b } : {}), wI: l.qI, wJ: l.qJ, roof, panel: index });
      }
      for (const n of one.nodal) {
        out.points.push({ nodeId: n.nodeId, w: -n.fz, elementId: n.elementId, roof, panel: index });
        addArea(roof ? out.roofAreaOf : out.areaOf, n.elementId, -n.fz);
      }
      for (const [id, a] of one.perBeam) { addArea(roof ? out.roofAreaOf : out.areaOf, id, a); if (roof) out.roof.add(id); }
      out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + one.area);
    }
    for (const b of beams) {
      if (loaded.has(b.id) || inShell(b)) continue;
      const g = beamLike(model, b);
      width(b.id, g.length, g.horizontalLength);
      byWidth++;
    }
  }

  // A horizontal member within the roof's structure is a chord or an eave beam: no floor loads it.
  const beforeDepth = out.widthMembers.length;
  out.widthMembers = out.widthMembers.filter((m) => !droppedMembers.has(m.elementId));
  for (const m of out.widthMembers) {
    const spans = fringeRoof.get(m.elementId);
    if (spans) m.spans = spans;
    addSides(m.elementId, spans ? fringeSides.get(m.elementId) : opts.mode === 'width' ? panelSides.get(m.elementId) : undefined);
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
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    const c = centroid(pts.map((p) => [p!.x, p!.y] as [number, number]));
    if (!covered(c, Math.max(...pts.map((p) => p!.z ?? 0)))) out.roofQuads.add(q.id);
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

function connectedShellRoofs(sloped: SlopedCarrier[]): SlopedCarrier[][] {
  const parent = sloped.map((_, i) => i);
  const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]!));
  const byNode = new Map<number, number>();
  sloped.forEach((carrier, i) => {
    for (const id of carrier.nodes) {
      const other = byNode.get(id);
      if (other === undefined) byNode.set(id, i);
      else parent[root(i)] = root(other);
    }
  });
  const groups = new Map<number, SlopedCarrier[]>();
  sloped.forEach((carrier, i) => {
    const id = root(i);
    const group = groups.get(id) ?? [];
    group.push(carrier);
    groups.set(id, group);
  });
  return [...groups.values()];
}

function deckFootprints(boundary: Polygon, corners: number[], z: number, level: ShellCarrier[], roofs: SlopedCarrier[][]): Polygon[] {
  const atLevel = (height: number) => height >= z - TOL && height <= z + TOL;
  const footprints: Polygon[] = [];
  try {
    for (const shell of level) {
      if (shell.pts.every(p => atLevel(p[2]))) footprints.push([shell.poly]);
      else if (atLevel(shell.z0) && regionArea(polygonClipping.intersection(boundary, [shell.poly])) > 0) {
        refuseGravityGeometry(msg('loadPlan.gravity.differentDeck'));
      }
    }
    for (const roof of roofs) {
      if (!atLevel(Math.min(...roof.map(shell => shell.z0)))) continue;
      const polygons = roof.map(shell => [shell.poly]);
      const projection = polygonClipping.union(polygons[0]!, ...polygons.slice(1));
      if (!(regionArea(polygonClipping.intersection(boundary, projection)) > 0)) continue;
      const eaveNodes = new Set(roof.flatMap(shell => shell.nodes.filter((_, i) => atLevel(shell.pts[i]![2]))));
      if (boundary.length === 1 && corners.every(id => eaveNodes.has(id)) && polygonClipping.difference(boundary, projection).length === 0) {
        footprints.push(...polygons);
      } else {
        refuseGravityGeometry(msg('loadPlan.gravity.differentSlopedDeck'));
      }
    }
  } catch (err) {
    if (err instanceof EngineMessageError) throw err;
    refuseGravityGeometry(msg('loadPlan.gravity.deckCheckFailed', { detail: String(err) }));
  }
  return footprints;
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

function higherFootprints(z: number, selectedPanels: ReadonlyMap<number, ReadonlyArray<{ footprint: Region }>>, carriers: ShellCarrier[]): Polygon[] {
  const elevation = z + MIN_COVER_RISE;
  const covers = [...selectedPanels].filter(([above]) => above > elevation).flatMap(([, panels]) => panels.flatMap(panel => panel.footprint));
  for (const carrier of carriers) {
    const above = shellAbove(carrier, elevation);
    if (ringArea(above) > 0) covers.push([above]);
  }
  return covers;
}

function uncoveredStripIsRoof({ polygons }: UncoveredStrips, covers: Polygon[]): boolean {
  if (covers.length === 0) return true;
  const exposure = new Set<boolean>();
  try {
    const above = polygonClipping.union(covers[0]!, ...covers.slice(1));
    for (const poly of polygons) {
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
  carriers: Array<ShellCarrier | SlopedCarrier>,
  panelsAt: Map<number, Array<Array<[number, number]>>>,
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
    for (const p of held.panels) if (low(p.z - z)) cover.push([[closeRing(p.poly)]]);
    for (const k of held.kept) if (low(k.z - z)) cover.push(k.region);
    if (shellsLoaded) for (const c of carriers) if (c.pts.every((p) => low(p[2] - z))) cover.push([[closeRing(c.poly)]]);
    for (const [a, b] of held.members) {
      const range = lowRange(a[2] - z, b[2] - z, TOL, MIN_STOREY_HEADROOM);
      if (!range || Math.hypot(b[0] - a[0], b[1] - a[1]) * (range[1] - range[0]) <= 1e-9) continue;
      const at = (t: number): [number, number] => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      cover.push([[closeRing(tributaryStrip(at(range[0]), at(range[1]), tributaryWidth))]]);
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
      if (headroom(poly, z) || lowPanels.some(above => overlap(above).length) || lowShells.some(shellBelowHeadroom)) {
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

type Region = Array<Array<Array<[number, number]>>>;

/** What the loads already kept carry: whole panels, members' strips, and what fringe panels and members kept. */
type Held = { panels: Array<{ poly: Array<[number, number]>; z: number }>; members: Segment[]; kept: Array<{ region: Region; z: number }> };

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

/** How far above `zTop` the lowest panel, slab or beam over a plan point is (see the header); Infinity when none is. */
function coverage(model: GravityModel, zOf: Map<number, number>, panelsAt: Map<number, Array<Array<[number, number]>>>): (pt: [number, number], zTop: number) => number {
  type Cover = { z: number; polys: Array<Array<[number, number]>> };
  const covers: Cover[] = [];
  const coverAt = (z: number) => {
    let c = covers.find((x) => Math.abs(x.z - z) <= TOL);
    if (!c) { c = { z, polys: [] }; covers.push(c); }
    return c;
  };
  for (const [z, polys] of panelsAt) coverAt(z).polys.push(...polys);
  for (const q of model.quads?.values() ?? []) {
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    coverAt(Math.min(...pts.map((p) => p!.z ?? 0))).polys.push(pts.map((p) => [p!.x, p!.y] as [number, number]));
  }
  const geometry = [...zOf.keys()].map(id => {
    const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z ?? 0) - (a.z ?? 0);
    return { id, a, b, dx, dy, dz, lh: Math.hypot(dx, dy) };
  });
  const footprints = [...panelsAt].flatMap(([z, polys]) => connectedRoofFootprints(polys).map(rings => ({ z, rings })));
  const contains = (pt: [number, number], rings: Array<Array<[number, number]>>) => inside(pt, rings[0]!, TOL)
    && rings.slice(1).every(hole => !inside(pt, hole, 0) || hole.some((p, i) => nearSegment(pt, p, hole[(i + 1) % hole.length]!, TOL)));
  const runs = physicalRoofRuns(geometry).map(({ a, b }) => {
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
    let h = covers.reduce((h, c) => c.z > zTop + MIN_COVER_RISE && c.polys.some(poly => inside(pt, poly)) ? Math.min(h, c.z - zTop) : h, Infinity);
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
