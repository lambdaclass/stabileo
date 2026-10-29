/**
 * Cross-runtime determinism of the WASM engine (docs/verification/TRUSTED_BASE.md,
 * "Determinism across runtimes"). The same module runs in Node and in each browser:
 * `runCases(wasm, fixtures)` calls a fixed list of engine entry points (solves and
 * certificates) on fixed models and returns, per case, a canonical string of the output in
 * which every float appears as its exact bit pattern. The Playwright spec asserts the
 * strings are identical in Chromium, Firefox, WebKit and Node.
 *
 * `fixtures` maps a name (FIXTURES below) to the parsed JSON file.
 */

/** Fixture files, relative to the repository root. */
export const FIXTURES = {
  'portal-2d': 'engine/tests/fixtures/ex-portal-frame-input.json',
  'two-story-2d': 'engine/tests/fixtures/ex-two-story-frame-input.json',
  'truss-2d': 'engine/tests/fixtures/ex-truss-input.json',
  'continuous-2d': 'engine/tests/fixtures/ex-continuous-beam-input.json',
  'random-2d': 'engine/tests/fixtures/random-12-input.json',
  'portal-3d': 'engine/tests/fixtures/ex-3d-portal-frame-input.json',
  'space-truss-3d': 'engine/tests/fixtures/ex-3d-space-truss-input.json',
  'tower-3d': 'engine/tests/fixtures/ex-3d-tower-input.json',
  'random-3d': 'engine/tests/fixtures/random3d-12-input.json',
  'combo-2d': 'verify/samples/combo-2d-frame.input.json',
  'bundle-3d': 'verify/samples/ex-3d-portal-frame.input.json',
  'plastic-2d-portal': 'verify/samples/plastic-2d-portal.input.json',
  'plastic-2d-continuous': 'verify/samples/plastic-2d-continuous.input.json',
  'plastic-3d-portal': 'verify/samples/plastic-3d-portal.input.json',
  'plastic-3d-cantilever': 'verify/samples/plastic-3d-cantilever.input.json',
};

const MODELS_2D = ['portal-2d', 'two-story-2d', 'truss-2d', 'continuous-2d', 'random-2d'];
const MODELS_3D = ['portal-3d', 'space-truss-3d', 'tower-3d', 'random-3d'];

/** Exact bit pattern of a double, as 16 hex digits. */
function f64hex(x) {
  const v = new DataView(new ArrayBuffer(8));
  v.setFloat64(0, x);
  return v.getBigUint64(0).toString(16).padStart(16, '0');
}

/**
 * Canonical text of a value returned by the engine: numbers as bit patterns (so −0 and 0,
 * or two doubles that print alike, differ), Maps in insertion order, typed arrays element-wise.
 * NaN is written as `NaN`: WebAssembly lets an engine choose a NaN's sign and payload, and
 * no result depends on them (a NaN anywhere is a failed result).
 */
