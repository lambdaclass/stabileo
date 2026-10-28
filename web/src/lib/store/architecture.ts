/**
 * The architecture of the project as the structure reads it.
 *
 *  · Constructions, walls and rooms live in the design data (`engine/architecture/`).
 *  · They are drawn as background drawings per level (ids `arch-…`): each wall as its two faces,
 *    each room as its outline. A point cloud is read as its slice at a cut height over a level
 *    (ids `cloud-…`), to trace walls over.
 *  · Walls load the structure: each wall's weight per metre (its construction's weight times its
 *    height) goes onto the beams it runs along, and as an equivalent area load onto the shells it
 *    crosses elsewhere, on the first dead case. Rooms load it with their use's live load (the
 *    CIRSOC 101 values the CAD import already maps) on the shells inside them, on the first live
 *    case. Applying again replaces what was applied before; one undo step each.
 *  · Walls can be read from an IFC file's walls; the geometry is checked level by level; the
 *    architecture memoria lists rooms, constructions with their checks and walls.
 */
import { modelStore } from './model.svelte';
import { designData, patchOwnDesignData } from './design-data';
import { downloadText } from './file';
import { gridFromModel, sortedLevels } from '../model/grid';
import { ROOM_CATEGORY_LOADS } from '../cad/rooms';
import {
  checkGeometry, cloudSlice, constructionProps, constructionRows, pointInPolygon, polygonArea, polygonPerimeter, wallFromOutline, wallLength,
  type ArchWall, type Construction, type GeometryIssue, type Room,
} from '../engine/architecture/architecture';
import type { Load } from './model.svelte';
import type { Underlay } from '../model/underlay';

export type { ArchWall, Construction, Room, GeometryIssue };

type Data = NonNullable<ReturnType<typeof designData>['architecture']>;
export const architecture = (): Data => designData().architecture ?? { constructions: [], walls: [], rooms: [] };
const patch = (p: Partial<Data>) => { patchOwnDesignData({ architecture: { ...architecture(), ...p } }); syncArchUnderlays(); };

export function levels(): Array<{ id: string; name: string; z: number }> {
  const m = modelStore.model;
  const g = m.grid ?? gridFromModel(m.nodes.values(), m.elements.values());
  return sortedLevels(g).map((l) => ({ id: l.id, name: l.name, z: l.z }));
}

export function saveConstruction(c: Construction): void { patch({ constructions: [...architecture().constructions.filter((x) => x.id !== c.id), c] }); }
export function removeConstruction(id: string): void { patch({ constructions: architecture().constructions.filter((x) => x.id !== id) }); }
export function saveWall(w: ArchWall): void { patch({ walls: [...architecture().walls.filter((x) => x.id !== w.id), w] }); }
export function removeWall(id: string): void { patch({ walls: architecture().walls.filter((x) => x.id !== id) }); }
export function saveRoom(r: Room): void { patch({ rooms: [...architecture().rooms.filter((x) => x.id !== r.id), r] }); }
export function removeRoom(id: string): void { patch({ rooms: architecture().rooms.filter((x) => x.id !== id) }); }

const thicknessOf = (constructionId: string) => { const c = architecture().constructions.find((x) => x.id === constructionId); return c ? constructionProps(c).thickness : 0.15; };

/** Walls (both faces) and rooms (outline) as one background drawing per level. */
export function syncArchUnderlays(): void {
  const a = architecture();
  const own = modelStore.underlays.filter((u) => !u.id.startsWith('arch-'));
  const out: Underlay[] = [];
  for (const lv of levels()) {
    const seg: number[] = [];
    for (const w of a.walls.filter((x) => x.levelId === lv.id)) {
      const L = wallLength(w); if (L < 1e-6) continue;
      const t = thicknessOf(w.constructionId) / 2, nx = -(w.b.y - w.a.y) / L * t, ny = (w.b.x - w.a.x) / L * t;
      seg.push(w.a.x + nx, w.a.y + ny, w.b.x + nx, w.b.y + ny, w.a.x - nx, w.a.y - ny, w.b.x - nx, w.b.y - ny);
    }
    for (const r of a.rooms.filter((x) => x.levelId === lv.id)) for (let i = 0; i < r.outline.length; i++) { const p = r.outline[i]!, q = r.outline[(i + 1) % r.outline.length]!; seg.push(p.x, p.y, q.x, q.y); }
    if (seg.length) out.push({ id: `arch-${lv.id}`, name: `Arq · ${lv.name}`, levelId: lv.id, z: lv.z, segments: seg, dx: 0, dy: 0, rotationDeg: 0, visible: true });
  }
  modelStore.setUnderlays([...own, ...out]);
}

