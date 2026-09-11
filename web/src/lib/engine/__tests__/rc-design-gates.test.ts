/**
 * PR15 source gates.
 *
 * These pin architectural invariants that a future edit could silently undo. They use
 * the repo's established source-text-gate pattern (see convention-regression-gates).
 *
 * CONTRACT TESTS: weakening any assertion here re-opens a defect that shipped once.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
/** Strip comments so a gate checks CODE, not the documentation describing the fix. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const readCode = (p: string) => stripComments(read(p));
const SRC = resolve(__dirname, '../../..');

describe('GATE: the reinforcement-edit path never destroys verification state', () => {
  const designDir = resolve(SRC, 'components/pro/design');
  const designFiles = readdirSync(designDir).filter(f => f.endsWith('.svelte') || f.endsWith('.ts'));
  const tab = readCode('../../../components/pro/ProDesignTab.svelte');

  it('ProDesignTab does not call verificationStore.clear()', () => {
    // This single line was the reported regression: it emptied the design table and
    // destroyed the data the live provided-rebar verification needs as input.
    expect(tab).not.toContain('verificationStore.clear()');
  });

  it('no design component calls verificationStore.clear()', () => {
    for (const f of designFiles) {
      const s = stripComments(readFileSync(resolve(designDir, f), 'utf8'));
      expect(s, `${f} must not clear the verification store`).not.toContain('verificationStore.clear()');
    }
  });

  it('ProDesignTab does not reassign model.elements directly', () => {
    // Reinforcement must be written through modelStore.reinforcementTransaction so the
    // edit is undoable and does not bump the model version.
    expect(tab).not.toMatch(/model\.elements\s*=\s*new Map/);
    expect(tab).not.toContain('_reinfVersion');
  });

  it('rebar-edit routes every write through reinforcementTransaction', () => {
    const s = readCode('../../store/rebar-edit.ts');
    expect(s).toContain('modelStore.reinforcementTransaction');
    expect(s).not.toMatch(/model\.elements\s*=\s*new Map/);
    expect(s).not.toContain('bumpModelVersion');
  });

  it('the reinforcement transaction never bumps the model version', () => {
    const s = read('../../store/model.svelte.ts');
    const start = s.indexOf('reinforcementTransaction(');
    expect(start).toBeGreaterThan(0);
    const body = s.slice(start, s.indexOf('\n    },', start));
    expect(body).not.toContain('bumpModelVersion');
    expect(body).not.toContain('modelVersion++');
    expect(body).not.toContain('_onMutation');
    expect(body).toContain('_pushUndoSilent');
  });

  it('the mutation hook is unconditional and advances the analysis revision', () => {
    const s = read('../../store/index.ts');
    expect(s).toContain('verificationStore.invalidateAnalysis()');
    // A guard here would let a mutation silently fail to advance the revision.
    expect(s).not.toMatch(/if\s*\(\s*resultsStore\.hasAnyResults/);
  });
});

describe('GATE: status is provided-first, not baseline-first', () => {
  it('the viewport overlay reads the display status, not designMap directly', () => {
    const s = read('../../viewport3d/results-sync.ts');
    expect(s).toContain('verificationStore.getDisplayStatus(id)');
    expect(s).toContain('verificationStateColor');
  });

  it('getMaxRatio / getStatus delegate to the provided-first display helpers', () => {
    const s = read('../../store/verification.svelte.ts');
    expect(s).toContain('getMaxRatio(elementId: number): number | null {\n      return this.getDisplayRatio(elementId);');
    expect(s).toContain('getBaselineStatus');
  });

  it('Viewport3D reacts to design + provided-verification changes', () => {
    const s = read('../../../components/Viewport3D.svelte');
    expect(s).toContain('verificationStore.design;');
    expect(s).toContain('verificationStore.providedRevision;');
  });
});

describe('GATE: verification is axis-agnostic', () => {
  const sdf = read('../station-design-forces.ts');

  it('beam flexure and shear read the resolved axis, not a hardcoded component', () => {
    expect(sdf).toContain("import {\n  resolveDesignAxes, tupleMoment, tupleShear, axisLabel,");
    expect(sdf).toContain('const M = (t: Tuple) => tupleMoment(t, axes.flexure);');
    expect(sdf).toContain('const V = (t: Tuple) => tupleShear(t, axes.shear);');
    // The pre-PR15 hardcoded reads must be gone.
    expect(sdf).not.toContain('spanTuples.filter(t => t.mz > 0.001)');
    expect(sdf).not.toContain('startTuples.filter(t => t.mz < -0.001)');
  });

  it('column ties check BOTH shear components', () => {
    expect(sdf).toContain('axes.secondaryShear');
    expect(sdf).toContain("{ axis: axes.shear, read: V, width: section.b, dTie: dTieFor(section.h) }");
    expect(sdf).toContain("{ axis: axes.secondaryShear, read: V2, width: section.h, dTie: dTieFor(section.b) }");
  });

  it('slenderness magnification reaches the verifier', () => {
    expect(sdf).toContain('slenderDeltaNs');
    expect(sdf).toContain('* deltaNs');
  });

  it('missing reinforcement is an explicit failure, never a skipped check', () => {
    expect(sdf).toContain('missingReinforcement: true');
    expect(sdf).toContain('no reinforcement provided in this region');
    expect(sdf).toContain('no stirrups provided in this region');
  });

  it('provided-check utilization is demand/capacity with a warn band', () => {
    expect(sdf).toContain("import { utilizationStatus } from './design/outcome'");
    expect(sdf).toContain('status: utilizationStatus(utilization)');
    expect(sdf).toContain('demand / capacity');
  });
});

describe('GATE: lib/engine stays store-free (the code-adapter seam)', () => {
  it('verification-service no longer writes to a store', () => {
    const s = readCode('../verification-service.ts');
    expect(s).not.toContain("import { verificationStore }");
    expect(s).not.toContain('verificationStore.setConcrete');
    expect(s).not.toContain('verificationStore.clear()');
  });

  it('no design engine module imports a store at runtime', () => {
    const dir = resolve(SRC, 'lib/engine/design');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === '__tests__') continue;
        if (e.isDirectory()) walk(resolve(d, e.name));
        else if (e.name.endsWith('.ts')) files.push(resolve(d, e.name));
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      const runtimeStoreImport = /^import\s+(?!type\b)[^;]*from\s+'[^']*store\/(?!model\.svelte')[^']*'/m;
      expect(runtimeStoreImport.test(s), `${f} must not import a store at runtime`).toBe(false);
    }
  });
});

describe('GATE: outcome contract and verifier version', () => {
  it('the CIRSOC verifier is versioned so corrected results are never confused with old ones', () => {
    const s = read('../design/adapters/cirsoc201-adapter.ts');
    expect(s).toContain("export const CIRSOC_VERIFIER_ID = 'cirsoc201.provided.v2'");
    expect(s).toContain('v1 → v2');
  });

  it('the search asserts the outcome invariants on every result', () => {
    const s = read('../design/candidate-search.ts');
    expect(s).toContain('assertOutcomeInvariants(o)');
    // Only VERIFIED may carry accepted reinforcement + a certificate.
    expect(s).toContain("outcome: 'VERIFIED'");
    expect(s).toContain('provisional: bestFailure?.attempt');
  });

  it('per-member bounds are count-based, so the outcome class is deterministic', () => {
    const s = read('../design/candidate-search.ts');
    expect(s).not.toContain('maxMemberMs');
    expect(s).toContain('COUNT-BASED ONLY');
  });

  it('the migration notice exists in both maintained locales', () => {
    for (const loc of ['en', 'es']) {
      const s = read(`../../i18n/locales/${loc}.ts`);
      expect(s, `${loc} migration notice`).toContain("'design.cert.migrationNotice'");
    }
  });
});

describe('GATE: new user-facing strings are localised', () => {
  const designDir = resolve(SRC, 'components/pro/design');
  const files = readdirSync(designDir).filter(f => f.endsWith('.svelte'));

  it('every new design component imports the i18n helpers', () => {
    for (const f of files) {
      const s = readFileSync(resolve(designDir, f), 'utf8');
      expect(s, `${f} must use t()/tp()`).toMatch(/from '\.\.\/\.\.\/\.\.\/lib\/i18n'/);
    }
  });

  it('en and es define the same design.* key set', () => {
    const keysOf = (loc: string) =>
      new Set([...read(`../../i18n/locales/${loc}.ts`).matchAll(/'(design\.[\w.]+)'\s*:/g)].map(m => m[1]));
    const en = keysOf('en');
    const es = keysOf('es');
    expect(en.size).toBeGreaterThan(150);
    const missingEs = [...en].filter(k => !es.has(k));
    const missingEn = [...es].filter(k => !en.has(k));
    expect(missingEs, 'keys missing from es').toEqual([]);
    expect(missingEn, 'keys missing from en').toEqual([]);
  });
});

describe('GATE: ProDesignTab was decomposed', () => {
  it('is far below the 600-LOC component ceiling and delegates to components', () => {
    const s = read('../../../components/pro/ProDesignTab.svelte');
    const loc = s.split('\n').length;
    expect(loc).toBeLessThan(600);
    for (const c of [
      'DesignToolbar', 'DesignFilterBar', 'DesignTable', 'RebarEditorBeam',
      'RebarEditorColumn', 'RebarSchematics', 'VerificationDetail',
      'BatchEditDialog', 'ChangedMembersPanel', 'SectionAdviceDialog',
    ]) {
      expect(s, `must render ${c}`).toContain(`<${c}`);
    }
  });

  it('every extracted component stays inside the ceiling', () => {
    const dir = resolve(SRC, 'components/pro/design');
    for (const f of readdirSync(dir).filter(x => x.endsWith('.svelte'))) {
      const loc = readFileSync(resolve(dir, f), 'utf8').split('\n').length;
      expect(loc, `${f} is ${loc} lines`).toBeLessThan(600);
    }
  });
});

describe('GATE: ProPanel was decomposed', () => {
  /**
   * The panel that F5 had to touch, and could not.
   *
   * `h1-h2-scope-split.md` §1.6 names this file as one of the two with no line budget left in
   * the places the scope lands: 1 319 lines against a 600 ceiling, and the host of the report
   * button §5 needed. The ceiling was a repo-wide guideline with no gate on this file, which is
   * how it reached 1 319 in the first place — every other component under `pro/design` has had
   * one since PR15.
   */
  const panel = read('../../../components/pro/ProPanel.svelte');

  it('stays inside the 600-LOC component ceiling', () => {
    const loc = panel.split('\n').length;
    expect(loc, `ProPanel.svelte is ${loc} lines`).toBeLessThan(600);
  });

  it('delegates the catalogue, the overlay and the report assembly', () => {
    // The three responsibilities that left. Naming them individually is the point: a future
    // edit that inlines any one of them back is what the ceiling alone would only catch once
    // the file had already grown past 600.
    expect(panel, 'the example catalogue is data').toContain("from '../../lib/data/pro-examples'");
    expect(panel, 'the example gallery is its own overlay').toContain('<ProExampleMenu');
    expect(panel, 'the report is assembled outside the panel')
      .toContain("from '../../lib/engine/pro-report-inputs'");
  });

  it('keeps the pre-solve gate, which is the panel\'s own refusal', () => {
    // `handleSolve` routes to Diagnostics and refuses BEFORE running. Moving this out would
    // separate a command from the reason it is disabled, which is the defect this branch has
    // already fixed on `review-submit` and on `cmd-generate-detailing`.
    const code = stripComments(panel);
    expect(code).toContain('checkModel');
    expect(code).toContain("uiStore.proActiveTab = 'diagnostics'");
  });

  it('the extracted example catalogue carries no markup and one loader per fixture', () => {
    const examples = readCode('../../data/pro-examples.ts');
    const fixtures = [...examples.matchAll(/loadExample\('([^']+)'\)/g)].map(m => m[1]);
    expect(fixtures.length).toBeGreaterThan(10);
    expect(new Set(fixtures).size, 'two cards loading the same fixture').toBe(fixtures.length);
  });
});

