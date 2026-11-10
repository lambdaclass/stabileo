/** The verdicts of the legacy-projects test (#718), and the negative tests that prove they fail. */
import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import type { ResultChange } from '../../provenance/registry';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import {
  againstExample, captureExample, currentFixtureBlob, declaresMove, fingerprintDifference, judge, modelFingerprint, migrationMessage, openAndSolve, openSession,
  readCorpusText, readManifest, readResults, savedFixture, unexplainedMessage,
} from '../legacy';
import type { Values } from '../capture-results';
import { modelStore } from '../../store/model.svelte';

const change = (id: string, quantities?: string[]): ResultChange => ({ ...RESULT_CHANGES.changes[0], id, resultsVersion: 1, quantities });
const designOnly = change('design-only');
const shellStresses = change('shell-stresses', ['quadStresses.sigmaXx', 'quadStresses.sigmaYy']);
const everything = change('everything', ['*']);
const refusals = change('refusals', ['solve.ok']);

const reference: Values = {
  'model.nodes': 4,
  'solve.ok': true,
  'base.allZero': false,
  'base.diagnosticCodes': 'warning:W1',
  'base.reactions[n1].rx': 5.684341886e-14,
  'base.reactions[n1].rz': 35,
  'base.reactions[n5].rz': 35,
  'base.elementForces[e1].nStart': 35,
  'base.elementForces[e1].mStart': 12,
  'base.quadStresses[e9].sigmaXx': 100,
  'base.quadStresses[e9].mx': 4,
};
const moved = (patch: Values): Values => ({ ...reference, ...patch });

describe('which values a registered change declares it moves', () => {
  it('reads "*", a collection, one field of it, solve.ok, errorCodes and unstableCombinations', () => {
    expect(declaresMove(everything, 'case[2].displacements[n3].uz')).toBe(true);
    expect(declaresMove(everything, 'base.allZero')).toBe(true);
    expect(declaresMove(change('u', ['unstableCombinations']), 'unstableCombinations')).toBe(true);
    expect(declaresMove(change('e', ['errorCodes']), 'combo[2].errorCodes')).toBe(true);
    expect(declaresMove(shellStresses, 'combo[1].quadStresses[e9].sigmaXx')).toBe(true);
    expect(declaresMove(change('c', ['reactions']), 'base.reactions[n1].fz')).toBe(true);
    expect(declaresMove(refusals, 'solve.ok')).toBe(true);
  });
  it('NEGATIVE: nothing else', () => {
    expect(declaresMove(shellStresses, 'base.quadStresses[e9].mx')).toBe(false);
    expect(declaresMove(shellStresses, 'base.elementForces[e1].mStart')).toBe(false);
    expect(declaresMove(designOnly, 'base.elementForces[e1].mStart')).toBe(false);
    expect(declaresMove(everything, 'solve.ok')).toBe(false);
    expect(declaresMove(everything, 'base.errorCodes')).toBe(false);
    expect(declaresMove(everything, 'case[1].errorCodes')).toBe(false);
    expect(declaresMove(everything, 'unstableCombinations')).toBe(false);
    expect(declaresMove(change('r', ['reactions']), 'unstableCombinations')).toBe(false);
    expect(declaresMove(everything, 'model.nodes')).toBe(false);
    expect(declaresMove(refusals, 'base.reactions[n1].rz')).toBe(false);
  });
});

