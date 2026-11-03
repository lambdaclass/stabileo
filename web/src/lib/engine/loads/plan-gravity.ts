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
 * area load as a surface load, and what lies under them takes nothing, or the area would be
 * loaded twice. Under them means a panel the shells springing from its level cover in plan (a
 * slab at the level, or a sloped roof starting from it: the ring of beams at the eaves closes the
 * roof's own plan, and a roof of several quads down each slope springs from its eaves as a whole),
 * the beams around such a panel, and a member lying in a shell's surface (a rafter, a ridge). A
 * panel only partly covered gives its beams the uncovered share. The rest of the level is loaded
 * through its beams as any other: a slab over one bay does not unload the bay beside it.
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
import { floorLoad, type FloorBeam } from './floor-loads';
import { msg, round, type EngineMessage } from '../../codes/message';

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

export interface GravityLayout {
  pieces: GravityPiece[];
  points: GravityPoint[];
  /** Area each member collects from floors, m². */
  areaOf: Map<number, number>;
  /** Area each member collects from roofs, m². A beam at a step has both. */
  roofAreaOf: Map<number, number>;
  /**
   * Members loaded with the tributary width, and whether each is sloped (its load is per
   * projection); `width`, m, when a member takes less than the tributary width (`roofFringe`).
   */
  widthMembers: Array<{ elementId: number; length: number; horizontalLength: number }>;
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
  notes: EngineMessage[];
}

const TOL = 1e-3;
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

function planArea(pts: Array<{ x: number; y: number }>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function gravityLayout(model: GravityModel, opts: GravityOptions): GravityLayout {
  const out: GravityLayout = {
    pieces: [], points: [], areaOf: new Map(), roofAreaOf: new Map(), widthMembers: [], shellQuads: [], areaByLevel: new Map(),
    roof: new Set(), roofQuads: new Set(), zOf: new Map(), panelColour: [], widthColour: new Map(), panels: [], notes: [],
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

  // The quads that carry an area load: horizontal ones by level, and sloped ones no steeper than
  // a member that carries one (`beamLike`). Each with what it covers in plan, from the level it
  // springs from.
  const quadsAt = new Map<number, Array<{ quadId: number; area: number }>>();
  const slopedQuads: Array<{ quadId: number; area: number; z: number; cos: number }> = [];
  const carriers: Array<{ z0: number; poly: Array<[number, number]>; pts: Array<[number, number, number]>; nodes?: number[] }> = [];
  const steep: number[] = [];
  for (const q of model.quads?.values() ?? []) {
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    const xyz = pts.map((p) => [p!.x, p!.y, p!.z ?? 0] as [number, number, number]);
    const zs = xyz.map((p) => p[2]);
    const plan = planArea(pts as Array<{ x: number; y: number }>);
    const poly = xyz.map((p) => [p[0], p[1]] as [number, number]);
    if (Math.max(...zs) - Math.min(...zs) <= TOL) {
      const key = levelKey(zs[0]!);
      const list = quadsAt.get(key) ?? [];
      list.push({ quadId: q.id, area: plan });
      quadsAt.set(key, list);
      carriers.push({ z0: key, poly, pts: xyz });
      continue;
    }
    const surface = surfaceArea(xyz);
    const cos = surface > 0 ? plan / surface : 0;
    // |sin| ≤ 0,5, the members' rule: a roof; past 80° a wall; between, named.
    if (cos >= Math.sqrt(0.75) - 1e-9) {
      slopedQuads.push({ quadId: q.id, area: plan, z: zs.reduce((s, z) => s + z, 0) / zs.length, cos });
      carriers.push({ z0: levelKey(Math.min(...zs)), poly, pts: xyz, nodes: q.nodes });
    } else if (cos > Math.cos((80 * Math.PI) / 180)) steep.push(q.id);
  }
  // A sloped roof springs from its eaves as a whole: each of its quads from the lowest point of
  // the sloped shells joined to it through shared nodes, not from its own lowest corner. With two
  // quads down a slope the upper ones sprang from mid-slope, the eave panel's centre fell under
  // them, and the ring at the eaves was loaded as a floor beneath the roof the shells already carry.
  {
    const sloped = carriers.filter((c) => c.nodes);
    const parent = sloped.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
    const byNode = new Map<number, number>();
    sloped.forEach((c, i) => {
      for (const id of c.nodes!) {
        const j = byNode.get(id);
        if (j === undefined) byNode.set(id, i); else parent[root(i)] = root(j);
      }
    });
    const low = new Map<number, number>();
    sloped.forEach((c, i) => low.set(root(i), Math.min(low.get(root(i)) ?? Infinity, c.z0)));
    sloped.forEach((c, i) => { c.z0 = low.get(root(i))!; });
  }
  /** A point lies in a carrying shell's surface: inside its plan and at its height there. */
  const inShell = (p: [number, number, number]) => opts.mode === 'panels'
    && carriers.some((c) => inside([p[0], p[1]], c.poly) && Math.abs(heightIn(c.pts, p) - p[2]) <= 0.05);
  /**
   * How much of a panel of level `z` the shells springing from that level cover, 0 to 1, by a
   * 20 × 20 grid of points over it. It used to test the panel's centre alone, so a slab over half
   * a bay unloaded the whole bay or none of it.
   */
  const shellCover = (poly: Array<[number, number]>, z: number): number => {
    if (opts.mode !== 'panels') return 0;
    const over = carriers.filter((c) => Math.abs(c.z0 - z) <= TOL);
    if (over.length === 0) return 0;
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), dx = (Math.max(...xs) - x0) / 20, dy = (Math.max(...ys) - y0) / 20;
    let n = 0, hit = 0;
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
      const pt: [number, number] = [x0 + (i + 0.5) * dx, y0 + (j + 0.5) * dy];
      if (!inside(pt, poly, 0)) continue;
      n++;
      if (over.some((c) => inside(pt, c.poly))) hit++;
    }
    return n > 0 ? hit / n : 0;
  };
  const midpoint = (e: { nodeI: number; nodeJ: number }): [number, number, number] => {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return [(a.x + b.x) / 2, (a.y + b.y) / 2, ((a.z ?? 0) + (b.z ?? 0)) / 2];
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
    if (opts.mode === 'width' || (!horizontal && !inShell(midpoint(e)))) width(e.id, b.length, b.horizontalLength);
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
    const res = floorLoad({ nodes: model.nodes, beams, q: 1, ...slab });
    levels.set(z, { beams, res });
    panelsAt.set(z, res.panels.map((pn) => pn.polygon));
  }
  const coverAbove = coverage(model, out.zOf, panelsAt);
  const covered = (pt: [number, number], zTop: number) => Number.isFinite(coverAbove(pt, zTop));
  if (opts.mode === 'width') levels.clear();
  const deck = opts.loadEveryPanel ? null : notADeck(model, carriers, coverAbove, opts.tributaryWidth);
  const deckless = (poly: Array<[number, number]>, z: number) => (deck ? deck.why(poly, z) : null);
  const fringeRoof = new Set<number>();
  let byWidth = 0, unresolved = 0, partly = 0, lowPanels = 0, widePanels = 0, unclear = 0, unclearRoof = 0, fringes = 0;
  const segment = (id: number): Segment => {
    const e = model.elements.get(id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return [[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]];
  };
  const isSloped = (m: { length: number; horizontalLength: number }) => Math.abs(m.length - m.horizontalLength) > TOL;
  const heldMembers = out.widthMembers.filter(isSloped).map((m) => segment(m.elementId));
  const heldPanels: Array<{ poly: Array<[number, number]>; z: number }> = [];
  const dropped = new Set<object>();
  const droppedMembers = new Set<number>();
  const panelLoadedAt = new Map<number, Set<number>>();
  for (const [z, { beams, res }] of levels) {
    const loaded = new Set<number>();
    for (const panel of res.panels) {
      if (!panel.loaded || !panel.own) continue;
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
      const cover = shellCover(panel.polygon, z);
      if (cover >= 0.98) continue;
      const why = cover <= 0.02 ? deckless(panel.polygon, z) : null;
      if (why === 'wide') continue;
      if (why === 'lowHeadroom' && deck!.carried(panel.polygon, z, heldPanels, heldMembers)) { dropped.add(panel); continue; }
      heldPanels.push({ poly: panel.polygon, z });
    }
    const flat = (beamsAt.get(z) ?? []).filter((b) => opts.mode === 'width' || (!panelLoadedAt.get(z)?.has(b.id) && !inShell(midpoint(b))));
    for (const e of flat) {
      const [a, b] = segment(e.id);
      const why = deckless([[a[0], a[1]], [b[0], b[1]]], z);
      const beside = (panelsAt.get(z) ?? []).filter((poly) => onBoundary(model, e, poly)).map((poly) => deckless(poly, z));
      const floorBeside = beside.some((w) => w === null || w === 'headroomUnclear');
      if (why === 'headroomUnclear' || (why === 'lowHeadroom' && floorBeside)) {
        if (covered([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], z)) unclear++; else unclearRoof++;
      }
      if (why === 'lowHeadroom' && !floorBeside) {
        const strip = tributaryStrip([a[0], a[1]], [b[0], b[1]], opts.tributaryWidth);
        if (deck!.carried(strip, z, heldPanels, heldMembers)) { droppedMembers.add(e.id); continue; }
        fringeRoof.add(e.id);
        fringes++;
      }
      heldMembers.push([a, b]);
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

  // Second pass: each panel on its own, as a floor or as a roof.
  const panelBeams: Array<Set<number>> = [];
  const panelLevel: number[] = [];
  const levelOrder = [...levels.keys()].sort((a, b) => a - b);
  for (const [z, { beams, res }] of levels) {
    unresolved += res.skipped.unresolved;
    const loaded = panelLoadedAt.get(z)!;
    for (const panel of res.panels) {
      if (!panel.loaded || !panel.own) continue;
      // Under shells the panel's load is theirs; partly under, its beams take the rest, spread as
      // the whole panel spreads it (the share is right, the shape over the beams approximate).
      const cover = shellCover(panel.polygon, z);
      if (cover >= 0.98) continue;
      const why = cover <= 0.02 ? deckless(panel.polygon, z) : null;
      if (dropped.has(panel)) { lowPanels++; continue; }
      if (why === 'lowHeadroom') fringes++;
      if (why === 'wide') { widePanels++; continue; }
      if (why === 'headroomUnclear') { if (covered(centroid(panel.polygon), z)) unclear++; else unclearRoof++; }
      const share = cover > 0.02 ? 1 - cover : 1;
      if (share < 1) partly++;
      // The panel's own part of the level's result. Loading its members again on their own found
      // an opening's ring as a panel too, and the ring, loaded on its own as well, counted twice.
      const one = panel.own;
      const c = centroid(panel.polygon);
      const roof = why === 'lowHeadroom' || !covered(c, z);
      const index = panelBeams.length;
      panelBeams.push(new Set(one.perBeam.keys()));
      panelLevel.push(levelOrder.indexOf(z));
      out.panels.push({ polygon: panel.polygon, z, roof });
      for (const l of one.loads) {
        out.pieces.push({ elementId: l.elementId, ...(l.a !== undefined ? { a: l.a, b: l.b } : {}), wI: l.qI * share, wJ: l.qJ * share, roof, panel: index });
      }
      for (const n of one.nodal) {
        out.points.push({ nodeId: n.nodeId, w: -n.fz * share, elementId: n.elementId, roof, panel: index });
        addArea(roof ? out.roofAreaOf : out.areaOf, n.elementId, -n.fz * share);
      }
      for (const [id, a] of one.perBeam) { addArea(roof ? out.roofAreaOf : out.areaOf, id, a * share); if (roof) out.roof.add(id); }
      out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + one.area * share);
    }
    for (const b of beams) {
      if (loaded.has(b.id) || inShell(midpoint(b))) continue;
      const g = beamLike(model, b);
      width(b.id, g.length, g.horizontalLength);
      byWidth++;
    }
  }

  // A horizontal member within the roof's structure is a chord or an eave beam: no floor loads it.
  const beforeDepth = out.widthMembers.length;
  out.widthMembers = out.widthMembers.filter((m) => !droppedMembers.has(m.elementId));
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
    addArea(roof ? out.roofAreaOf : out.areaOf, m.elementId, opts.tributaryWidth * m.horizontalLength);
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
/** A ring of beams wider than this both ways, with no beam or slab inside, is no deck: no slab spans it. */
export const MAX_DECK_SPAN = 12;

/** Why a panel of beams is not a floor or a roof deck, if it is not. */
function notADeck(
  model: GravityModel,
  carriers: Array<{ z0: number; poly: Array<[number, number]>; pts: Array<[number, number, number]>; nodes?: number[] }>,
  coverAbove: (pt: [number, number], zTop: number) => number,
  tributaryWidth: number,
): {
  why: (poly: Array<[number, number]>, z: number) => 'lowHeadroom' | 'wide' | 'headroomUnclear' | null;
  carried: (area: Array<[number, number]>, z: number, panels: Array<{ poly: Array<[number, number]>; z: number }>, members: Segment[]) => boolean;
} {
  const roofMembers: Array<[[number, number, number], [number, number, number]]> = [];
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    if (!a || !b || !beamLike(model, e).ok) continue;
    if (Number.isFinite(coverAbove([(a.x + b.x) / 2, (a.y + b.y) / 2], Math.max(a.z ?? 0, b.z ?? 0)))) continue;
    roofMembers.push([[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]]);
  }
  const roofShells = carriers.filter((c) => c.nodes);
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
  const between = (p: [number, number], z: number, lo: [number, number], hi: [number, number]): number => {
    let h = Infinity;
    for (const axis of [0, 1] as const) {
      const along = 1 - axis;
      let below: [number, number] | null = null, above: [number, number] | null = null;
      for (const [a, b] of roofMembers) {
        if (Math.max(a[2], b[2]) <= z + TOL || a[axis] === b[axis]) continue;
        const da = a[axis] - p[axis], db = b[axis] - p[axis];
        if (da * db > 0) continue;
        const t = da / (da - db);
        const at = a[along] + t * (b[along] - a[along]);
        const dz = a[2] + t * (b[2] - a[2]) - z;
        if (dz < -TOL || at < lo[along] - 0.1 || at > hi[along] + 0.1) continue;
        const off = at - p[along];
        if (off < 0 && (!below || off > below[0])) below = [off, dz];
        if (off > 0 && (!above || off < above[0])) above = [off, dz];
      }
      if (below && above) h = Math.min(h, Math.max(0, below[1] + ((above[1] - below[1]) * -below[0]) / (above[0] - below[0])));
    }
    return h;
  };
  /**
   * Whether loads already kept less than a storey above carry all of `area`: a loaded panel, the
   * tributary strip of a member kept by width, or a shell. By a 20 × 20 grid over it, a cell is
   * carried only when it lies wholly within one of them; anything else keeps its load.
   */
  const carried = (area: Array<[number, number]>, z: number, panels: Array<{ poly: Array<[number, number]>; z: number }>, members: Segment[]): boolean => {
    const low = (dz: number) => dz > TOL && dz < MIN_STOREY_HEADROOM;
    const half = tributaryWidth / 2;
    const shells = carriers.filter((c) => c.pts.some((p) => low(p[2] - z)));
    const over = panels.filter((p) => low(p.z - z));
    const inStrip = ([a, b]: Segment, q: [number, number]) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], L2 = ux * ux + uy * uy;
      if (L2 === 0) return false;
      const t = ((q[0] - a[0]) * ux + (q[1] - a[1]) * uy) / L2;
      return t >= 0 && t <= 1 && low(a[2] + t * (b[2] - a[2]) - z)
        && Math.abs((q[0] - a[0]) * uy - (q[1] - a[1]) * ux) / Math.sqrt(L2) <= half;
    };
    const xs = area.map((p) => p[0]), ys = area.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), dx = (Math.max(...xs) - x0) / 20, dy = (Math.max(...ys) - y0) / 20;
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
      const box = { x0: x0 + i * dx, y0: y0 + j * dy, x1: x0 + (i + 1) * dx, y1: y0 + (j + 1) * dy };
      const cell: Array<[number, number]> = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]];
      const touches = inside([(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2], area, 0)
        || cell.some((q) => inside(q, area, 0)) || area.some((v, k) => crossesBox(v, area[(k + 1) % area.length]!, box));
      if (!touches) continue;
      const held = members.some((m) => cell.every((q) => inStrip(m, q)))
        || over.some((p) => within(cell, box, p.poly))
        || shells.some((c) => within(cell, box, c.poly) && cell.every((q) => low(heightIn(c.pts, [q[0], q[1], z]) - z)));
      if (!held) return false;
    }
    return true;
  };
  const why = (poly: Array<[number, number]>, z: number): 'lowHeadroom' | 'wide' | 'headroomUnclear' | null => {
    const probes: Array<[number, number]> = [centroid(poly)];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      for (const t of [0.25, 0.5, 0.75]) probes.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    });
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const lo: [number, number] = [Math.min(...xs), Math.min(...ys)], hi: [number, number] = [Math.max(...xs), Math.max(...ys)];
    const heights = probes.map((p) => {
      const h = heightAbove(p, z);
      return Number.isFinite(h) ? h : between(p, z, lo, hi);
    });
    const roofed = heights.filter(Number.isFinite);
    const low = roofed.some((h) => h > TOL && h < MIN_STOREY_HEADROOM);
    if (low && roofed.length === probes.length && Math.max(...roofed) < MIN_STOREY_HEADROOM
      && coverAbove(centroid(poly), z) < MIN_STOREY_HEADROOM) return 'lowHeadroom';
    if (Math.min(hi[0] - lo[0], hi[1] - lo[1]) > MAX_DECK_SPAN) return 'wide';
    return low ? 'headroomUnclear' : null;
  };
  return { why, carried };
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

