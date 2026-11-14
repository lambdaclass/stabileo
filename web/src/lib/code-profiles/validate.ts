import { FORMULAS } from './formulas';
import { isUnit, type Unit } from './units';
import { PROFILE_SCHEMA_VERSION, STATUSES, type ProfileIssue } from './types';

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const join = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key));

function at(doc: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), doc);
}

const ROLES = ['loads', 'rc', 'steel', 'timber'];
const MATURITIES = ['draft', 'provisional', 'validated'];
const KINDS = ['residential', 'office', 'commercial', 'education', 'health', 'assembly', 'industrial', 'storage', 'parking', 'roof', 'circulation', 'other'];
const ASSEMBLY = ['passengerGarage', 'truckGarage', 'publicAssembly'];
const ACTIONS = ['permanent', 'imposed', 'roofImposed', 'snow', 'rain', 'wind', 'seismic', 'thermal', 'earthPressure', 'fluid'];

class Checker {
  readonly issues: ProfileIssue[] = [];
  constructor(private readonly sources: ReadonlySet<string>) {}

  fail(path: string, message: string) { this.issues.push({ path, message }); }

  cite(c: unknown, path: string) {
    if (!isObj(c) || !isStr(c.clause)) return this.fail(path, 'a cite needs a clause');
    if (c.source !== undefined && !this.sources.has(String(c.source))) this.fail(join(path, 'source'), `unknown source "${String(c.source)}"`);
  }

  walk(x: unknown, path: string) {
    if (Array.isArray(x)) { x.forEach((v, i) => this.walk(v, join(path, i))); return; }
    if (!isObj(x)) return;
    if ('status' in x && !(STATUSES as readonly unknown[]).includes(x.status)) this.fail(join(path, 'status'), `unknown status "${String(x.status)}"`);
    if ('unit' in x && !isUnit(x.unit)) this.fail(join(path, 'unit'), `unknown unit "${String(x.unit)}"`);
    if ('v' in x && !('cite' in x)) this.fail(path, 'a value needs a cite');
    if ('cite' in x) {
      if (Array.isArray(x.cite)) x.cite.forEach((c, i) => this.cite(c, join(join(path, 'cite'), i)));
      else this.cite(x.cite, join(path, 'cite'));
    }
    if (typeof x.f === 'string') this.formula(x, path);
    if ('axes' in x && 'values' in x) this.table(x, path);
    if ('columns' in x && 'rows' in x && !Array.isArray(x.rows)) this.keyed(x, path);
    for (const [k, v] of Object.entries(x)) if (k !== 'cite' && k !== 'meta') this.walk(v, join(path, k));
  }

  formula(x: Obj, path: string) {
    const form = FORMULAS[x.f as string];
    if (!form) return this.fail(join(path, 'f'), `"${String(x.f)}" is not in the formula catalog`);
    const k = isObj(x.k) ? x.k : {};
    for (const name of form.coefficients) if (!isNum(k[name])) this.fail(join(join(path, 'k'), name), 'missing coefficient');
    for (const name of Object.keys(k)) if (!form.coefficients.includes(name)) this.fail(join(join(path, 'k'), name), `"${x.f}" has no coefficient "${name}"`);
  }

  table(x: Obj, path: string) {
    const axes = Array.isArray(x.axes) ? x.axes as Obj[] : [];
    if (!axes.length) return this.fail(join(path, 'axes'), 'a table needs at least one axis');
    axes.forEach((a, i) => {
      const vs = Array.isArray(a.values) ? a.values : [];
      if (vs.every(isNum) && vs.some((v, j) => j > 0 && (v as number) <= (vs[j - 1] as number))) this.fail(join(join(path, 'axes'), i), 'axis values must ascend');
    });
    const dims = axes.map((a) => (Array.isArray(a.values) ? a.values.length : 0));
    const shape = (v: unknown, d: number): boolean => (d === dims.length ? isNum(v) : Array.isArray(v) && v.length === dims[d] && v.every((w) => shape(w, d + 1)));
    if (!shape(x.values, 0)) this.fail(join(path, 'values'), `values do not match the axes (${dims.join(' × ')})`);
  }

  keyed(x: Obj, path: string) {
    const n = Array.isArray(x.columns) ? x.columns.length : 0;
    for (const [k, row] of Object.entries(isObj(x.rows) ? x.rows : {})) {
      if (!Array.isArray(row) || row.length !== n || !row.every(isNum)) this.fail(join(join(path, 'rows'), k), `a row needs ${n} numbers`);
    }
  }

