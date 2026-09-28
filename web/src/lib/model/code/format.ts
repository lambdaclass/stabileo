/**
 * The model as text: one line per entity, readable and writable by hand, and lossless.
 *
 *   stabileo-model 1
 *   name "Portal"
 *   material 1 name="H-30" e=30000 nu=0.2 rho=24 fy=30
 *   node 1 0 0 0
 *   node 2 0 0 3
 *   member 1 frame 1 2 materialId=1 sectionId=1 rollAngle=30
 *   support 1 1 fixed3d
 *   case 1 D "Dead load"
 *   load distributed3d 1 elementId=1 qYI=0 qYJ=0 qZI=-10 qZJ=-10 caseId=1
 *   combination 1 "1.2D + 1.6L" 1*1.2 2*1.6
 *
 * ── How it stays both readable and exact ──────────────────────────
 *
 * Each line is a keyword, an id, the entity's essentials in a fixed position — a node's
 * coordinates, a member's type and ends — and then every other field as `name=value`, where
 * the value is a JSON literal: a number, a quoted string, true/false, a list or an object. The
 * common fields read as words; the rare ones, and any a later build adds, are carried exactly as
 * they are, so reading back what was written gives the same model field for field. Anything
 * after a `#` is a comment.
 *
 * What the code covers and leaves out is `coverage.ts`.
 *
 * Pure: no store.
 */

import type { ModelSnapshot } from '../../store/history.svelte';
import { COVERED_FIELDS, DERIVED_SUBFIELDS } from './coverage';

export const CODE_VERSION = 1;
const HEADER = 'stabileo-model';

export interface CodeError { line: number; message: string }

// ─── Writing ──────────────────────────────────────────────────────

// Numbers print as JavaScript's shortest exact form; −0 keeps its sign, which String() drops.
const lit = (v: unknown): string => (typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : JSON.stringify(v));
const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `name=value` for every field not in `skip`, in the object's own order. */
function rest(o: Record<string, unknown>, skip: readonly string[]): string {
  return Object.entries(o)
    .filter(([k, v]) => !skip.includes(k) && v !== undefined)
    .map(([k, v]) => ` ${k}=${lit(v)}`).join('');
}

const NO_RELEASE = JSON.stringify({ my: false, mz: false, t: false });
const isNoRelease = (r: unknown) => JSON.stringify(r) === NO_RELEASE;