/** A point cloud's slice at `cutHeight` over a level, as a background drawing. */
export function importCloud(text: string, levelId: string, cutHeight: number, name: string): { read: number; kept: number } {
  const lv = levels().find((l) => l.id === levelId);
  if (!lv) return { read: 0, kept: 0 };
  const s = cloudSlice(text, lv.z + cutHeight);
  const id = `cloud-${Date.now().toString(36)}`;
  modelStore.setUnderlays([...modelStore.underlays, { id, name, levelId, z: lv.z, segments: s.segments, dx: 0, dy: 0, rotationDeg: 0, visible: true }]);
  return { read: s.read, kept: s.kept };
}

/** Walls read from an IFC file's walls, on the level each starts at, with a construction of its thickness to complete. */
export async function importIfcWalls(buffer: ArrayBuffer): Promise<number> {
  const { parseIfcFile } = await import('../ifc/parse');
  const p = await parseIfcFile(buffer);
  const lvs = levels(), a = architecture();
  const constructions = [...a.constructions], walls = [...a.walls];
  let n = 0;
  for (const s of p.surfaces.filter((x) => x.type === 'wall')) {
    const g = wallFromOutline(s.outline);
    if (!g) continue;
    const lv = lvs.reduce<(typeof lvs)[number] | null>((best, l) => (Math.abs(l.z - g.z) < (best ? Math.abs(best.z - g.z) : Infinity) ? l : best), null);
    if (!lv) continue;
    const t = Math.round(s.thickness * 1000) / 1000, cid = `ifc-${t}`;
    if (!constructions.some((c) => c.id === cid)) constructions.push({ id: cid, name: `IFC ${Math.round(t * 1000)} mm`, kind: 'wall', layers: [{ name: s.materialName ?? 'IFC', thickness: t, lambda: 0, density: 0 }], rsi: 0, rse: 0 });
    walls.push({ id: `w-${s.globalId ?? `${Date.now().toString(36)}${n}`}`, name: s.name, levelId: lv.id, z: lv.z, a: g.a, b: g.b, height: g.height, constructionId: cid });
    n++;
  }
  patch({ constructions, walls });
  return n;
}

// ─── Loads on the structure ───

type Quad = { id: number; nodes: number[] };
const plan = (q: Quad) => q.nodes.map((n) => modelStore.nodes.get(n)!).filter(Boolean).map((n) => ({ x: n.x, y: n.y ?? 0, z: n.z ?? 0 }));
const firstCase = (types: string[]) => modelStore.model.loadCases.find((c) => types.includes(c.type))?.id;

function replaceTagged(tag: string, add: () => void): void {
  modelStore.batch(() => {
    const kept = modelStore.loads.filter((l) => (l.data as { generatedBy?: string }).generatedBy !== tag);
    if (kept.length !== modelStore.loads.length) modelStore.replaceLoads(kept);
    const first = Math.max(0, ...modelStore.loads.map((l) => l.data.id)) + 1;
    add();
    modelStore.replaceLoads(modelStore.loads.map((l) => (l.data.id >= first ? ({ ...l, data: { ...l.data, generatedBy: tag } } as Load) : l)));
  });
}