  require(doc: unknown, path: string, kind: 'val' | 'formula' | 'table' | 'keyed', forms?: readonly string[]) {
    const x = at(doc, path);
    if (x === undefined || x === null) return this.fail(path, 'required');
    const ok = isObj(x) && (kind === 'val' ? 'v' in x : kind === 'formula' ? typeof x.f === 'string' : kind === 'table' ? 'axes' in x : 'rows' in x);
    if (!ok) return this.fail(path, `must be a ${kind}`);
    if (forms && !forms.includes(x.f as string)) this.fail(join(path, 'f'), `must be one of ${forms.join(', ')}`);
  }

  range(doc: unknown, path: string, lo: number, hi: number) {
    const v = (at(doc, path) as Obj | undefined)?.v;
    if (isNum(v) && (v < lo || v > hi)) this.fail(path, `must lie in [${lo}, ${hi}]`);
  }
}

function checkMeta(c: Checker, meta: unknown) {
  if (!isObj(meta)) return c.fail('meta', 'required');
  if (meta.schema !== PROFILE_SCHEMA_VERSION) c.fail('meta.schema', `must be ${PROFILE_SCHEMA_VERSION}`);
  for (const k of ['id', 'title', 'edition', 'country']) if (!isStr(meta[k])) c.fail(`meta.${k}`, 'required');
  if (!ROLES.includes(meta.role as string)) c.fail('meta.role', `must be one of ${ROLES.join(', ')}`);
  if (!MATURITIES.includes(meta.maturity as string)) c.fail('meta.maturity', `must be one of ${MATURITIES.join(', ')}`);
  if (!Number.isInteger(meta.revision) || (meta.revision as number) < 1) c.fail('meta.revision', 'must be a whole number from 1');
  if (!Array.isArray(meta.maintainers)) c.fail('meta.maintainers', 'required');
  if (!Array.isArray(meta.sources) || !meta.sources.length) return c.fail('meta.sources', 'at least one source');
  meta.sources.forEach((s, i) => { if (!isObj(s) || !isStr(s.id) || !isStr(s.title) || !isStr(s.edition)) c.fail(`meta.sources.${i}`, 'a source needs id, title and edition'); });
}

function checkOccupancies(c: Checker, doc: Obj) {
  const t = at(doc, 'imposed.occupancies');
  if (!isObj(t)) return c.fail('imposed.occupancies', 'required');
  const units = isObj(t.units) ? t.units : {};
  if (!(['kN/m2', 'psf'] as Unit[]).includes(units.q as Unit)) c.fail('imposed.occupancies.units.q', 'must be kN/m2 or psf');
  if (!(['kN', 'lbf'] as Unit[]).includes(units.Q as Unit)) c.fail('imposed.occupancies.units.Q', 'must be kN or lbf');
  if (!Array.isArray(t.cite)) c.fail('imposed.occupancies.cite', 'a list of cites');
  if (typeof t.labelPrefix !== 'string') c.fail('imposed.occupancies.labelPrefix', 'required');
  if (!Array.isArray(t.rows) || !t.rows.length) return c.fail('imposed.occupancies.rows', 'at least one row');
  const seen = new Set<string>();
  t.rows.forEach((r: unknown, i: number) => {
    const p = `imposed.occupancies.rows.${i}`;
    if (!isObj(r)) return c.fail(p, 'must be an object');
    if (!isStr(r.key)) c.fail(`${p}.key`, 'required');
    else if (seen.has(r.key)) c.fail(`${p}.key`, `duplicate key "${r.key}"`);
    else seen.add(r.key);
    if (!KINDS.includes(r.kind as string)) c.fail(`${p}.kind`, `must be one of ${KINDS.join(', ')}`);
    if (r.q !== null && !(isNum(r.q) && r.q >= 0)) c.fail(`${p}.q`, 'a number from 0, or null');
    if (r.Q !== undefined && r.Q !== null && !(isNum(r.Q) && r.Q >= 0)) c.fail(`${p}.Q`, 'a number from 0, or null');
    if (r.assembly !== undefined && !ASSEMBLY.includes(r.assembly as string)) c.fail(`${p}.assembly`, `must be one of ${ASSEMBLY.join(', ')}`);
    if (r.tags !== undefined && !(isObj(r.tags) && Object.values(r.tags).every((v) => typeof v === 'string' || typeof v === 'boolean'))) c.fail(`${p}.tags`, 'text or yes/no values');
  });
}