export function modelToCode(snap: ModelSnapshot): string {
  const s = snap as unknown as Record<string, any>;
  const out: string[] = [`${HEADER} ${CODE_VERSION}`];
  const section = (title: string) => { out.push('', `# ${title}`); };
  if (s.name !== undefined) out.push(`name ${lit(s.name)}`);
  if (s.analysisMode !== undefined) out.push(`mode ${s.analysisMode}`);
  if (s.localAxisConvention !== undefined) out.push(`axes ${s.localAxisConvention}`);

  const entries = (k: string): Array<[number, any]> => (s[k] ?? []) as Array<[number, any]>;
  const derivedOf = (k: string) => DERIVED_SUBFIELDS[k] ?? [];

  if (entries('materials').length) {
    section('Materials');
    for (const [id, m] of entries('materials')) out.push(`material ${id}${rest(m, ['id'])}`);
  }
  if (entries('sections').length) {
    section('Sections');
    for (const [id, m] of entries('sections')) out.push(`section ${id}${rest(m, ['id'])}`);
  }
  if (entries('nodes').length) {
    section('Nodes: id x y z');
    for (const [id, n] of entries('nodes')) {
      out.push(`node ${id} ${lit(n.x)} ${lit(n.y)}${n.z !== undefined ? ` ${lit(n.z)}` : ''}${rest(n, ['id', 'x', 'y', 'z'])}`);
    }
  }
  if (entries('elements').length) {
    section('Members: id type nodeI nodeJ');
    for (const [id, e] of entries('elements')) {
      const skip = ['id', 'type', 'nodeI', 'nodeJ', ...derivedOf('elements'),
        ...(isNoRelease(e.releaseI) ? ['releaseI'] : []), ...(isNoRelease(e.releaseJ) ? ['releaseJ'] : [])];
      out.push(`member ${id} ${e.type} ${e.nodeI} ${e.nodeJ}${rest(e, skip)}`);
    }
  }
  if (entries('quads').length || entries('plates').length) {
    section('Shells: id [corners]');
    for (const [id, q] of entries('quads')) out.push(`quad ${id} ${lit(q.nodes)}${rest(q, ['id', 'nodes'])}`);
    for (const [id, p] of entries('plates')) out.push(`plate ${id} ${lit(p.nodes)}${rest(p, ['id', 'nodes'])}`);
  }
  if (entries('supports').length) {
    section('Supports: id node type');
    for (const [id, sp] of entries('supports')) out.push(`support ${id} ${sp.nodeId} ${sp.type}${rest(sp, ['id', 'nodeId', 'type'])}`);
  }
  if ((s.loadCases ?? []).length) {
    section('Load cases: id type name');
    for (const c of s.loadCases) out.push(`case ${c.id} ${c.type === '' || !ident.test(c.type) ? lit(c.type) : c.type} ${lit(c.name)}${rest(c, ['id', 'type', 'name'])}`);
  }
  if ((s.combinations ?? []).length) {
    section('Combinations: id name case*factor ...');
    for (const c of s.combinations) {
      const f = (c.factors as Array<{ caseId: number; factor: number }>).map((x) => ` ${x.caseId}*${lit(x.factor)}`).join('');
      out.push(`combination ${c.id} ${lit(c.name)}${f}${rest(c, ['id', 'name', 'factors'])}`);
    }
  }
  if ((s.loads ?? []).length) {
    section('Loads: type id fields');
    for (const l of s.loads) out.push(`load ${l.type} ${l.data.id}${rest(l.data, ['id'])}`);
  }
  if ((s.constraints ?? []).length) {
    section('Constraints');
    for (const c of s.constraints) out.push(`constraint ${lit(c)}`);
  }
  if (entries('connectors').length) {
    section('Connectors');
    for (const [id, c] of entries('connectors')) out.push(`connector ${id}${rest(c, ['id'])}`);
  }
  if (entries('groups').length) {
    section('Groups: id kind name');
    for (const [id, g] of entries('groups')) {
      const kind = ident.test(g.kind) ? g.kind : lit(g.kind);
      out.push(`group ${id} ${kind} ${lit(g.name)}${rest(g, ['id', 'kind', 'name'])}`);
    }
  }
  if (entries('footings').length) {
    section('Footings');
    for (const [id, f] of entries('footings')) out.push(`footing ${id}${rest(f, ['id'])}`);
  }
  const settings = ['massSource', 'geotechnical', 'footingMatPreferences', 'codeSettings', 'regulations'].filter((k) => s[k] !== undefined);
  if (settings.length) {
    section('Project settings');
    for (const k of settings) out.push(`${k} ${lit(s[k])}`);
  }
  return out.join('\n') + '\n';
}

// ─── Reading ──────────────────────────────────────────────────────

type Token = { text: string; key?: string; value?: string };

