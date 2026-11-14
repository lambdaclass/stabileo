import { siUnitOf, toSI, type Unit } from './units';
import { validateProfile } from './validate';
import type { CodeProfile, ProfileIssue, Source } from './types';

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

export class ProfileError extends Error {
  constructor(readonly profileId: string, readonly issues: ProfileIssue[]) {
    super(`code profile "${profileId}": ${issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ')}`);
  }
}

function clone<T>(x: T): T {
  if (Array.isArray(x)) return x.map(clone) as T;
  if (isObj(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clone(v)])) as T;
  return x;
}

/** Objects merge key by key; a list or a number replaces the parent's; `null` removes the key. */
export function mergeInto(parent: unknown, child: unknown): unknown {
  if (!isObj(parent) || !isObj(child)) return clone(child);
  const out: Obj = clone(parent);
  for (const [k, v] of Object.entries(child)) {
    if (v === null) delete out[k];
    else out[k] = k in out ? mergeInto(out[k], v) : clone(v);
  }
  return out;
}

/** The child's meta is its own; only the sources add up, the child's replacing a parent's of the same id. */
function mergeMeta(parent: Obj, child: Obj): Obj {
  const sources = new Map<string, Source>();
  for (const s of [...(parent.sources as Source[] ?? []), ...(child.sources as Source[] ?? [])]) sources.set(s.id, clone(s));
  return { ...clone(child), sources: [...sources.values()] };
}

export function mergeProfiles(parent: unknown, child: unknown): Obj {
  const p = isObj(parent) ? parent : {}, c = isObj(child) ? child : {};
  const { meta: pm, ...pRest } = p, { meta: cm, ...cRest } = c;
  return { meta: mergeMeta(isObj(pm) ? pm : {}, isObj(cm) ? cm : {}), ...(mergeInto(pRest, cRest) as Obj) };
}

function scaled(values: unknown, unit: Unit): unknown {
  return Array.isArray(values) ? values.map((v) => scaled(v, unit)) : typeof values === 'number' ? toSI(values, unit) : values;
}

function normalize(x: unknown): void {
  if (Array.isArray(x)) { x.forEach(normalize); return; }
  if (!isObj(x)) return;
  const unit = x.unit as Unit | undefined;
  if (unit && siUnitOf(unit) !== unit) {
    if (typeof x.v === 'number') x.v = toSI(x.v, unit);
    if ('axes' in x) x.values = scaled(x.values, unit);
    if (isObj(x.rows)) x.rows = Object.fromEntries(Object.entries(x.rows).map(([k, r]) => [k, scaled(r, unit)]));
    x.unit = siUnitOf(unit);
  }
  if (isObj(x.units) && Array.isArray(x.rows)) {
    const u = x.units as { q: Unit; Q: Unit };
    for (const r of x.rows as Obj[]) {
      if (typeof r.q === 'number') r.q = toSI(r.q, u.q);
      if (typeof r.Q === 'number') r.Q = toSI(r.Q, u.Q);
    }
    x.units = { q: siUnitOf(u.q), Q: siUnitOf(u.Q) };
  }
  for (const [k, v] of Object.entries(x)) if (k !== 'meta') normalize(v);
}

/** The profile's raw documents by `meta.id`. Two documents with the same id are an error. */
export function indexProfiles(docs: readonly unknown[]): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const d of docs) {
    const id = isObj(d) && isObj(d.meta) ? d.meta.id : undefined;
    if (typeof id !== 'string') throw new ProfileError('?', [{ path: 'meta.id', message: 'required' }]);
    if (out.has(id)) throw new ProfileError(id, [{ path: 'meta.id', message: 'two profiles share this id' }]);
    out.set(id, d);
  }
  return out;
}

/** The profile with its `extends` chain applied, validated and in SI. Throws a `ProfileError` listing every issue. */
export function resolveProfile(id: string, docs: ReadonlyMap<string, unknown>): CodeProfile {
  const chain: unknown[] = [];
  const seen: string[] = [];
  for (let cur: string | undefined = id; cur !== undefined;) {
    if (seen.includes(cur)) throw new ProfileError(id, [{ path: 'meta.extends', message: `extends itself through ${[...seen, cur].join(' → ')}` }]);
    seen.push(cur);
    const doc = docs.get(cur);
    if (doc === undefined) throw new ProfileError(id, [{ path: 'meta.extends', message: `no profile "${cur}"` }]);
    chain.unshift(doc);
    const meta = isObj(doc) && isObj(doc.meta) ? doc.meta : {};
    cur = typeof meta.extends === 'string' ? meta.extends : undefined;
  }
  const merged = chain.slice(1).reduce<Obj>((acc, d) => mergeProfiles(acc, d), mergeProfiles({}, chain[0]));
  const issues = validateProfile(merged);
  if (issues.length) throw new ProfileError(id, issues);
  normalize(merged);
  return merged as unknown as CodeProfile;
}
