/** The verdicts of the legacy-projects test (#718), and the negative tests that prove they fail. */
import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import type { ResultChange } from '../../provenance/registry';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import {
  captureExample, declaresMove, judge, migrationMessage, openAndSolve, readCorpusText, readManifest, readResults,
  unexplainedMessage,
} from '../legacy';
import type { Values } from '../capture-results';

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

  it('NEGATIVE: v0.2.0 truss with a wrong member force fails, though 31 registered changes apply to it', async () => {
    const opened = await openAndSolve(readCorpusText('v0.2.0/truss.ded'));
    expect(opened.changes.length).toBeGreaterThan(20);
    const then = readResults('v0.2.0/truss.results.json');
    expect(judge('truss', then, opened.values, opened.changes).kind).toBe('same');
    const wrong = { ...then, 'base.elementForces[e1].nStart': (then['base.elementForces[e1].nStart'] as number) * 1.01 };
    const v = judge('truss, wrong force', wrong, opened.values, opened.changes);
    expect(v.kind).toBe('unexplained');
    expect(v.report).toContain('base.elementForces[e1].nStart');
  }, 120_000);

  it('NEGATIVE: v0.4.0 deep-beam-shell: the solid-shell stress change explains its stresses, not a wrong displacement', async () => {
    const entry = readManifest('v0.4.0').examples.find((e) => e.example === 'deep-beam-shell')!;
    const opened = await openAndSolve(readCorpusText(`v0.4.0/${entry.file}`));
    expect(opened.changes.map((c) => c.id)).toEqual(['solid-shell-local-stress-axes']);
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
});
