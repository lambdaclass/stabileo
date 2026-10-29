/**
 * What the determinism gate requires, as plain functions so each requirement has a negative
 * test (checks.test.mjs):
 * * `requirementProblems(reference)`: on the Node run (with `values`), the cases that must
 *   succeed do, and every certificate that must certify does — read field by field, per
 *   certificate kind, not by searching the text for a success marker;
 * * `runDifferences(reference, other)`: a browser run is the same case list with the same
 *   output strings (floats compared by bit pattern, see cases.mjs `canonical`).
 */

/**
 * Cases that must not be refused (`ERR`). One pattern per entry point, and each must match at
 * least one case, so dropping a kind from cases.mjs fails the gate.
 */
export const MUST_SUCCEED = [
  /\/solve_2d$/, /\/solve_3d$/, /\/certify_linear_2d$/, /\/certify_linear_3d$/,
  /\/export_linear_bundle_2d$/, /\/export_linear_bundle_3d$/,
  /\/certify_modal_[23]d$/, /\/solve_harmonic_[23]d$/, /\/certify_harmonic_[23]d$/,
  /\/certify_pdelta_[23]d$/, /\/certify_spectral_[23]d$/, /\/certify_time_history_[23]d$/,
  /\/certify_multi_case_[23]d$/, /\/certify_steel_multi_case_[23]d$/,
  /^combo-2d\//, /^bundle-3d\//, /^plastic-3d-/, /^plastic-2d-.*\/export_plastic_bundle_2d$/,
];

const certifiedStatus = (c) => c?.status === 'certified';

/** Per-certificate checks of one multi-case result: every case, every combination, the envelope. */
function multiCaseProblems(v) {
  const out = [];
  if (!Array.isArray(v?.cases) || v.cases.length === 0) out.push('no load cases');
  else v.cases.forEach((c, i) => certifiedStatus(c.certificate) || out.push(`case ${c.name ?? i} not certified`));
  if (!Array.isArray(v?.combinations) || v.combinations.length === 0) out.push('no combinations');
  else v.combinations.forEach((c, i) => c.certified === true || out.push(`combination ${c.name ?? i} not certified`));
  if (v?.envelope?.certified !== true) out.push('envelope not certified');
  return out;
}

/**
 * Certificate kinds whose result must certify: [case-name pattern, problems(value)].
 * Buckling only where the model has a compressed member; plastic only for the frame
 * samples (trusses have no moment capacity, and the LP of some 3D fixtures is unbounded).
 */
const statusCheck = (v) => (certifiedStatus(v?.certificate) ? [] : ['certificate not certified']);

export const MUST_CERTIFY = [
  [/\/certify_linear_[23]d$/, statusCheck],
  [/\/certify_pdelta_[23]d$/, statusCheck],
  [/\/certify_modal_[23]d$/, statusCheck],
  [/\/certify_spectral_[23]d$/, statusCheck],
  [/\/certify_harmonic_[23]d$/, statusCheck],
  [/^(portal|two-story|truss)-2d\/certify_buckling_2d$|-3d\/certify_buckling_3d$/, statusCheck],
  [/\/certify_time_history_[23]d$/, (v) => {
    const c = v?.certificate;
    const out = [];
    if (c?.stabilityCertified !== true) out.push('stability not certified');
    if (c?.residualReason !== null || !c?.residual) out.push(`residual not certified: ${c?.residualReason}`);
    return out;
  }],
  [/^plastic-.*\/certify_plastic_3d$/, (v) => (v?.certificate?.certified === true ? [] : ['plastic certificate not certified'])],
  [/\/certify_multi_case_[23]d$/, multiCaseProblems],
  [/\/certify_steel_multi_case_[23]d$/, (v) => {
    const out = multiCaseProblems(v?.analysis).map((p) => `analysis: ${p}`);
    if (!Array.isArray(v?.steel) || v.steel.length === 0) out.push('no steel members');
    else v.steel.forEach((m) => m.certified === true || out.push(`steel member ${m.elementId} not certified: ${m.reason}`));
    return out;
  }],
];

/** Every requirement the Node reference run fails, as readable lines; [] when it passes. */
export function requirementProblems(reference) {
  const problems = [];
  const names = new Set(reference.map((r) => r.name));
  for (const re of MUST_SUCCEED) {
    if (![...names].some((n) => re.test(n))) problems.push(`no case matches ${re}`);
  }
  for (const [re] of MUST_CERTIFY) {
    if (![...names].some((n) => re.test(n))) problems.push(`no case matches ${re}`);
  }
  const refusedNames = ['plastic-2d-portal', 'plastic-2d-continuous'].flatMap(id =>
    ['solve_plastic_2d', 'certify_plastic_2d'].map(entry => `${id}/${entry}`));
  for (const name of refusedNames) {
    const r = reference.find(r => r.name === name);
    let valid = false;
    try {
      const d = JSON.parse(r.text.slice(5)).structuredDiagnostics;
      valid = r.text.startsWith('ERR: ') && d.some(d => d.code === 'known_issue' && d.severity === 'error' && d.phase === 'PL-2D-INVARIANCE' && d.value === 758);
    } catch {}
    if (!valid) problems.push(`${name}: expected structured PL-2D-INVARIANCE refusal (#758)`);
  }
  for (const r of reference) {
    const failed = r.text.startsWith('ERR');
    if (failed && MUST_SUCCEED.some((re) => re.test(r.name))) problems.push(`${r.name}: ${r.text.slice(0, 200)}`);
    for (const [re, check] of MUST_CERTIFY) {
      if (!re.test(r.name)) continue;
      if (failed) {
        problems.push(`${r.name}: refused, cannot certify`);
        continue;
      }
      if (r.value === undefined) {
        problems.push(`${r.name}: no value (run with { values: true })`);
        continue;
      }
      for (const p of check(r.value)) problems.push(`${r.name}: ${p}`);
    }
  }
  return problems;
}

/** Where two strings first differ, with some context, for the failure message. */
export function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `@${i}: ${a.slice(Math.max(0, i - 40), i + 40)} | ${b.slice(Math.max(0, i - 40), i + 40)}`;
}

/** How a run differs from the reference: a different case list, or any output string. */
export function runDifferences(reference, other) {
  const a = reference.map((r) => r.name);
  const b = other.map((r) => r.name);
  if (a.length !== b.length || a.some((n, i) => n !== b[i])) {
    return [`case lists differ: ${a.length} vs ${b.length} cases, first difference ${a.find((n, i) => n !== b[i]) ?? b[a.length]}`];
  }
  return other.filter((r, i) => r.text !== reference[i].text).map((r) => {
    const i = other.indexOf(r);
    return `${r.name} ${firstDiff(r.text, reference[i].text)}`;
  });
}
