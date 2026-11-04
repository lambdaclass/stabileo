/**
 * The designed building as an IFC4 file, written as STEP text: project, site, building and
 * storeys; columns, beams and braces as extruded profiles; slabs as their outline extruded through
 * their thickness and walls as their footprint extruded up their height (the two forms every
 * reader expects, and the ones `ifc-parser.ts` reads back); footings; the detailed bars as swept
 * disks along their real centre lines, grouped by assembly; the plates, bolts and anchors of the
 * steel joints; materials and a property set with the design state of each element.
 *
 * Pure: the input is plain data in metres (`store/ifc-export.ts` reads it from the project) and
 * the output a string. Identifiers are deterministic, so exporting the same project twice gives
 * the same file.
 */
export type V3 = [number, number, number];

export type ProfileSpec =
  | { kind: 'rect'; b: number; h: number }
  | { kind: 'circle'; r: number }
  | { kind: 'I'; b: number; h: number; tw: number; tf: number }
  | { kind: 'hollowRect'; b: number; h: number; t: number }
  | { kind: 'hollowCircle'; r: number; t: number }
  | { kind: 'L'; b: number; h: number; t: number };

export type PropValue = string | number;

/**
 * Concrete as a plan polygon swept up from `z0` by `depth`, world X and Y, m: a joint's part, or a
 * slab net of the frame. The outer ring counter-clockwise, holes clockwise, no repeated point.
 */
export interface IfcPrismItem { z0: number; depth: number; outer: Array<[number, number]>; holes?: Array<Array<[number, number]>> }

export interface IfcExportInput {
  project: { name: string; site?: string; time: string; app: string };
  /** Properties of the building as designed (the project's design verdict), on the IfcBuilding. */
  buildingProps?: Record<string, PropValue>;
  storeys: Array<{ name: string; z: number }>;
  /**
   * `a` to `b` is the member's axis, its placement and its profile's sweep. With `segments` the
   * body is those pieces of the axis instead (a span cut at the joints along it), each swept with
   * the profile; `prisms` are the joints the member owns, added to its body.
   */
  members: Array<{ id: string; kind: 'column' | 'beam' | 'member'; name: string; a: V3; b: V3; profile: ProfileSpec; profileName?: string; rollDeg?: number; material?: string; props?: Record<string, PropValue>; segments?: Array<{ a: V3; b: V3 }>; prisms?: IfcPrismItem[] }>;
  /** With `prisms`, the body is those (the slab net of the frame); without, the outline swept up its thickness. */
  slabs: Array<{ id: string; name: string; outline: V3[]; thickness: number; material?: string; props?: Record<string, PropValue>; prisms?: IfcPrismItem[] }>;
  walls: Array<{ id: string; name: string; a: V3; b: V3; height: number; thickness: number; material?: string; props?: Record<string, PropValue> }>;
  footings: Array<{ id: string; name: string; centre: V3; B: number; L: number; thickness: number; rotDeg: number; material?: string; props?: Record<string, PropValue> }>;
  bars: Array<{ id: string; mark: string; diameter: number; points: V3[]; role: 'main' | 'ligature'; assembly: string; length: number }>;
  parts: Array<{ id: string; kind: 'plate' | 'stiffener' | 'bolt' | 'anchor' | 'weld'; joint: string; center: V3; u: V3; v: V3; size: [number, number, number]; material?: string }>;
}

// ─── STEP primitives ───

/** A REAL as STEP writes it: always with a decimal point, exponent as `E`. */
export function real(v: number): string {
  if (!Number.isFinite(v)) return '0.';
  const r = Math.round(v * 1e9) / 1e9;
  if (r === 0) return '0.';
  const s = String(r);
  if (/e/i.test(s)) { const [m, e] = r.toExponential(9).split('e'); return `${m!.replace(/0+$/, '').replace(/\.$/, '.')}E${e}`; }
  return s.includes('.') ? s : `${s}.`;
}

