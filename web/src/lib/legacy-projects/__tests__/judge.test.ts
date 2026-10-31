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
  it('reads "*", a collection, one field of it, and solve.ok', () => {
    expect(declaresMove(everything, 'case[2].displacements[n3].uz')).toBe(true);
    expect(declaresMove(everything, 'unstableCombinations')).toBe(true);
    expect(declaresMove(shellStresses, 'combo[1].quadStresses[e9].sigmaXx')).toBe(true);
    expect(declaresMove(change('c', ['reactions']), 'base.reactions[n1].fz')).toBe(true);
    expect(declaresMove(refusals, 'solve.ok')).toBe(true);
  });
  it('NEGATIVE: nothing else', () => {
    expect(declaresMove(shellStresses, 'base.quadStresses[e9].mx')).toBe(false);
    expect(declaresMove(shellStresses, 'base.elementForces[e1].mStart')).toBe(false);
    expect(declaresMove(designOnly, 'base.elementForces[e1].mStart')).toBe(false);
    expect(declaresMove(everything, 'solve.ok')).toBe(false);
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

  it('NEGATIVE: a model count or a solve that now refuses is not explained by a change to the numbers', () => {
    expect(judge('count', reference, moved({ 'model.nodes': 3 }), [everything]).kind).toBe('unexplained');
    expect(judge('refuses', reference, moved({ 'solve.ok': false, 'solve.refusal': 'unstable' }), [everything]).kind).toBe('unexplained');
    expect(judge('refuses', reference, moved({ 'solve.ok': false, 'solve.refusal': 'unstable' }), [refusals]).kind).toBe('explained');
  });

  it('NEGATIVE: a new error diagnostic fails with the same numbers; a new warning is a note', () => {
    const err = judge('error', reference, moved({ 'base.diagnosticCodes': 'error:E1 warning:W1' }), []);
    expect(err.kind).toBe('unexplained');
    expect(err.report).toContain('base.errorCodes: "" → "error:E1"');
    const warn = judge('warning', reference, moved({ 'base.diagnosticCodes': 'warning:W1 warning:W2' }), []);
    expect(warn.kind).toBe('same');
    expect(warn.notes).toEqual(['base.diagnosticCodes: "warning:W1" → "warning:W1 warning:W2"']);
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
    expect(judge('truss', then, opened.values, opened.changes).kind).not.toBe('unexplained');
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