describe('judge', () => {
  it('takes round-off in a component statics makes zero as the same result', () => {
    expect(judge('noise', reference, moved({ 'base.reactions[n1].rx': 7.105427358e-14 }), []).kind).toBe('same');
  });

  it('NEGATIVE: a real change in that component with no registered change fails', () => {
    const v = judge('real', reference, moved({ 'base.reactions[n1].rx': 0.01 }), []);
    expect(v.kind).toBe('unexplained');
    expect(v.report).toContain('base.reactions[n1].rx');
  });

  it('NEGATIVE: a wrong member force fails although unrelated registered changes apply', () => {
    const v = judge('wrong force', reference, moved({ 'base.elementForces[e1].mStart': 12.6 }), [designOnly, shellStresses]);
    expect(v.kind).toBe('unexplained');
    expect(v.report).toContain('base.elementForces[e1].mStart: 12 → 12.6');
    expect(v.applicable).toEqual(['design-only (results v1)', 'shell-stresses (results v1)']);
    expect(unexplainedMessage(v, 'v0.2.0')).toContain('none declares in its "quantities" that it moves them');
  });

  it('explains only the values the applicable entries declare, and reports the rest', () => {
    const ok = judge('stress', reference, moved({ 'base.quadStresses[e9].sigmaXx': 140 }), [designOnly, shellStresses]);
    expect(ok).toMatchObject({ kind: 'explained', explainedBy: ['shell-stresses (results v1)'] });
    const v = judge('stress and moment', reference, moved({ 'base.quadStresses[e9].sigmaXx': 140, 'base.quadStresses[e9].mx': 5 }), [shellStresses]);
    expect(v.kind).toBe('unexplained');
    expect(v.report).toContain('base.quadStresses[e9].mx');
    expect(v.report).not.toContain('sigmaXx');
  });

  it('NEGATIVE: a value no longer produced fails unless declared', () => {
    const { ['base.elementForces[e1].nStart']: _, ...without } = reference;
    expect(judge('removed', reference, without, [shellStresses]).kind).toBe('unexplained');
    expect(judge('removed', reference, without, [everything]).kind).toBe('explained');
  });

  it('NEGATIVE: a model count is not explained by a change to the numbers', () => {
    expect(judge('count', reference, moved({ 'model.nodes': 3 }), [everything]).kind).toBe('unexplained');
  });

  describe('a solve that now refuses, as capture records it (no result values)', () => {
    const refused: Values = { 'model.nodes': 4, 'solve.ok': false, 'solve.refusal': 'unstable' };
    it('NEGATIVE: is one refusal, unexplained by "*" or by a change to the numbers', () => {
      for (const changes of [[], [everything], [shellStresses, change('r', ['reactions', 'elementForces'])]]) {
        const v = judge('refuses', reference, refused, changes);
        expect(v).toMatchObject({ kind: 'unexplained', solve: 'now refuses' });
        expect(v.report).toContain('solve.ok: true → false');
        expect(v.report).toContain('the solve now refuses ("unstable")');
        expect(v.report).not.toContain('no longer produced');
      }
    });
    it('is explained by an entry that declares solve.ok, without listing every value it no longer gives', () => {
      const v = judge('refuses', reference, refused, [refusals]);
      expect(v).toMatchObject({ kind: 'explained', solve: 'now refuses', explainedBy: ['refusals (results v1)'] });
      expect(v.report).not.toContain('reactions');
    });
    it('NEGATIVE: a declared refusal does not excuse a model count', () => {
      expect(judge('refuses', reference, { ...refused, 'model.nodes': 3 }, [refusals]).kind).toBe('unexplained');
    });
    it('a solve that refused then and solves now is the same kind of verdict', () => {
      expect(judge('solves', refused, reference, [everything])).toMatchObject({ kind: 'unexplained', solve: 'now solves' });
      expect(judge('solves', refused, reference, [refusals])).toMatchObject({ kind: 'explained', solve: 'now solves' });
    });
  });

  describe('NEGATIVE: a value produced now and not then is a difference', () => {
    it('a combination that becomes unstable, unexplained by "*"', () => {
      for (const changes of [[], [everything]]) {
        const v = judge('unstable', reference, moved({ unstableCombinations: '3' }), changes);
        expect(v.kind).toBe('unexplained');
        expect(v.report).toContain('unstableCombinations: newly produced, "3"');
      }
      expect(judge('unstable', reference, moved({ unstableCombinations: '3' }), [change('u', ['unstableCombinations'])]).kind).toBe('explained');
    });
    it('a new result set with an error, unexplained by "*"', () => {
      const v = judge('new set', reference, moved({ 'case[2].diagnosticCodes': 'error:E9', 'case[2].reactions[n1].rz': 1 }), [everything]);
      expect(v.kind).toBe('unexplained');
      expect(v.report).toContain('case[2].errorCodes: newly produced, "error:E9"');
      expect(v.report).not.toContain('case[2].reactions');
    });
    it('a new numeric quantity, unless an applicable entry declares it', () => {
      const added = moved({ 'base.reactions[n1].mz': 7 });
      expect(judge('new value', reference, added, []).kind).toBe('unexplained');
      expect(judge('new value', reference, added, [shellStresses]).kind).toBe('unexplained');
      expect(judge('new value', reference, added, [change('r', ['reactions'])]).kind).toBe('explained');
    });
  });

  it('NEGATIVE: "*" does not excuse a new error diagnostic', () => {
    const v = judge('error', reference, moved({ 'base.diagnosticCodes': 'error:E1 warning:W1' }), [everything]);
    expect(v.kind).toBe('unexplained');
    expect(v.report).toContain('base.errorCodes: "" → "error:E1"');
    expect(judge('error', reference, moved({ 'base.diagnosticCodes': 'error:E1 warning:W1' }), [change('e', ['errorCodes'])]).kind).toBe('explained');
  });

  it('notes a refusal message present on one side only', () => {
    const v = judge('message', { 'solve.ok': false, 'solve.refusal': 'unstable' }, { 'solve.ok': false }, []);
    expect(v.notes).toEqual(['solve.refusal: "unstable" → null']);
  });
});

