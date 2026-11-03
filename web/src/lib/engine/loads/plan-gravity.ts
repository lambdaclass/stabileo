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
import polygonClipping from 'polygon-clipping';
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
  const deck = opts.loadEveryPanel ? null : notADeck(model, carriers, coverAbove, opts.tributaryWidth, opts.mode === 'panels');
  const deckless = (poly: Array<[number, number]>, z: number) => (deck ? deck.why(poly, z) : null);
  const fringeRoof = new Map<number, WidthSpan[]>();
  let byWidth = 0, unresolved = 0, partly = 0, lowPanels = 0, widePanels = 0, unclear = 0, unclearRoof = 0, fringes = 0;
  const segment = (id: number): Segment => {
    const e = model.elements.get(id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return [[a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]];
  };
  const isSloped = (m: { length: number; horizontalLength: number }) => Math.abs(m.length - m.horizontalLength) > TOL;
  const held: Held = { panels: [], members: out.widthMembers.filter(isSloped).map((m) => segment(m.elementId)), kept: [] };
  const dropped = new Set<object>();
  const fringeShare = new Map<object, number>();
  const fringeKept = new Map<object, Region>();
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
      if (why === 'lowHeadroom' || (why === 'headroomUnclear' && !covered(centroid(panel.polygon), z))) {
        const { share, kept } = deck!.uncarried(panel.polygon, z, held);
        if (share <= 0) { dropped.add(panel); continue; }
        fringeShare.set(panel, share);
        fringeKept.set(panel, kept);
        held.kept.push({ region: kept, z });
        continue;
      }
      held.panels.push({ poly: panel.polygon, z });
    }
    const flat = (beamsAt.get(z) ?? []).filter((b) => opts.mode === 'width' || (!panelLoadedAt.get(z)?.has(b.id) && !inShell(midpoint(b))));
    for (const e of flat) {
      const [a, b] = segment(e.id);
      const why = deckless([[a[0], a[1]], [b[0], b[1]]], z);
      const beside = (panelsAt.get(z) ?? []).filter((poly) => onBoundary(model, e, poly)).map((poly) => deckless(poly, z));
      const floorBeside = beside.some((w) => w === null || w === 'headroomUnclear');
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (why === 'headroomUnclear' || (why === 'lowHeadroom' && floorBeside)) {
        if (covered(mid, z)) unclear++; else unclearRoof++;
      }
      if (!floorBeside && (why === 'lowHeadroom' || (why === 'headroomUnclear' && !covered(mid, z)))) {
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
        held.kept.push({ region: kept, z });
        if (why === 'lowHeadroom') fringes++;
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
      const share = fringeShare.get(panel) ?? (cover > 0.02 ? 1 - cover : 1);
      if (!fringeShare.has(panel) && share < 1) partly++;
      // The panel's own part of the level's result. Loading its members again on their own found
      // an opening's ring as a panel too, and the ring, loaded on its own as well, counted twice.
      const one = panel.own;
      const c = centroid(panel.polygon);
      const roof = why === 'lowHeadroom' || !covered(c, z);
      const index = panelBeams.length;
      panelBeams.push(new Set(one.perBeam.keys()));
      panelLevel.push(levelOrder.indexOf(z));
      out.panels.push({ polygon: panel.polygon, z, roof });
      const region = fringeKept.get(panel);
      if (region) {
        let kept = 0;
        const moved = regionToBeams(model, region, [...one.perBeam.keys()]);
        for (const pc of moved.pieces) {
          out.pieces.push({ ...pc, roof, panel: index });
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
  for (const m of out.widthMembers) {
    const spans = fringeRoof.get(m.elementId);
    if (spans) m.spans = spans;
  }
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

/** Why a panel of beams is not a floor or a roof deck, if it is not. */
function notADeck(
  model: GravityModel,
  carriers: Array<{ z0: number; poly: Array<[number, number]>; pts: Array<[number, number, number]>; nodes?: number[] }>,
  coverAbove: (pt: [number, number], zTop: number) => number,
  tributaryWidth: number,
  shellsLoaded: boolean,
): {
  why: (poly: Array<[number, number]>, z: number) => 'lowHeadroom' | 'wide' | 'headroomUnclear' | null;
  uncarried: (area: Array<[number, number]>, z: number, held: Held) => { share: number; kept: Region };
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
   * The part of `area` that no load already kept less than a storey above carries, and its share
   * of `area`: what is left once the loaded panels, the tributary strips of members kept by width
   * (over the stretch of each that is low), the shells loaded by panels (all of whose corners are
   * low) and what panels and members within the roof's structure kept for themselves are taken
   * away. Geometry that cannot be resolved keeps all of `area`.
   */
  const uncarried = (area: Array<[number, number]>, z: number, held: Held): { share: number; kept: Region } => {
    const low = (dz: number) => dz > TOL && dz < MIN_STOREY_HEADROOM;
    const whole: Region = [[closeRing(area)]];
    const total = regionArea(whole);
    if (!(total > 1e-12)) return { share: 1, kept: whole };
    const cover: Region[] = [];
    for (const p of held.panels) if (low(p.z - z)) cover.push([[closeRing(p.poly)]]);
    for (const k of held.kept) if (low(k.z - z)) cover.push(k.region);
    if (shellsLoaded) for (const c of carriers) if (c.pts.every((p) => low(p[2] - z))) cover.push([[closeRing(c.poly)]]);
    for (const [a, b] of held.members) {
      const range = lowRange(a[2] - z, b[2] - z, TOL, MIN_STOREY_HEADROOM);
      if (!range || Math.hypot(b[0] - a[0], b[1] - a[1]) * (range[1] - range[0]) <= 1e-9) continue;
      const at = (t: number): [number, number] => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      cover.push([[closeRing(tributaryStrip(at(range[0]), at(range[1]), tributaryWidth))]]);
    }
    try {
      const kept = cover.length > 0 ? (polygonClipping.difference(whole as never, ...(cover as never[])) as unknown as Region) : whole;
      return { share: Math.min(1, Math.max(0, regionArea(kept) / total)), kept };
    } catch {
      return { share: 1, kept: whole };
    }
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
    if (narrowestWidth(poly) > MAX_DECK_SPAN) return 'wide';
    return low ? 'headroomUnclear' : null;
  };
  return { why, uncarried };
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

type Region = Array<Array<Array<[number, number]>>>;

/** What the loads already kept carry: whole panels, members' strips, and what fringe panels and members kept. */
type Held = { panels: Array<{ poly: Array<[number, number]>; z: number }>; members: Segment[]; kept: Array<{ region: Region; z: number }> };

type Axis = { p: [number, number]; u: [number, number]; L: number };

function signedArea(ring: Array<[number, number]>): number {
  let s = 0;
  ring.forEach((a, k) => { const b = ring[(k + 1) % ring.length]!; s += a[0] * b[1] - b[0] * a[1]; });
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
  for (const { area, c } of regionPieces(region, 20)) {
    const near = beams.reduce((best, bm) => (distance(bm, c) < distance(best, c) - 1e-9 ? bm : best));
    const s0 = along(near, c);
    const foot: [number, number] = [near.p[0] + s0 * near.u[0], near.p[1] + s0 * near.u[1]];
    const d = Math.hypot(c[0] - foot[0], c[1] - foot[1]);
    if (d <= 1e-9) { put(near, s0, area); continue; }
    const directions: Array<[number, number]> = [[(c[0] - foot[0]) / d, (c[1] - foot[1]) / d]];
    for (let k = 0; k < 90; k++) directions.push([Math.cos((k * Math.PI) / 90), Math.sin((k * Math.PI) / 90)]);
    let pair: [Hit, Hit] | null = null;
    for (const v of directions) if ((pair = across(c, v))) break;
    if (!pair) { put(near, s0, area); continue; }
    const [back, ahead] = pair;
    put(back.bm, back.s, (area * ahead.t) / (ahead.t - back.t));
    put(ahead.bm, ahead.s, (area * -back.t) / (ahead.t - back.t));
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
  let a = 0, x = 0, y = 0;
  poly.forEach((p, k) => {
    const q = poly[(k + 1) % poly.length]!;
    const cross = p[0] * q[1] - q[0] * p[1];
    a += cross; x += (p[0] + q[0]) * cross; y += (p[1] + q[1]) * cross;
  });
  return Math.abs(a) > 1e-15 ? [x / (3 * a), y / (3 * a)] : centroid(poly);
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