function checkCombinations(c: Checker, doc: Obj) {
  const comb = doc.combinations;
  if (comb === undefined) return;
  if (!isObj(comb)) return c.fail('combinations', 'must be an object');
  if (comb.form !== 'generated') return;
  for (const g of ['gSup', 'gInf', 'q']) { c.require(doc, `combinations.gamma.${g}`, 'val'); c.range(doc, `combinations.gamma.${g}`, 1, 2); }
  if (comb.xi !== undefined) { c.require(doc, 'combinations.xi', 'val'); c.range(doc, 'combinations.xi', 0, 1); }
  c.require(doc, 'combinations.psi', 'keyed');
  const psi = comb.psi as Obj | undefined;
  if (isObj(psi) && JSON.stringify(psi.columns) !== JSON.stringify(['psi0', 'psi1', 'psi2'])) c.fail('combinations.psi.columns', 'must be psi0, psi1, psi2');
  for (const [k, row] of Object.entries(isObj(psi?.rows) ? psi!.rows as Obj : {})) {
    const [a, b, d] = Array.isArray(row) ? row as number[] : [];
    if (!(isNum(a) && isNum(b) && isNum(d) && a <= 1 && a >= b && b >= d && d >= 0)) c.fail(`combinations.psi.rows.${k}`, 'needs 1 ≥ ψ0 ≥ ψ1 ≥ ψ2 ≥ 0');
  }
  if (!Array.isArray(comb.exclusive) || !comb.exclusive.every((s) => Array.isArray(s) && s.every(isStr))) c.fail('combinations.exclusive', 'a list of symbol lists');
  if (typeof comb.notActing !== 'boolean') c.fail('combinations.notActing', 'yes or no');
}

function checkLoads(c: Checker, doc: Obj) {
  checkOccupancies(c, doc);
  checkCombinations(c, doc);
  if (doc.symbols !== undefined) {
    if (!isObj(doc.symbols)) c.fail('symbols', 'must be an object');
    else for (const [k, v] of Object.entries(doc.symbols)) if (!ACTIONS.includes(v as string)) c.fail(`symbols.${k}`, `must be one of ${ACTIONS.join(', ')}`);
  }
}

function checkRc(c: Checker, doc: Obj) {
  c.require(doc, 'materials.steel.es', 'val');
  const kind = at(doc, 'resistance.kind');
  if (kind === 'gamma') {
    for (const k of ['gammaC', 'gammaS']) { c.require(doc, `resistance.${k}`, 'val'); c.range(doc, `resistance.${k}`, 1, 3); }
    for (const k of ['alphaCC', 'alphaCCShear', 'alphaCT']) { c.require(doc, `resistance.${k}`, 'val'); c.range(doc, `resistance.${k}`, 0, 1); }
  } else if (kind === 'phi') {
    for (const k of ['tension', 'compressionTied', 'compressionSpiral', 'shear']) { c.require(doc, `resistance.${k}`, 'val'); c.range(doc, `resistance.${k}`, 0, 1); }
    c.require(doc, 'resistance.strainTension', 'val');
  } else c.fail('resistance.kind', 'must be gamma or phi');
  c.require(doc, 'beams.minSteel', 'formula', ['minSteel.tensileRatio']);
  c.require(doc, 'beams.maxRatio', 'val');
  c.require(doc, 'beams.linkMin', 'formula', ['minLinks.sqrtFc']);
  c.require(doc, 'beams.linkMaxSpacing', 'val');
  if (at(doc, 'beams.xuLimit') !== undefined) c.require(doc, 'beams.xuLimit', 'table');
  c.require(doc, 'shear', 'formula', ['shear.variableStrut']);
  if (at(doc, 'punching.vmax') !== undefined) c.require(doc, 'punching.vmax', 'formula', ['punching.vmax']);
  c.require(doc, 'columns.rhoMin', 'formula', ['columnSteel.axialOrArea']);
  c.require(doc, 'columns.rhoMax', 'val');
  c.require(doc, 'columns.minBarDia', 'val');
  c.require(doc, 'columns.slenderness', 'formula', ['slenderness.limitABC']);
}

function collectStatus(x: unknown, path: string, out: string[]) {
  if (Array.isArray(x)) { x.forEach((v, i) => collectStatus(v, join(path, i), out)); return; }
  if (!isObj(x)) return;
  if (x.status === 'toConfirm') out.push(path);
  for (const [k, v] of Object.entries(x)) collectStatus(v, join(path, k), out);
}

/** The paths of every value, table, formula or row still marked `toConfirm`. */
export function toConfirmPaths(doc: unknown): string[] {
  const out: string[] = [];
  collectStatus(doc, '', out);
  return out;
}

/** The issues of a whole profile, its `extends` already applied. */
export function validateProfile(doc: unknown): ProfileIssue[] {
  if (!isObj(doc)) return [{ path: '', message: 'a profile is an object' }];
  const meta = isObj(doc.meta) ? doc.meta : {};
  const sources = new Set((Array.isArray(meta.sources) ? meta.sources : []).map((s) => (isObj(s) ? String(s.id) : '')));
  const c = new Checker(sources);
  checkMeta(c, doc.meta);
  c.walk(doc, '');
  if (meta.role === 'loads') checkLoads(c, doc);
  if (meta.role === 'rc') checkRc(c, doc);
  if (meta.maturity === 'validated') for (const p of toConfirmPaths(doc)) c.fail(p, 'a validated profile cannot hold a value to confirm');
  return c.issues;
}