/** Each wall's weight on the beams it runs along and, elsewhere, on the shells it crosses. How many loads. */
export function applyWallLoads(): number {
  const a = architecture(), dead = firstCase(['D', '']) ?? 1;
  let n = 0;
  replaceTagged('arch:walls', () => {
    const quads = [...modelStore.quads.values()] as Quad[];
    for (const w of a.walls) {
      const c = a.constructions.find((x) => x.id === w.constructionId);
      const q = c ? constructionProps(c).weight * w.height : 0;
      const L = wallLength(w);
      if (!(q > 0) || L < 1e-6) continue;
      // Beams at the wall's level that it runs along.
      const beams = [...modelStore.elements.values()].filter((e) => {
        const p = modelStore.nodes.get(e.nodeI), r = modelStore.nodes.get(e.nodeJ);
        if (!p || !r || Math.abs((p.z ?? 0) - w.z) > 0.05 || Math.abs((r.z ?? 0) - w.z) > 0.05) return false;
        const off = (x: { x: number; y: number }) => Math.abs((r.x - p.x) * ((p.y ?? 0) - x.y) - (p.x - x.x) * ((r.y ?? 0) - (p.y ?? 0))) / (Math.hypot(r.x - p.x, (r.y ?? 0) - (p.y ?? 0)) || 1);
        return off(w.a) < 0.05 && off(w.b) < 0.05;
      });
      const onBeam = new Map<number, [number, number]>();
      const perQuad = new Map<number, number>();
      const steps = Math.max(1, Math.ceil(L / 0.1));
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps, x = w.a.x + (w.b.x - w.a.x) * t, y = w.a.y + (w.b.y - w.a.y) * t, ds = L / steps;
        const beam = beams.find((e) => {
          const p = modelStore.nodes.get(e.nodeI)!, r = modelStore.nodes.get(e.nodeJ)!, l = Math.hypot(r.x - p.x, (r.y ?? 0) - (p.y ?? 0));
          const s = ((x - p.x) * (r.x - p.x) + (y - (p.y ?? 0)) * ((r.y ?? 0) - (p.y ?? 0))) / (l * l);
          return s >= 0 && s <= 1;
        });
        if (beam) {
          const p = modelStore.nodes.get(beam.nodeI)!, r = modelStore.nodes.get(beam.nodeJ)!, l = Math.hypot(r.x - p.x, (r.y ?? 0) - (p.y ?? 0));
          const s = Math.hypot(x - p.x, y - (p.y ?? 0)), [lo, hi] = onBeam.get(beam.id) ?? [l, 0];
          onBeam.set(beam.id, [Math.min(lo, s - ds / 2), Math.max(hi, s + ds / 2)]);
          continue;
        }
        const quad = quads.find((qd) => { const ps = plan(qd); return ps.every((pp) => Math.abs(pp.z - w.z) < 0.05) && pointInPolygon({ x, y }, ps); });
        if (quad) perQuad.set(quad.id, (perQuad.get(quad.id) ?? 0) + ds);
      }
      for (const [id, [lo, hi]] of onBeam) { modelStore.addDistributedLoad3D(id, 0, 0, -q, -q, Math.max(0, lo), hi, dead, { frame: 'global' }); n++; }
      for (const [id, len] of perQuad) {
        const A = polygonArea(plan(quads.find((x) => x.id === id)!));
        if (A > 0) { modelStore.addSurfaceLoad3D(id, (q * len) / A, dead); n++; }
      }
    }
  });
  return n;
}

/** Each room's live load on the shells inside it. How many loads. */
export function applyRoomLoads(): number {
  const live = firstCase(['L']);
  if (live === undefined) return 0;
  let n = 0;
  replaceTagged('arch:rooms', () => {
    for (const r of architecture().rooms) {
      const q = r.use ? ROOM_CATEGORY_LOADS[r.use] : undefined;
      if (!q) continue;
      for (const quad of modelStore.quads.values() as Iterable<Quad>) {
        const ps = plan(quad);
        if (!ps.length || ps.some((p) => Math.abs(p.z - r.z) > 0.05)) continue;
        const c = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
        if (pointInPolygon(c, r.outline)) { modelStore.addSurfaceLoad3D(quad.id, q, live); n++; }
      }
    }
  });
  return n;
}

export function geometryIssues(): GeometryIssue[] {
  const a = architecture();
  return levels().flatMap((l) => checkGeometry(a.walls.filter((w) => w.levelId === l.id), a.rooms.filter((r) => r.levelId === l.id)));
}