/** Split a line into tokens: words, quoted strings, balanced [..] / {..}, and name=value. */
function tokenize(line: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;
  const readValue = (): string | null => {
    const start = i;
    const c = line[i];
    if (c === '"') {
      i++;
      while (i < line.length && line[i] !== '"') { if (line[i] === '\\') i++; i++; }
      if (i >= line.length) return null;
      i++;
      return line.slice(start, i);
    }
    if (c === '[' || c === '{') {
      let depth = 0;
      while (i < line.length) {
        const ch = line[i];
        if (ch === '"') { i++; while (i < line.length && line[i] !== '"') { if (line[i] === '\\') i++; i++; } }
        else if (ch === '[' || ch === '{') depth++;
        else if (ch === ']' || ch === '}') { depth--; if (depth === 0) { i++; return line.slice(start, i); } }
        i++;
      }
      return null;
    }
    while (i < line.length && !/\s/.test(line[i]!)) i++;
    return line.slice(start, i);
  };
  while (i < line.length) {
    if (/\s/.test(line[i]!)) { i++; continue; }
    if (line[i] === '#') break;
    const eq = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.slice(i));
    if (eq) {
      i += eq[0].length;
      const v = readValue();
      if (v === null || v === '') return `the value of "${eq[1]}" is not closed`;
      out.push({ text: `${eq[1]}=${v}`, key: eq[1], value: v });
      continue;
    }
    const v = readValue();
    if (v === null) return 'a quoted string or a bracket is not closed';
    out.push({ text: v });
  }
  return out;
}

function parseLiteral(v: string): { ok: true; value: unknown } | { ok: false } {
  try { return { ok: true, value: JSON.parse(v) }; } catch { return { ok: false }; }
}

export interface ParseResult {
  /** The covered fields of a snapshot, plus id counters. Present only when there are no errors. */
  snapshot: Partial<ModelSnapshot> | null;
  errors: CodeError[];
}

/**
 * Read model code. Every problem is reported with its line; a text with any error yields no
 * model, so nothing half-read is ever applied.
 */