export function canonical(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : `d${f64hex(v)}`;
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (v instanceof Map) return `M{${[...v].map(([k, x]) => `${canonical(k)}:${canonical(x)}`).join(',')}}`;
  if (ArrayBuffer.isView(v)) return `T[${Array.from(v, canonical).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

/** The output as plain data (Maps to objects; a string output is serde_json text), for checks.mjs. */
export function plain(out) {
  const walk = (v) => {
    if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), walk(x)]));
    if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v, walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return typeof out === 'string' ? JSON.parse(out) : walk(out);
}

/** String outputs are serde_json text: shortest round-trip decimals, a bijection with the bits. */
function textOf(out) {
  return typeof out === 'string' ? out : canonical(out);
}

function densities(model) {
  return Object.fromEntries(Object.keys(model.materials).map((k) => [k, 7850]));
}

/**
 * A response point with a free translational DOF: the highest-numbered unsupported node, else
 * the highest-numbered `rollerX` node (x free), in direction x. Throws when the model has
 * none, so a fixture change shows up as a failed harmonic case instead of a vacuous one.
 */
function responsePoint(model) {
  const supportOf = new Map(Object.values(model.supports).map((s) => [s.nodeId, s.type]));
  const ids = Object.values(model.nodes).map((n) => n.id).sort((a, b) => b - a);
  const id = ids.find((i) => !supportOf.has(i)) ?? ids.find((i) => supportOf.get(i) === 'rollerX');
  if (id === undefined) throw new Error('no node with a free x DOF for the harmonic response');
  return { responseNodeId: id, responseDof: 'x' };
}

/**
 * Ground acceleration record. Built from exact arithmetic only: JS `Math.sin` and friends are
 * implementation-approximated and differ between engines, which would make the inputs differ.
 */
const GROUND = Array.from({ length: 40 }, (_, i) => (((i * 7) % 11) - 5) / 4);

const SPECTRUM = { name: 'det', inG: true, points: [{ period: 0, sa: 0.4 }, { period: 0.5, sa: 1.0 }, { period: 2.0, sa: 0.3 }] };

function plasticOf(model, three) {
  const sections = Object.fromEntries(Object.entries(model.sections).map(([k, s]) => [k, three
    ? { a: s.a, iy: s.iy, iz: s.iz, materialId: 1, b: 0.15, h: 0.3 }
    : { a: s.a, iz: s.iz, materialId: 1, b: 0.15, h: 0.3 }]));
  const materials = Object.fromEntries(Object.keys(model.materials).map((k) => [k, { fy: 250 }]));
  return { solver: model, sections, materials };
}

function multiCaseOf(model) {
  return {
    solver: { ...model, loads: [] },
    loadCases: [{ name: 'D', loads: model.loads }, { name: 'L', loads: model.loads }],
    combinations: [{ name: '1.2D+1.6L', factors: { D: 1.2, L: 1.6 } }, { name: '0.9D-1.6L', factors: { D: 0.9, L: -1.6 } }],
  };
}

/**
 * A W310×52-like rolled member for every element (kN, m): with its plate elements in
 * compression (AISC E7), so the compression check is evaluated, not refused.
 */
function steelMembers(model) {
  const bf = 0.167, tf = 0.0132, d = 0.317, tw = 0.0076;
  return Object.values(model.elements).map((e) => ({
    elementId: e.id, fy: 250e3, fu: 400e3, ag: 6.65e-3, aw: d * tw, lby: 4, lbz: 4,
    iy: 1.19e-4, iz: 1.03e-5, ry: 0.134, rz: 0.0394, zy: 8.4e-4, zz: 1.58e-4, sy: 7.5e-4, sz: 1.03e-4,
    j: 3.1e-7, cw: 2.3e-7, lb: 4, e: 200e6, depth: d, flangeSlenderness: bf / (2 * tf),
    compressionElements: [
      { kind: 'rolledFlange', b: bf / 2, t: tf, count: 4 },
      { kind: 'web', b: d - 2 * tf, t: tw },
    ],
  }));
}

/** The case list: [name, () => output]. Inputs are fixed; nothing here depends on the runtime. */
function caseList(w, fx) {
  const cases = [];
  const names = new Set();
  const add = (name, f) => {
    if (names.has(name)) throw new Error(`Duplicate determinism case: ${name}`);
    names.add(name);
    cases.push([name, f]);
  };
  const s = (x) => JSON.stringify(x);
  for (const id of MODELS_2D) {
    const m = fx[id];
    const dyn = { solver: m, densities: densities(m) };
    add(`${id}/solve_2d`, () => w.solve_2d(m));
    add(`${id}/certify_linear_2d`, () => w.certify_linear_2d(m));
    add(`${id}/export_linear_bundle_2d`, () => w.export_linear_bundle_2d(s(m)));
    add(`${id}/solve_pdelta_2d`, () => w.solve_pdelta_2d(s(m), 30, 1e-8));
    add(`${id}/certify_pdelta_2d`, () => w.certify_pdelta_2d(s(m), 30, 1e-8));
    add(`${id}/solve_buckling_2d`, () => w.solve_buckling_2d(s(m), 3));
    add(`${id}/certify_buckling_2d`, () => w.certify_buckling_2d(s(m), 3));
    add(`${id}/solve_modal_2d`, () => w.solve_modal_2d(s(dyn), 3));
    add(`${id}/certify_modal_2d`, () => w.certify_modal_2d(s(dyn), 3));
    const sp = () => ({ ...dyn, modes: JSON.parse(w.solve_modal_2d(s(dyn), 3)).modes, spectrum: SPECTRUM, direction: 'X' });
    add(`${id}/solve_spectral_2d`, () => w.solve_spectral_2d(s(sp())));
    add(`${id}/certify_spectral_2d`, () => w.certify_spectral_2d(s(sp())));
    const th = { ...dyn, timeStep: 0.01, nSteps: 40, groundAccel: GROUND, groundDirection: 'X' };
    add(`${id}/solve_time_history_2d`, () => w.solve_time_history_2d(s(th)));
    add(`${id}/certify_time_history_2d`, () => w.certify_time_history_2d(s(th)));
    const hm = () => ({ ...dyn, frequencies: [0.5, 2.0, 8.0], dampingRatio: 0.05, ...responsePoint(m) });
    add(`${id}/solve_harmonic_2d`, () => w.solve_harmonic_2d(s(hm())));
    add(`${id}/certify_harmonic_2d`, () => w.certify_harmonic_2d(s(hm())));
    add(`${id}/solve_plastic_2d`, () => w.solve_plastic_2d(s(plasticOf(m, false))));
    add(`${id}/certify_plastic_2d`, () => w.certify_plastic_2d(s(plasticOf(m, false))));
    add(`${id}/solve_multi_case_2d`, () => w.solve_multi_case_2d(multiCaseOf(m)));
    add(`${id}/certify_multi_case_2d`, () => w.certify_multi_case_2d(multiCaseOf(m)));
    add(`${id}/certify_steel_multi_case_2d`, () => w.certify_steel_multi_case_2d(s({ multiCase: multiCaseOf(m), members: steelMembers(m) })));
  }
  for (const id of MODELS_3D) {
    const m = fx[id];
    const dyn = { solver: m, densities: densities(m) };
    add(`${id}/solve_3d`, () => w.solve_3d(m));
    add(`${id}/certify_linear_3d`, () => w.certify_linear_3d(m));
    add(`${id}/export_linear_bundle_3d`, () => w.export_linear_bundle_3d(s(m)));
    add(`${id}/solve_pdelta_3d`, () => w.solve_pdelta_3d(s(m), 30, 1e-8));
    add(`${id}/certify_pdelta_3d`, () => w.certify_pdelta_3d(s(m), 30, 1e-8));
    add(`${id}/solve_buckling_3d`, () => w.solve_buckling_3d(s(m), 3));
    add(`${id}/certify_buckling_3d`, () => w.certify_buckling_3d(s(m), 3));
    add(`${id}/solve_modal_3d`, () => w.solve_modal_3d(s(dyn), 3));
    add(`${id}/certify_modal_3d`, () => w.certify_modal_3d(s(dyn), 3));
    const sp = () => ({ ...dyn, modes: JSON.parse(w.solve_modal_3d(s(dyn), 3)).modes, spectrum: SPECTRUM, direction: 'X' });
    add(`${id}/solve_spectral_3d`, () => w.solve_spectral_3d(s(sp())));
    add(`${id}/certify_spectral_3d`, () => w.certify_spectral_3d(s(sp())));
    const th = { ...dyn, timeStep: 0.01, nSteps: 40, groundAccelX: GROUND };
    add(`${id}/solve_time_history_3d`, () => w.solve_time_history_3d(s(th)));
    add(`${id}/certify_time_history_3d`, () => w.certify_time_history_3d(s(th)));
    const hm = () => ({ ...dyn, frequencies: [0.5, 2.0, 8.0], dampingRatio: 0.05, ...responsePoint(m) });
    add(`${id}/solve_harmonic_3d`, () => w.solve_harmonic_3d(s(hm())));
    add(`${id}/certify_harmonic_3d`, () => w.certify_harmonic_3d(s(hm())));
    add(`${id}/solve_plastic_3d`, () => w.solve_plastic_3d(s(plasticOf(m, true))));
    add(`${id}/certify_plastic_3d`, () => w.certify_plastic_3d(s(plasticOf(m, true))));
    add(`${id}/certify_multi_case_3d`, () => w.certify_multi_case_3d(multiCaseOf(m)));
  }
  // Certificate bundles of the verify/ samples (what certcheck re-checks).
  add('combo-2d/certify_multi_case_2d', () => w.certify_multi_case_2d(fx['combo-2d']));
  add('combo-2d/export_combination_bundle_2d', () => w.export_combination_bundle_2d(s(fx['combo-2d'])));
  add('bundle-3d/certify_linear_3d', () => w.certify_linear_3d(fx['bundle-3d']));
  add('bundle-3d/export_linear_bundle_3d', () => w.export_linear_bundle_3d(s(fx['bundle-3d'])));
  for (const id of ['plastic-2d-portal', 'plastic-2d-continuous']) {
    add(`${id}/certify_plastic_2d`, () => w.certify_plastic_2d(s(fx[id])));
    add(`${id}/export_plastic_bundle_2d`, () => w.export_plastic_bundle_2d(s(fx[id])));
  }
  for (const id of ['plastic-3d-portal', 'plastic-3d-cantilever']) {
    add(`${id}/certify_plastic_3d`, () => w.certify_plastic_3d(s(fx[id])));
    add(`${id}/export_plastic_bundle_3d`, () => w.export_plastic_bundle_3d(s(fx[id])));
  }
  return cases;
}

/**
 * Run every case. An entry point that rejects its input is recorded as `ERR: message`
 * (still compared across runtimes). With `values`, each result also carries the output as
 * plain data (`plain`), which checks.mjs reads to require that the certificates certify.
 */
export function runCases(wasm, fixtures, { values = false } = {}) {
  const results = [];
  for (const [name, f] of caseList(wasm, fixtures)) {
    let text;
    let value;
    let out;
    try {
      out = f();
      text = textOf(out);
    } catch (e) {
      text = `ERR: ${typeof e === 'string' ? e : e?.message ?? String(e)}`;
    }
    // Outside the try: a value that cannot be read must fail the checks, not change the text.
    if (values && !text.startsWith('ERR')) value = plain(out);
    results.push(values ? { name, text, value } : { name, text });
  }
  return results;
}