// ─── Memoria ───

type Tr = (key: string, params?: Record<string, string | number>) => string;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The architecture memoria as a standalone HTML page. */
export function architectureMemoria(tr: Tr, locale: string): string {
  const a = architecture(), lvName = new Map(levels().map((l) => [l.id, l.name]));
  const f = (v: number, d = 2) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const table = (head: string[], rows: string[][]) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const rooms = table([tr('arch.col.level'), tr('arch.col.room'), tr('arch.col.use'), tr('arch.col.area'), tr('arch.col.perimeter'), tr('arch.col.height'), tr('arch.col.volume')],
    a.rooms.map((r) => { const A = polygonArea(r.outline); return [esc(lvName.get(r.levelId) ?? r.levelId), esc(r.name), r.use ? esc(tr(`cad.assume.roomCat.${r.use}`)) : '—', f(A), f(polygonPerimeter(r.outline)), f(r.height), f(A * r.height)]; }));
  const cons = a.constructions.map((c) => {
    const p = constructionProps(c), rows = constructionRows(c);
    return `<h3>${esc(c.name)}</h3>${table([tr('arch.col.layer'), 'd (mm)', 'λ (W/mK)', 'ρ (kg/m³)'], c.layers.map((l) => [esc(l.name), f(l.thickness * 1000, 0), l.lambda ? f(l.lambda, 3) : '—', l.density ? f(l.density, 0) : '—']))}
      <p>U = ${Number.isFinite(p.u) ? f(p.u, 3) : '—'} W/m²K · m = ${f(p.mass, 1)} kg/m² · ${f(p.weight)} kN/m²</p>
      ${table([tr('arch.col.check'), tr('arch.col.demand'), tr('arch.col.limit'), tr('arch.col.state')], rows.map((r) => [esc(tr(r.titleKey ?? r.title)), r.demand !== undefined ? `${r.demand} ${r.unit ?? ''}` : '—', r.capacity !== undefined ? `${r.capacity} ${r.unit ?? ''}` : '—', esc(tr(`arch.state.${r.status}`))]))}`;
  }).join('');
  const walls = table([tr('arch.col.level'), tr('arch.col.wall'), tr('arch.col.length'), tr('arch.col.height'), tr('arch.col.construction'), tr('arch.col.weight')],
    a.walls.map((w) => { const c = a.constructions.find((x) => x.id === w.constructionId); return [esc(lvName.get(w.levelId) ?? w.levelId), esc(w.name), f(wallLength(w)), f(w.height), esc(c?.name ?? '—'), c ? f(constructionProps(c).weight * w.height) : '—']; }));
  const issues = geometryIssues();
  const geo = issues.length ? `<ul>${issues.map((i) => `<li>${esc(tr(`arch.issue.${i.kind}`))}: ${esc(i.ids.join(', '))} (${f(i.at.x)}; ${f(i.at.y)})</li>`).join('')}</ul>` : `<p>${esc(tr('arch.issue.none'))}</p>`;
  return `<!doctype html><html lang="${locale.slice(0, 2)}"><head><meta charset="utf-8"><title>${esc(tr('arch.memo.title'))}</title><style>body{font:13px system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #bbb;padding:3px 6px;text-align:left}h2{margin-top:24px}</style></head><body>
<h1>${esc(tr('arch.memo.title'))} — ${esc(modelStore.model.name || '')}</h1>
<h2>${esc(tr('arch.memo.rooms'))}</h2>${rooms}
<h2>${esc(tr('arch.memo.constructions'))}</h2>${cons || '<p>—</p>'}
<h2>${esc(tr('arch.memo.walls'))}</h2>${walls}
<h2>${esc(tr('arch.memo.geometry'))}</h2>${geo}
</body></html>`;
}
export function downloadArchitectureMemoria(tr: Tr, locale: string): void {
  downloadText(architectureMemoria(tr, locale), `${(modelStore.model.name || 'project').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'project'}-architecture.html`, 'text/html');
}