export function codeToModel(text: string): ParseResult {
  const errors: CodeError[] = [];
  const s: Record<string, any> = {
    materials: [], sections: [], nodes: [], elements: [], plates: [], quads: [], supports: [],
    loadCases: [], combinations: [], loads: [], constraints: [], connectors: [], groups: [], footings: [],
  };
  const lineOf = new Map<string, number>(); // "family:id" → line, for duplicates and references
  let sawHeader = false;

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const ln = idx + 1;
    const tokens = tokenize(raw);
    if (typeof tokens === 'string') { errors.push({ line: ln, message: tokens }); return; }
    if (tokens.length === 0) return;
    const [kw, ...args] = tokens;
    const err = (message: string) => errors.push({ line: ln, message });
    const pos = args.filter((t) => t.key === undefined).map((t) => t.text);
    const fields: Record<string, unknown> = {};
    for (const t of args) {
      if (t.key === undefined) continue;
      const p = parseLiteral(t.value!);
      if (!p.ok) { err(`"${t.key}" is not a valid value: ${t.value}`); return; }
      fields[t.key] = p.value;
    }
    const num = (t: string | undefined, what: string): number | null => {
      const v = t === undefined ? NaN : Number(t);
      if (!Number.isFinite(v)) { err(`${what} must be a number${t !== undefined ? `, not "${t}"` : ''}`); return null; }
      return v;
    };
    const idOf = (fam: string): number | null => {
      const id = num(pos[0], `the ${fam} id`);
      if (id === null) return null;
      if (!Number.isInteger(id) || id < 0) { err(`the ${fam} id must be a whole number`); return null; }
      const k = `${fam}:${id}`;
      if (lineOf.has(k)) { err(`${fam} ${id} is defined twice (first on line ${lineOf.get(k)})`); return null; }
      lineOf.set(k, ln);
      return id;
    };
    const word = (t: string | undefined, what: string): string | null => {
      if (t === undefined) { err(`${what} is missing`); return null; }
      if (t.startsWith('"')) { const p = parseLiteral(t); if (p.ok && typeof p.value === 'string') return p.value; err(`${what} is not a valid string`); return null; }
      return t;
    };
    const str = (t: string | undefined, what: string): string | null => {
      if (t === undefined || !t.startsWith('"')) { err(`${what} must be a quoted string`); return null; }
      const p = parseLiteral(t);
      return p.ok && typeof p.value === 'string' ? p.value : (err(`${what} is not a valid string`), null);
    };
    const json = (t: string | undefined, what: string): unknown => {
      const p = t === undefined ? { ok: false as const } : parseLiteral(t);
      if (!p.ok) { err(`${what} must be a JSON value`); return undefined; }
      return p.value;
    };

    switch (kw!.text) {
      case HEADER: {
        sawHeader = true;
        const v = num(pos[0], 'the format version');
        if (v !== null && v > CODE_VERSION) err(`this code is format ${v}; this version reads up to ${CODE_VERSION}`);
        return;
      }
      case 'name': { const v = str(pos[0], 'the name'); if (v !== null) s.name = v; return; }
      case 'mode': { if (pos[0]) s.analysisMode = pos[0]; else err('the mode is missing'); return; }
      case 'axes': { if (pos[0]) s.localAxisConvention = pos[0]; else err('the axis convention is missing'); return; }
      case 'material': case 'section': case 'connector': case 'footing': {
        const fam = kw!.text;
        const id = idOf(fam);
        if (id === null) return;
        const key = { material: 'materials', section: 'sections', connector: 'connectors', footing: 'footings' }[fam]!;
        s[key].push([id, { id, ...fields }]);
        return;
      }
      case 'node': {
        const id = idOf('node');
        const x = num(pos[1], 'x'), y = num(pos[2], 'y');
        const z = pos[3] !== undefined ? num(pos[3], 'z') : undefined;
        if (id === null || x === null || y === null || z === null) return;
        s.nodes.push([id, { id, x, y, ...(z !== undefined ? { z } : {}), ...fields }]);
        return;
      }
      case 'member': {
        const id = idOf('member');
        const type = pos[1];
        if (type !== 'frame' && type !== 'truss') { err(`a member is "frame" or "truss", not "${type ?? ''}"`); return; }
        const i = num(pos[2], 'node I'), j = num(pos[3], 'node J');
        if (id === null || i === null || j === null) return;
        s.elements.push([id, {
          id, type, nodeI: i, nodeJ: j,
          releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false },
          ...fields,
        }]);
        return;
      }
      case 'quad': case 'plate': {
        const fam = kw!.text;
        const id = idOf(fam);
        const nodes = json(pos[1], 'the corners');
        const n = fam === 'quad' ? 4 : 3;
        if (id === null || nodes === undefined) return;
        if (!Array.isArray(nodes) || nodes.length !== n || !nodes.every((x) => Number.isInteger(x))) { err(`a ${fam} has ${n} corner node ids`); return; }
        s[fam === 'quad' ? 'quads' : 'plates'].push([id, { id, nodes, ...fields }]);
        return;
      }
      case 'support': {
        const id = idOf('support');
        const node = num(pos[1], 'the support node');
        const type = word(pos[2], 'the support type');
        if (id === null || node === null || type === null) return;
        s.supports.push([id, { id, nodeId: node, type, ...fields }]);
        return;
      }
      case 'case': {
        const id = idOf('case');
        const type = word(pos[1], 'the case type');
        const name = str(pos[2], 'the case name');
        if (id === null || type === null || name === null) return;
        s.loadCases.push({ id, type, name, ...fields });
        return;
      }
      case 'combination': {
        const id = idOf('combination');
        const name = str(pos[1], 'the combination name');
        if (id === null || name === null) return;
        const factors: Array<{ caseId: number; factor: number }> = [];
        for (const t of pos.slice(2)) {
          const m = /^(\d+)\*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)$/.exec(t);
          if (!m) { err(`a combination term is case*factor, like 1*1.2, not "${t}"`); return; }
          factors.push({ caseId: Number(m[1]), factor: Number(m[2]) });
        }
        s.combinations.push({ id, name, factors, ...fields });
        return;
      }
      case 'load': {
        const type = pos[0];
        if (!type) { err('the load type is missing'); return; }
        const id = num(pos[1], 'the load id');
        if (id === null) return;
        const k = `load:${id}`;
        if (lineOf.has(k)) { err(`load ${id} is defined twice (first on line ${lineOf.get(k)})`); return; }
        lineOf.set(k, ln);
        s.loads.push({ type, data: { id, ...fields } });
        return;
      }
      case 'constraint': {
        const c = json(pos[0], 'a constraint');
        if (c !== undefined) s.constraints.push(c);
        return;
      }
      case 'group': {
        const id = idOf('group');
        const kind = word(pos[1], 'the group kind');
        const name = str(pos[2], 'the group name');
        if (id === null || kind === null || name === null) return;
        s.groups.push([id, { id, name, kind, ...fields }]);
        return;
      }
      case 'massSource': case 'geotechnical': case 'footingMatPreferences': case 'codeSettings': case 'regulations': {
        const v = json(pos[0], kw!.text);
        if (v !== undefined) s[kw!.text] = v;
        return;
      }
      default:
        err(`unknown line "${kw!.text}"`);
    }
  });
  if (!sawHeader && lines.some((l) => l.trim() && !l.trim().startsWith('#'))) {
    errors.unshift({ line: 1, message: `model code starts with "${HEADER} ${CODE_VERSION}"` });
  }

  // References: every id a line names must be defined somewhere.
  const has = (fam: string, id: unknown) => typeof id === 'number' && lineOf.has(`${fam}:${id}`);
  const ref = (fam: string, id: unknown, at: number, what: string) => {
    if (!has(fam, id)) errors.push({ line: at, message: `${what} ${String(id)} is not defined` });
  };
  const at = (fam: string, id: number) => lineOf.get(`${fam}:${id}`) ?? 0;
  for (const [id, e] of s.elements) {
    ref('node', e.nodeI, at('member', id), 'node'); ref('node', e.nodeJ, at('member', id), 'node');
    if (e.materialId !== undefined) ref('material', e.materialId, at('member', id), 'material');
    if (e.sectionId !== undefined) ref('section', e.sectionId, at('member', id), 'section');
  }
  for (const [fam, key] of [['quad', 'quads'], ['plate', 'plates']] as const) {
    for (const [id, q] of s[key]) {
      for (const n of q.nodes) ref('node', n, at(fam, id), 'node');
      if (q.materialId !== undefined) ref('material', q.materialId, at(fam, id), 'material');
    }
  }
  for (const [id, sp] of s.supports) ref('node', sp.nodeId, at('support', id), 'node');
  for (const l of s.loads) {
    const d = l.data, line = lineOf.get(`load:${d.id}`) ?? 0;
    if (d.nodeId !== undefined) ref('node', d.nodeId, line, 'node');
    if (d.elementId !== undefined) ref('member', d.elementId, line, 'member');
    if (d.quadId !== undefined) ref('quad', d.quadId, line, 'quad');
  }
  // A load or a combination naming an undefined CASE is not refused: the application keeps such
  // models (the case simply contributes nothing), and code that refused one it can open would not
  // be a faithful representation of it.


  if (errors.length > 0) return { snapshot: null, errors: errors.sort((a, b) => a.line - b.line) };

  // Counters one past the highest id in use.
  const next = (arr: Array<[number, unknown]>) => Math.max(0, ...arr.map(([id]) => id)) + 1;
  s.nextId = {
    node: next(s.nodes), material: next(s.materials), section: next(s.sections), element: next(s.elements),
    support: next(s.supports), load: Math.max(0, ...s.loads.map((l: any) => l.data.id)) + 1,
    loadCase: Math.max(0, ...s.loadCases.map((c: any) => c.id)) + 1, combination: Math.max(0, ...s.combinations.map((c: any) => c.id)) + 1,
    plate: next(s.plates), quad: next(s.quads), group: next(s.groups), connector: next(s.connectors), footing: next(s.footings),
  };
  for (const k of Object.keys(s)) if (!COVERED_FIELDS.includes(k as never) && k !== 'nextId') delete s[k];
  return { snapshot: s as Partial<ModelSnapshot>, errors: [] };
}