type Box = { x0: number; y0: number; x1: number; y1: number };

/** The cell lies wholly in `poly`: its corners inside and no side of `poly` through its interior. */
function within(cell: Array<[number, number]>, box: Box, poly: Array<[number, number]>): boolean {
  return cell.every((q) => inside(q, poly, 1e-6)) && !poly.some((v, k) => crossesBox(v, poly[(k + 1) % poly.length]!, box));
}

/** Some part of the segment from `a` to `b` lies strictly inside the box. */
function crossesBox(a: [number, number], b: [number, number], box: Box): boolean {
  const e = 1e-6;
  let t0 = 0, t1 = 1;
  const d = [b[0] - a[0], b[1] - a[1]];
  const edges: Array<[number, number]> = [
    [-d[0]!, a[0] - (box.x0 + e)], [d[0]!, box.x1 - e - a[0]], [-d[1]!, a[1] - (box.y0 + e)], [d[1]!, box.y1 - e - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t1 - t0 > 1e-9;
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

/** How far above `zTop` the lowest panel, slab or beam over a plan point is (see the header); Infinity when none is. */
function coverage(model: GravityModel, zOf: Map<number, number>, panelsAt: Map<number, Array<Array<[number, number]>>>): (pt: [number, number], zTop: number) => number {
  type Cover = { z: number; polys: Array<Array<[number, number]>>; segs: Array<[[number, number], [number, number]]> };
  const covers: Cover[] = [];
  const coverAt = (z: number) => {
    let c = covers.find((x) => Math.abs(x.z - z) <= TOL);
    if (!c) { c = { z, polys: [], segs: [] }; covers.push(c); }
    return c;
  };
  for (const [z, polys] of panelsAt) coverAt(z).polys.push(...polys);
  for (const q of model.quads?.values() ?? []) {
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    coverAt(Math.min(...pts.map((p) => p!.z ?? 0))).polys.push(pts.map((p) => [p!.x, p!.y] as [number, number]));
  }
  for (const id of zOf.keys()) {
    const e = model.elements.get(id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    coverAt(Math.min(a.z ?? 0, b.z ?? 0)).segs.push([[a.x, a.y], [b.x, b.y]]);
  }
  return (pt, zTop) => covers.reduce((h, c) => (c.z > zTop + 0.05
    && (c.polys.some((poly) => inside(pt, poly)) || c.segs.some(([a, b]) => nearSegment(pt, a, b, 0.05))) ? Math.min(h, c.z - zTop) : h), Infinity);
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