describe('against real corpus files', () => {
  beforeAll(async () => { await initSolver(); });

  it.skip('known wrong result: #1753 NEGATIVE: v0.2.0 truss with a wrong member force fails with the linear re-check notice', async () => {
    const opened = await openAndSolve(readCorpusText('v0.2.0/truss.ded'));
    expect(opened.changes.length).toBeGreaterThan(20);
    const then = readResults('v0.2.0/truss.results.json');
    expect(judge('truss', then, opened.values, opened.changes).kind).toBe('same');
    const wrong = { ...then, 'base.elementForces[e1].nStart': (then['base.elementForces[e1].nStart'] as number) * 1.01 };
    expect(opened.changes.map((c) => c.id)).toContain('linear-stability-refusals');
    const v = judge('truss, wrong force', wrong, opened.values, opened.changes);
    expect(v.kind).toBe('unexplained');
    expect(v.report).toContain('base.elementForces[e1].nStart');
  }, 120_000);

  it.skip('known wrong result: #1753 NEGATIVE: v0.4.0 deep-beam-shell: with the linear re-check notice, only stresses are explained', async () => {
    const entry = readManifest('v0.4.0').examples.find((e) => e.example === 'deep-beam-shell')!;
    const opened = await openAndSolve(readCorpusText(`v0.4.0/${entry.file}`));
    expect(opened.changes.map((c) => c.id)).toEqual([
      'solid-shell-local-stress-axes', 'modal-repeated-eigenspace-completeness', 'static-modal-runtime-self-checks',
      'shell-envelope-per-component', 'modal-mechanism-refused', 'shell-figures-paint-the-screen-field', 'safety-containment-diagnostics',
      'harmonic-modal-residual-checked',
      'soft-rotation-not-orphan', 'linear-small-displacement-warning', 'harmonic-modal-or-direct-per-frequency', 'combined-shell-stresses', 'linear-stability-refusals',
    ]);
    const then = readResults(`v0.4.0/${entry.results}`);
    const stress = Object.keys(then).find((k) => /^base\.quadStresses\[[^\]]+\]\.sigmaXx$/.test(k))!;
    const disp = Object.keys(then).find((k) => /^base\.displacements\[[^\]]+\]\.uz$/.test(k) && then[k] !== 0)!;
    const scaled = (k: string) => ({ ...then, [k]: (then[k] as number) * 1.05 });
    expect(judge('stress', scaled(stress), opened.values, opened.changes).kind).toBe('explained');
    const v = judge('displacement', scaled(disp), opened.values, opened.changes);
    expect(v.kind).toBe('unexplained');
    expect(v.report).toContain(disp);
  }, 120_000);

  it('NEGATIVE: a migration that drops a load differs from today\'s example, and no registered change can excuse it', async () => {
    const m = readManifest('v0.2.0');
    const entry = m.examples.find((e) => e.example === 'truss')!;
    const now = await captureExample('truss', entry.workspace);
    const broken = await openAndSolve(readCorpusText(`v0.2.0/${entry.file}`), {
      beforeOpen: (f) => { const s = f.snapshot as { loads: unknown[] }; s.loads = s.loads.slice(1); },
    });
    expect(broken.changes.length).toBeGreaterThan(0);
    const v = judge('truss against today\'s truss', now, broken.values, []);
    expect(v.kind).toBe('unexplained');
    expect(migrationMessage(v, 'v0.2.0')).toContain('no registered result change explains it');
  }, 120_000);

  describe('a large example, opened but not solved, is compared with its example as a model', () => {
    type Snapshot = {
      nodes: Array<[number, { x: number }]>;
      loads: Array<{ type: string; data: Record<string, number> }>;
      elements: Array<[number, { sectionId: number; releaseI?: Record<string, boolean> }]>;
      supports: Array<[number, { type: string }]>;
    };
    const tower = readManifest('v0.2.0').examples.find((e) => e.example === 'torre-irregular-con-retiros')!;
    const open = (edit?: (s: Snapshot) => void) => openAndSolve(readCorpusText(`v0.2.0/${tower.file}`), {
      solve: false, beforeOpen: edit && ((f) => edit(f.snapshot as Snapshot)),
    });

    it('the tower as saved is the same model', async () => {
      expect(tower.results).toBeNull();
      expect(tower.model.elements).toBeGreaterThan(1000);
      const opened = await open();
      expect(Object.keys(opened.fingerprint).filter((k) => k.startsWith('loads[')).length).toBeGreaterThan(8);
      expect(await againstExample('tower', 'v0.2.0', tower, opened, false)).toMatchObject({ failure: null });
    }, 120_000);

    it('NEGATIVE: a migration that drops one of its 1696 loads fails', async () => {
      const opened = await open((s) => { s.loads.pop(); });
      const { failure } = await againstExample('tower', 'v0.2.0', tower, opened, false);
      expect(failure).toContain('loads[3].nodal3d.count: 20 → 19');
      expect(failure).toContain('Fix the migration');
    }, 120_000);

    it('NEGATIVE: one load 1 % larger fails', async () => {
      const opened = await open((s) => { const d = s.loads[0].data; d.qZI *= 1.01; d.qZJ *= 1.01; });
      const { failure } = await againstExample('tower', 'v0.2.0', tower, opened, false);
      expect(failure).toContain('loads[1].distributed3d.qZI');
      expect(failure).toContain('loads[1].distributed3d.qZJ');
    }, 120_000);

    it('NEGATIVE: a member given another section fails', async () => {
      const opened = await open((s) => { const e = s.elements[0][1]; e.sectionId = e.sectionId === 2 ? 3 : 2; });
      expect((await againstExample('tower', 'v0.2.0', tower, opened, false)).failure).toContain('element[1].section');
    }, 120_000);

    it('NEGATIVE: a node moved 1 cm fails', async () => {
      const opened = await open((s) => { s.nodes[0][1].x += 0.01; });
      expect((await againstExample('tower', 'v0.2.0', tower, opened, false)).failure).toMatch(/node\[\d+\]\.x/);
    }, 120_000);

    it('NEGATIVE: a hinge added at a member end fails', async () => {
      const opened = await open((s) => { const e = s.elements[0][1]; e.releaseI = { ...(e.releaseI ?? {}), my: !e.releaseI?.my }; });
      expect((await againstExample('tower', 'v0.2.0', tower, opened, false)).failure).toContain('element[1].releaseI');
    }, 120_000);

    it('NEGATIVE: a load moved onto another member, every total unchanged, fails', async () => {
      const opened = await open((s) => {
        const a = s.loads.find((l) => l.type === 'distributed3d')!;
        const loaded = new Set(s.loads.filter((l) => l.type === a.type && l.data.caseId === a.data.caseId).map((l) => l.data.elementId));
        a.data.elementId = s.elements.map(([id]) => id).find((id) => !loaded.has(id))!;
      });
      const { failure } = await againstExample('tower', 'v0.2.0', tower, opened, false);
      expect(failure).toMatch(/loads\[\d+\]\.distributed3d\[elementId=\d+\]/);
      expect(failure).not.toMatch(/loads\[\d+\]\.distributed3d\.(count|qZI):/);
    }, 120_000);

    it('NEGATIVE: two members\' loads swapped (+q and −q totals unchanged) fails', async () => {
      const opened = await open((s) => {
        const loads = s.loads.filter((l) => l.type === 'distributed3d' && l.data.caseId === s.loads[0].data.caseId);
        const b = loads.find((l) => l.data.elementId !== loads[0].data.elementId && l.data.qZI !== loads[0].data.qZI)!;
        [loads[0].data.elementId, b.data.elementId] = [b.data.elementId, loads[0].data.elementId];
      });
      expect((await againstExample('tower', 'v0.2.0', tower, opened, false)).failure).toMatch(/distributed3d\[elementId=\d+\]\.loads/);
    }, 120_000);

    it('NEGATIVE: two loads on one member trading their end values, every count and sum unchanged, fails', async () => {
      await open();
      const fingerprintWith = (ends: Array<[number, number]>) => {
        const base = modelStore.loads.filter((l) => (l.data as { id: number }).id < 1_000_000);
        modelStore.loads.splice(0, modelStore.loads.length, ...base, ...ends.map(([qZI, qZJ], i) => ({
          type: 'distributed3d', data: { id: 1_000_000 + i, elementId: 1, qYI: 0, qYJ: 0, qZI, qZJ, caseId: 1 },
        }) as never));
        return modelFingerprint();
      };
      const reference = fingerprintWith([[-5, -5], [-10, -10]]);
      const migrated = fingerprintWith([[-5, -10], [-10, -5]]);
      expect(migrated['loads[1].distributed3d.qZI']).toBe(reference['loads[1].distributed3d.qZI']);
      expect(fingerprintDifference('swap', reference, migrated)).toMatch(/distributed3d\[elementId=1\]\.loads/);
      expect(fingerprintDifference('same', reference, fingerprintWith([[-10, -10], [-5, -5]]))).toBeNull();
    }, 120_000);

    it('NEGATIVE: a support released from fixed to pinned fails', async () => {
      const opened = await open((s) => { s.supports[0][1].type = 'pinned3d'; });
      expect((await againstExample('tower', 'v0.2.0', tower, opened, false)).failure).toContain('support[1].type');
    }, 120_000);
  });

  describe('an example edited since the release is compared with the fixture that release saved', () => {
    const arch = readManifest('v0.2.0').examples.find((e) => e.example === 'hinged-arch-3d')!;

    it('its recorded fixture is that release\'s, and the file is the same model and results', async () => {
      expect(arch.fixtureBlob).not.toBe(currentFixtureBlob('hinged-arch-3d'));
      expect(savedFixture('hinged-arch-3d', arch.fixtureBlob).edited).toBe(true);
      const opened = await openAndSolve(readCorpusText(`v0.2.0/${arch.file}`));
      expect(await againstExample('hinged-arch', 'v0.2.0', arch, opened, true)).toMatchObject({ failure: null, verdict: { kind: 'same' } });
    }, 120_000);

    it('NEGATIVE: against today\'s edited example it differs, so the comparison is not vacuous', async () => {
      const opened = await openAndSolve(readCorpusText(`v0.2.0/${arch.file}`));
      const { failure } = await againstExample('hinged-arch', 'v0.2.0', { ...arch, fixtureBlob: currentFixtureBlob('hinged-arch-3d')! }, opened, true);
      expect(failure).toContain('loads[1].distributed3d.qZI');
    }, 120_000);

    describe('an example whose combinations were since rebuilt for its cases (3d-nave-industrial)', () => {
      const shed = readManifest('v0.4.0').examples.find((e) => e.example === '3d-nave-industrial')!;

      it('is compared with its combinations as v0.4.0 loaded them, and is the same model and results', async () => {
        expect(savedFixture('3d-nave-industrial', shed.fixtureBlob).edited).toBe(true);
        const opened = await openAndSolve(readCorpusText(`v0.4.0/${shed.file}`));
        expect(await againstExample('shed', 'v0.4.0', shed, opened, true)).toMatchObject({ failure: null, verdict: { kind: 'same' } });
      }, 120_000);

      it('NEGATIVE: loaded by today\'s loader, its rebuilt combinations differ from the file\'s', async () => {
        const opened = await openAndSolve(readCorpusText(`v0.4.0/${shed.file}`));
        const { failure } = await againstExample('shed', 'v9.9.9', shed, opened, false);
        expect(failure).toContain('combination[1].factors: "1:1.4" → "1:1.2 2:1.6"');
      }, 120_000);
    });

    it('NEGATIVE: a fixture edit with no recorded fixture fails', () => {
      expect(() => savedFixture('hinged-arch-3d', '0'.repeat(40))).toThrow(/does not record it/);
    });
  });

  describe('a session file\'s tabs are compared with their examples', () => {
    const m = readManifest('v0.4.0');
    const entry = (i: number) => {
      const tab = m.session.tabs![i];
      return { ...m.examples.find((e) => e.example === tab.id)!, workspace: tab.workspace };
    };
    type Session = { tabs: Array<{ modelSnapshot: { loads: unknown[] } }> };

    it('every tab of the v0.4.0 session is its example, model and results', async () => {
      const { tabs } = await openSession(readCorpusText(`v0.4.0/${m.session.file}`));
      expect(tabs).toHaveLength(3);
      for (const [i, tab] of tabs.entries()) {
        expect(await againstExample(`tab ${i + 1}`, 'v0.4.0', entry(i), tab, true)).toMatchObject({ failure: null, verdict: { kind: 'same' } });
      }
    }, 120_000);

    it('NEGATIVE: a migration that drops a load in a session tab fails, with no registered change to excuse it', async () => {
      const { tabs } = await openSession(readCorpusText(`v0.4.0/${m.session.file}`), {
        beforeOpen: (f) => { const t = (f as Session).tabs[1].modelSnapshot; t.loads = t.loads.slice(1); },
      });
      const { failure } = await againstExample('tab 2', 'v0.4.0', entry(1), tabs[1], true);
      expect(failure).toContain('loads[1].distributed3d.count: 2 → 1');
      expect(failure).toContain('loads[1].distributed3d.qZI: -20 → -10');
      const results = judge('tab 2 against today', await captureExample('3d-portal-frame', '3d'), tabs[1].values, []);
      expect(results.kind).toBe('unexplained');
    }, 120_000);
  });
});