describe('GATE: fixture corrections', () => {
  it('the flagship fixture authors gravity in the LOCAL Z component on every beam', () => {
    const f = JSON.parse(read('../../templates/fixtures/rc-design-frame.json'));
    const nodes = new Map(f.nodes.map((n: any) => [n.id, n]));
    const els = new Map(f.elements.map((e: any) => [e.id, e]));
    let horizontalGravity = 0;
    for (const l of f.loads) {
      if (l.type !== 'distributed3d') continue;
      const el: any = els.get(l.data.elementId);
      const a: any = nodes.get(el.nodeI); const b: any = nodes.get(el.nodeJ);
      const dz = Math.abs((b.z ?? 0) - (a.z ?? 0));
      const run = Math.hypot(b.x - a.x, b.y - a.y);
      if (dz > run) continue;                       // column
      if (l.data.qYI !== 0 || l.data.qYJ !== 0) horizontalGravity++;
    }
    // The original fixture put the 120 Y-beams' gravity into qY (horizontal).
    expect(horizontalGravity).toBe(0);
  });

  it('the flagship fixture ships load combinations', () => {
    const f = JSON.parse(read('../../templates/fixtures/rc-design-frame.json'));
    expect(f.combinations.length).toBeGreaterThanOrEqual(4);
    expect(f.combinations.every((c: any) => c.factors.length > 0)).toBe(true);
  });

  it('the QA fixture is small, complete and registered', () => {
    const f = JSON.parse(read('../../templates/fixtures/rc-design-qa-8.json'));
    expect(f.elements.length).toBe(8);
    expect(f.combinations.length).toBeGreaterThanOrEqual(3);
    expect(read('../../templates/fixture-index.ts')).toContain("'rc-design-qa-8'");
  });
});

describe('GATE: the stale-WASM misdiagnosis cannot silently return', () => {
  it('the global-Y raw-solver test is a normal test, not an expected failure', () => {
    const s = read('./solver-3d.test.ts');
    // CI (which rebuilds the WASM from the current engine source) proved there is no
    // solver defect: the divergence seen while authoring PR15 came from a stale local
    // binary. The test must therefore assert the correct behaviour normally.
    expect(s).toContain("it('horizontal displacement at top'");
    expect(s).not.toContain('it.fails');
    expect(s).toContain('const ux_expected = Px * L * L * L / (3 * E * Iz);');
    expect(s).toContain('npm run wasm');
  });

  it('the boundary coverage records the stale-binary finding and its symptom', () => {
    const s = read('../design/__tests__/orientation-boundary.test.ts');
    expect(s).toContain('STALE LOCAL WASM BINARY');
    expect(s).toContain('there is NO solver defect');
    expect(s).toContain('no axis swap');
    expect(s).toContain('npm run wasm');
  });
});