/** A STRING: apostrophes and backslashes escaped, anything outside ASCII as \X2\ UTF-16. */
export function str(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "'") out += "''";
    else if (ch === '\\') out += '\\\\';
    else if (c >= 32 && c < 127) out += ch;
    else {
      const units = c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c];
      out += `\\X2\\${units.map((u) => u.toString(16).toUpperCase().padStart(4, '0')).join('')}\\X0\\`;
    }
  }
  return `'${out}'`;
}

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** A GlobalId: 128 bits from the seed, in IFC's 22-character base 64. Deterministic. */
export function guid(seed: string): string {
  let h1 = 0xcbf29ce484222325n, h2 = 0x84222325cbf29ce4n;
  const P = 0x100000001b3n, M = (1n << 64n) - 1n;
  for (const ch of seed) {
    const c = BigInt(ch.codePointAt(0)!);
    h1 = ((h1 ^ c) * P) & M;
    h2 = ((h2 ^ (c + 0x9en)) * P) & M;
  }
  let n = (h1 << 64n) | h2;
  const out: string[] = [];
  for (let i = 0; i < 21; i++) { out.push(B64[Number(n & 63n)]!); n >>= 6n; }
  out.push(B64[Number(n & 3n)]!);
  return out.reverse().join('');
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

class Step {
  lines: string[] = [];
  private n = 0;
  add(e: string): string { this.n++; this.lines.push(`#${this.n}=${e};`); return `#${this.n}`; }
}

/** The profile's local X for a member along `axis`: horizontal for beams, global X for columns, turned by the roll. */
export function memberRefDirection(axis: V3, rollDeg = 0): V3 {
  const z = unit(axis);
  let x: V3 = Math.abs(z[2]) > 0.999 ? [1, 0, 0] : unit(cross([0, 0, 1], z));
  if (rollDeg) {
    const t = (rollDeg * Math.PI) / 180, y = cross(z, x);
    x = unit([x[0] * Math.cos(t) + y[0] * Math.sin(t), x[1] * Math.cos(t) + y[1] * Math.sin(t), x[2] * Math.cos(t) + y[2] * Math.sin(t)]);
  }
  return x;
}

export function writeIfc(i: IfcExportInput): string {
  const s = new Step();
  const pt = (p: V3) => s.add(`IFCCARTESIANPOINT((${real(p[0])},${real(p[1])},${real(p[2])}))`);
  const pt2 = (x: number, y: number) => s.add(`IFCCARTESIANPOINT((${real(x)},${real(y)}))`);
  const dir = (d: V3) => s.add(`IFCDIRECTION((${real(d[0])},${real(d[1])},${real(d[2])}))`);
  const ax3 = (p: V3, z?: V3, x?: V3) => s.add(`IFCAXIS2PLACEMENT3D(${pt(p)},${z ? dir(z) : '$'},${x ? dir(x) : '$'})`);
  const ORIGIN = ax3([0, 0, 0]);
  const Z = dir([0, 0, 1]);
  const pos2 = s.add(`IFCAXIS2PLACEMENT2D(${pt2(0, 0)},$)`);

  // Units, context, project.
  const units = [
    s.add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'), s.add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    s.add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), s.add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ];
  const ua = s.add(`IFCUNITASSIGNMENT((${units.join(',')}))`);
  const ctx = s.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ORIGIN},$)`);
  const body = s.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const project = s.add(`IFCPROJECT(${str(guid(`project:${i.project.name}`))},$,${str(i.project.name)},$,$,$,$,(${ctx}),${ua})`);
  const sitePl = s.add(`IFCLOCALPLACEMENT($,${ORIGIN})`);
  const site = s.add(`IFCSITE(${str(guid('site'))},$,${str(i.project.site ?? 'Site')},$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = s.add(`IFCLOCALPLACEMENT(${sitePl},${ORIGIN})`);
  const building = s.add(`IFCBUILDING(${str(guid('building'))},$,${str(i.project.name)},$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
  s.add(`IFCRELAGGREGATES(${str(guid('agg:project'))},$,$,$,${project},(${site}))`);
  s.add(`IFCRELAGGREGATES(${str(guid('agg:site'))},$,$,$,${site},(${building}))`);
  const storeys = [...i.storeys].sort((a, b) => a.z - b.z);
  if (storeys.length === 0) storeys.push({ name: 'Level 0', z: 0 });
  const storeyIds = storeys.map((st) => {
    const pl = s.add(`IFCLOCALPLACEMENT(${bldPl},${ax3([0, 0, st.z])})`);
    return s.add(`IFCBUILDINGSTOREY(${str(guid(`storey:${st.name}:${st.z}`))},$,${str(st.name)},$,$,${pl},$,$,.ELEMENT.,${real(st.z)})`);
  });
  s.add(`IFCRELAGGREGATES(${str(guid('agg:building'))},$,$,$,${building},(${storeyIds.join(',')}))`);
  /** The storey an element sits on: the highest at or below its lowest point. */
  const storeyOf = (z: number) => { let k = 0; storeys.forEach((st, j) => { if (st.z <= z + 0.05) k = j; }); return k; };
  const contained: string[][] = storeys.map(() => []);
  const byMaterial = new Map<string, string[]>();
  const withMaterial = (el: string, m?: string) => { if (m) byMaterial.set(m, [...(byMaterial.get(m) ?? []), el]); };
  const psets: Array<[string, Record<string, PropValue>, string]> = [];
  if (i.buildingProps && Object.keys(i.buildingProps).length) psets.push([building, i.buildingProps, 'building']);
  // Every element is placed relative to the building, in world coordinates.
  const place = (p: V3, z?: V3, x?: V3) => s.add(`IFCLOCALPLACEMENT(${bldPl},${ax3(p, z, x)})`);
  const shape = (items: string[], type = 'SweptSolid') => {
    const rep = s.add(`IFCSHAPEREPRESENTATION(${body},'Body',${str(type)},(${items.join(',')}))`);
    return s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
  };
  const extrude = (profile: string, depth: number, position = ORIGIN) => s.add(`IFCEXTRUDEDAREASOLID(${profile},${position},${Z},${real(depth)})`);

  const profileOf = (p: ProfileSpec, name?: string): string => {
    const nm = name ? str(name) : '$';
    switch (p.kind) {
      case 'rect': return s.add(`IFCRECTANGLEPROFILEDEF(.AREA.,${nm},${pos2},${real(p.b)},${real(p.h)})`);
      case 'circle': return s.add(`IFCCIRCLEPROFILEDEF(.AREA.,${nm},${pos2},${real(p.r)})`);
      case 'I': return s.add(`IFCISHAPEPROFILEDEF(.AREA.,${nm},${pos2},${real(p.b)},${real(p.h)},${real(p.tw)},${real(p.tf)},$,$,$)`);
      case 'hollowRect': return s.add(`IFCRECTANGLEHOLLOWPROFILEDEF(.AREA.,${nm},${pos2},${real(p.b)},${real(p.h)},${real(p.t)},$,$)`);
      case 'hollowCircle': return s.add(`IFCCIRCLEHOLLOWPROFILEDEF(.AREA.,${nm},${pos2},${real(p.r)},${real(p.t)})`);
      case 'L': return s.add(`IFCLSHAPEPROFILEDEF(.AREA.,${nm},${pos2},${real(p.h)},${real(p.b)},${real(p.t)},$,$,$)`);
    }
  };

  /**
   * A world plan polygon swept up world Z, inside a placement whose origin is `o` and axes `X, Y, Z`:
   * the item's own position states world X and Z in the placement's axes, at the height `z0`.
   */
  const prismIn = (q: IfcPrismItem, o: V3, X: V3, Y: V3, Zl: V3) => {
    const local = (v: V3): V3 => [dot(v, X), dot(v, Y), dot(v, Zl)];
    const ring = (r: Array<[number, number]>) => s.add(`IFCPOLYLINE((${[...r, r[0]!].map(([x, y]) => pt2(x, y)).join(',')}))`);
    const prof = q.holes?.length
      ? s.add(`IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,${ring(q.outer)},(${q.holes.map(ring).join(',')}))`)
      : s.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${ring(q.outer)})`);
    return extrude(prof, q.depth, ax3(local(sub([0, 0, q.z0], o)), local([0, 0, 1]), local([1, 0, 0])));
  };

  // ── Members
  for (const m of i.members) {
    const axis = sub(m.b, m.a), L = len(axis);
    if (L < 1e-6 && !m.segments?.length && !m.prisms?.length) continue;
    const z = L < 1e-6 ? [0, 0, 1] as V3 : unit(axis), x = memberRefDirection(z, m.rollDeg), y = cross(z, x);
    const local = (v: V3): V3 => [dot(v, x), dot(v, y), dot(v, z)];
    const items = m.segments
      ? m.segments.filter((g) => len(sub(g.b, g.a)) > 1e-6).map((g) => {
        const gz = unit(sub(g.b, g.a)), gx = memberRefDirection(gz, m.rollDeg);
        return extrude(profileOf(m.profile, m.profileName), len(sub(g.b, g.a)), ax3(local(sub(g.a, m.a)), local(gz), local(gx)));
      })
      : [extrude(profileOf(m.profile, m.profileName), L)];
    for (const q of m.prisms ?? []) items.push(prismIn(q, m.a, x, y, z));
    if (items.length === 0) continue;
    const solid = items.join(',');
    const cls = m.kind === 'column' ? 'IFCCOLUMN' : m.kind === 'beam' ? 'IFCBEAM' : 'IFCMEMBER';
    const pre = m.kind === 'column' ? '.COLUMN.' : m.kind === 'beam' ? '.BEAM.' : '.BRACE.';
    const el = s.add(`${cls}(${str(guid(`m:${m.id}`))},$,${str(m.name)},$,$,${place(m.a, z, x)},${shape([solid])},${str(m.id)},${pre})`);
    contained[storeyOf(Math.min(m.a[2], m.b[2]))]!.push(el); withMaterial(el, m.material);
    if (m.props) psets.push([el, m.props, m.id]);
  }

  // ── Slabs: the outline at the underside, extruded up through the thickness.
  for (const sl of i.slabs) {
    if (sl.outline.length < 3) continue;
    const zMid = sl.outline.reduce((a, p) => a + p[2], 0) / sl.outline.length, z0 = zMid - sl.thickness / 2;
    let items: string[];
    if (sl.prisms?.length) items = sl.prisms.map((q) => prismIn(q, [0, 0, z0], [1, 0, 0], [0, 1, 0], [0, 0, 1]));
    else {
      const ring = sl.outline.map((p) => pt2(p[0], p[1]));
      const poly = s.add(`IFCPOLYLINE((${[...ring, ring[0]].join(',')}))`);
      items = [extrude(s.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly})`), sl.thickness)];
    }
    const el = s.add(`IFCSLAB(${str(guid(`s:${sl.id}`))},$,${str(sl.name)},$,$,${place([0, 0, z0])},${shape(items)},${str(sl.id)},.FLOOR.)`);
    contained[storeyOf(z0)]!.push(el); withMaterial(el, sl.material);
    if (sl.props) psets.push([el, sl.props, sl.id]);
  }

  // ── Walls: the footprint, centred on the wall's line, extruded up its height.
  for (const w of i.walls) {
    const d = sub(w.b, w.a), Lw = Math.hypot(d[0], d[1]);
    if (Lw < 1e-6 || w.height <= 0) continue;
    const x: V3 = [d[0] / Lw, d[1] / Lw, 0];
    const prof = s.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${s.add(`IFCAXIS2PLACEMENT2D(${pt2(Lw / 2, 0)},$)`)},${real(Lw)},${real(w.thickness)})`);
    const el = s.add(`IFCWALL(${str(guid(`w:${w.id}`))},$,${str(w.name)},$,$,${place(w.a, [0, 0, 1], x)},${shape([extrude(prof, w.height)])},${str(w.id)},.SOLIDWALL.)`);
    contained[storeyOf(w.a[2])]!.push(el); withMaterial(el, w.material);
    if (w.props) psets.push([el, w.props, w.id]);
  }

  // ── Footings, from their underside.
  for (const f of i.footings) {
    const t = (f.rotDeg * Math.PI) / 180;
    const prof = s.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos2},${real(f.B)},${real(f.L)})`);
    const el = s.add(`IFCFOOTING(${str(guid(`f:${f.id}`))},$,${str(f.name)},$,$,${place(f.centre, [0, 0, 1], [Math.cos(t), Math.sin(t), 0])},${shape([extrude(prof, f.thickness)])},${str(f.id)},.PAD_FOOTING.)`);
    contained[storeyOf(f.centre[2] + f.thickness)]!.push(el); withMaterial(el, f.material);
    if (f.props) psets.push([el, f.props, f.id]);
  }

  // ── Bars: swept disks along their centre lines, one assembly per detailing assembly.
  const assemblies = new Map<string, string[]>(), assemblyZ = new Map<string, number>();
  for (const b of i.bars) {
    const pts = b.points.filter((p, k) => k === 0 || len(sub(p, b.points[k - 1]!)) > 1e-5);
    if (pts.length < 2) continue;
    const curve = s.add(`IFCPOLYLINE((${pts.map(pt).join(',')}))`);
    const disk = s.add(`IFCSWEPTDISKSOLID(${curve},${real(b.diameter / 2)},$,$,$)`);
    const area = Math.PI * (b.diameter / 2) ** 2;
    const el = s.add(`IFCREINFORCINGBAR(${str(guid(`b:${b.id}`))},$,${str(b.mark)},$,$,${place([0, 0, 0])},${shape([disk], 'AdvancedSweptSolid')},${str(b.mark)},$,${real(b.diameter)},${real(area)},${real(b.length)},${b.role === 'main' ? '.MAIN.' : '.LIGATURE.'},.TEXTURED.)`);
    assemblies.set(b.assembly, [...(assemblies.get(b.assembly) ?? []), el]);
    assemblyZ.set(b.assembly, Math.min(assemblyZ.get(b.assembly) ?? Infinity, ...pts.map((p) => p[2])));
    withMaterial(el, 'Reinforcing steel');
  }
  for (const [name, els] of assemblies) {
    const asm = s.add(`IFCELEMENTASSEMBLY(${str(guid(`a:${name}`))},$,${str(name)},$,$,${place([0, 0, 0])},$,$,.FACTORY.,.REINFORCEMENT_UNIT.)`);
    s.add(`IFCRELAGGREGATES(${str(guid(`agg:a:${name}`))},$,$,$,${asm},(${els.join(',')}))`);
    contained[storeyOf(assemblyZ.get(name) ?? 0)]!.push(asm);
  }

  // ── Connection parts: boxes for plates and welds, cylinders for bolts and anchors.
  for (const p of i.parts) {
    const n = unit(cross(p.u, p.v)), [su, sv, sn] = p.size;
    let el: string;
    if (p.kind === 'bolt' || p.kind === 'anchor') {
      // A fastener's shank runs along its longest side.
      const long = sn >= su && sn >= sv ? n : su >= sv ? unit(p.u) : unit(p.v), L = Math.max(su, sv, sn), d = Math.min(...[su, sv, sn].filter((x) => x > 0));
      const start: V3 = [p.center[0] - long[0] * L / 2, p.center[1] - long[1] * L / 2, p.center[2] - long[2] * L / 2];
      const x = Math.abs(dot(long, [0, 0, 1])) > 0.99 ? [1, 0, 0] as V3 : unit(cross([0, 0, 1], long));
      const prof = s.add(`IFCCIRCLEPROFILEDEF(.AREA.,$,${pos2},${real(d / 2)})`);
      el = s.add(`IFCMECHANICALFASTENER(${str(guid(`p:${p.id}`))},$,${str(`${p.joint} ${p.kind}`)},$,$,${place(start, long, x)},${shape([extrude(prof, L)])},$,${real(d)},${real(L)},${p.kind === 'bolt' ? '.BOLT.' : '.ANCHORBOLT.'})`);
    } else {
      const start: V3 = [p.center[0] - n[0] * sn / 2, p.center[1] - n[1] * sn / 2, p.center[2] - n[2] * sn / 2];
      const prof = s.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos2},${real(su)},${real(sv)})`);
      el = s.add(`IFCPLATE(${str(guid(`p:${p.id}`))},$,${str(`${p.joint} ${p.kind}`)},$,$,${place(start, n, unit(p.u))},${shape([extrude(prof, sn)])},$,.SHEET.)`);
    }
    contained[storeyOf(p.center[2])]!.push(el); withMaterial(el, p.material);
  }

  // ── Containment, materials, design properties.
  contained.forEach((els, k) => { if (els.length) s.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${str(guid(`c:${k}`))},$,$,$,(${els.join(',')}),${storeyIds[k]})`); });
  for (const [name, els] of byMaterial) {
    const mat = s.add(`IFCMATERIAL(${str(name)},$,$)`);
    s.add(`IFCRELASSOCIATESMATERIAL(${str(guid(`mat:${name}`))},$,$,$,(${els.join(',')}),${mat})`);
  }
  for (const [el, props, id] of psets) {
    const ps = Object.entries(props).map(([k, v]) => s.add(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${typeof v === 'number' ? `IFCREAL(${real(v)})` : `IFCLABEL(${str(v)})`},$)`));
    if (!ps.length) continue;
    const set = s.add(`IFCPROPERTYSET(${str(guid(`ps:${id}`))},$,'Stabileo_Design',$,(${ps.join(',')}))`);
    s.add(`IFCRELDEFINESBYPROPERTIES(${str(guid(`rp:${id}`))},$,$,$,(${el}),${set})`);
  }

  return [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(`${i.project.name}.ifc`)},${str(i.project.time)},(''),(''),${str(i.project.app)},${str(i.project.app)},'');`,
    "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;', ...s.lines, 'ENDSEC;', 'END-ISO-10303-21;', '',
  ].join('\n');
}
