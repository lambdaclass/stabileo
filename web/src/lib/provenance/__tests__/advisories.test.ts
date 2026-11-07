import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { ADVISORIES } from '../advisories';
import { RESULT_CHANGES } from '../full-registry';
import { FEATURE_IDS } from '../model-features';
import { REGISTRY_LOCALES, conditionGroups, registryLocale } from '../registry';
import type { SolveStamp } from '../solve-stamp';
import { modelStore } from '../../store/model.svelte';
import { recheckStore } from '../../store/recheck.svelte';
import { buildProjectFile, deserializeProject, serializeProject } from '../../store/file';
import { currentResultProvenance } from '../../store/result-provenance';
import RecheckNotice from '../../../components/RecheckNotice.svelte';
import { i18n, t } from '../../i18n';
import '../../store/index';

const versionOf = (id: string) => RESULT_CHANGES.changes.find((c) => c.id === id)!.resultsVersion;
const SPAN_FIX = versionOf('span-check-shear-thermal');
const HARMONIC_FROM = versionOf('harmonic-modal-residual-checked');
const HARMONIC_FIX = versionOf('harmonic-modal-or-direct-per-frequency');
const SHELL_FIX = versionOf('combined-shell-stresses');

function stamp(resultsVersion: number, analyses: SolveStamp['analyses'] = ['linear'], recorded?: SolveStamp['recorded']): SolveStamp {
  const { recorded: _current, ...rest } = recheckStore.capture()!;
  return { ...rest, id: `old-${resultsVersion}`, resultsVersion, analyses, ...(recorded ? { recorded } : {}) };
}

function frame(opts: { shear?: boolean; thermal?: boolean; hinge?: boolean } = {}) {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed');
  if (opts.shear) {
    const section = modelStore.model.elements.get(e)!.sectionId;
    modelStore.updateSection(section, { shearAreas: { basis: 'declared', asY: 0.01, asZ: 0.01 } });
  }
  if (opts.hinge) modelStore.toggleHinge(e, 'end');
  if (opts.thermal) modelStore.addThermalLoad(e, 0, 30);
  return e;
}

function slab(opts: { imposed?: boolean; settlement?: boolean; combinations?: boolean } = {}) {
  modelStore.clear();
  const n = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const mat = modelStore.addMaterial({ name: 'H', e: 25000, nu: 0.2, rho: 0 });
  modelStore.addQuad(n as [number, number, number, number], mat, 0.2);
  modelStore.addSupport(n[0]!, 'fixed3d');
  modelStore.addSupport(n[1]!, 'fixed3d');
  const sup = modelStore.addSupport(n[2]!, 'pinned3d');
  if (opts.settlement) modelStore.updateSupport(sup, { dz: -0.01 });
  const [c1, c2] = modelStore.model.loadCases;
  if (opts.imposed) modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: n[2]!, dz: -0.01, caseId: c1!.id } });
  modelStore.addNodalLoad3D(n[3]!, 0, 0, -10, 0, 0, 0, c2!.id);
  if (opts.combinations ?? true) modelStore.addCombination('1.2 D + 1.6 L', [{ caseId: c1!.id, factor: 1.2 }, { caseId: c2!.id, factor: 1.6 }]);
  else for (const c of [...modelStore.model.combinations]) modelStore.removeCombination(c.id);
  return { corner: n[2]!, c1: c1!.id };
}

async function reopen(resultsVersion: number, analyses?: SolveStamp['analyses'], recorded?: SolveStamp['recorded']) {
  recheckStore.restoreStamp(stamp(resultsVersion, analyses, recorded));
  const text = serializeProject();
  recheckStore.reset();
  expect(deserializeProject(text)).toBe(true);
  await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
  return recheckStore.assessment!.advisories.map((a) => a.id);
}

const banner = () => render(RecheckNotice).body;

describe('advisories', () => {
  beforeEach(() => recheckStore.reset());

  it('name result changes in the registry, fixed after they were introduced, with known features and every language', () => {
    const features = new Set<string>(FEATURE_IDS);
    for (const a of ADVISORIES) {
      expect(RESULT_CHANGES.changes.some((c) => c.id === a.fixedBy), a.id).toBe(true);
      if (a.introducedBy !== null) expect(versionOf(a.introducedBy), a.id).toBeLessThan(versionOf(a.fixedBy));
      expect(a.when.length, a.id).toBeGreaterThan(0);
      for (const w of a.when) for (const f of conditionGroups(w).flat()) expect(features.has(f), `${a.id}: ${f}`).toBe(true);
      for (const l of REGISTRY_LOCALES) expect(a.title[l], `${a.id} ${l}`).toBeTruthy();
      if (a.analysis || a.certain) for (const l of REGISTRY_LOCALES) expect(a.ifUsed?.[l], `${a.id} ifUsed ${l}`).toBeTruthy();
      for (const w of a.certain ?? []) for (const f of conditionGroups(w).flat()) expect(features.has(f), `${a.id}: ${f}`).toBe(true);
      if (a.analysis) {
        for (const w of a.when) expect(conditionGroups(w).some((g) => g.length === 1 && g[0] === `analysis:${a.analysis}`), `${a.id} when`).toBe(true);
      }
    }
  });

  it('a model solved before the span check fix, with shear areas, opens with the advisory and keeps it after the notice is read', async () => {
    frame({ shear: true });
    expect(await reopen(SPAN_FIX - 1)).toContain('issue-1569');
    expect(recheckStore.noticeOpen).toBe(true);
    recheckStore.acknowledge();
    expect(recheckStore.stale).toBe(true);
    const html = banner();
    expect(html).toContain('data-testid="recheck-advisory-banner"');
    expect(html).toContain('#1569');
    expect(html).toContain('role="alert"');
  });

  it('flags the thermal curvature at a release only where a member has both', async () => {
    frame({ thermal: true, hinge: true });
    expect(await reopen(SPAN_FIX - 1)).toContain('issue-1569');
    frame({ thermal: true });
    expect(await reopen(SPAN_FIX - 1)).not.toContain('issue-1569');
    const heated = frame({ thermal: true });
    const b = modelStore.addNode(8, 0, 0);
    const released = modelStore.addElement(modelStore.model.elements.get(heated)!.nodeJ, b, 'frame');
    modelStore.toggleHinge(released, 'end');
    expect(await reopen(SPAN_FIX - 1), 'a release on one member and a thermal load on another').not.toContain('issue-1569');
  });

  it('the same model without the affected feature has no advisory, though the result change is still listed', async () => {
    frame();
    expect(await reopen(SPAN_FIX - 1)).toEqual([]);
    expect(recheckStore.assessment!.changes.map((c) => c.id)).toContain('span-check-shear-thermal');
    recheckStore.acknowledge();
    expect(banner()).not.toContain('recheck-advisory-banner');
  });

  it('a model solved with the fix has no advisory', async () => {
    frame({ shear: true });
    expect(await reopen(SPAN_FIX)).not.toContain('issue-1569');
  });

  it('solving the model again clears the advisory', async () => {
    frame({ shear: true });
    await reopen(SPAN_FIX - 1);
    recheckStore.acknowledge();
    expect(banner()).toContain('recheck-advisory-banner');
    recheckStore.noteSolved('linear');
    expect(recheckStore.stale).toBe(false);
    expect(banner()).not.toContain('recheck-advisory-banner');
  });

  it('flags harmonic results only from the versions between the change that introduced the bug and its fix', async () => {
    frame();
    expect(await reopen(HARMONIC_FROM - 1, ['linear', 'harmonic'])).not.toContain('SA-2026-046');
    expect(await reopen(HARMONIC_FROM, ['linear', 'harmonic'])).toContain('SA-2026-046');
    expect(await reopen(HARMONIC_FIX - 1, ['linear', 'harmonic'])).toContain('SA-2026-046');
    expect(await reopen(HARMONIC_FIX, ['linear', 'harmonic'])).not.toContain('SA-2026-046');
    await reopen(HARMONIC_FROM, ['linear', 'harmonic']);
    recheckStore.acknowledge();
    const harmonic = ADVISORIES.find((x) => x.id === 'SA-2026-046')!;
    const html = banner();
    expect(html, 'nothing saved says a harmonic analysis ran: the warning says it may apply').toContain(
      t('recheck.advisoryBannerMaybe').replace('{name}', 'SA-2026-046').replace('{analysis}', harmonic.ifUsed![registryLocale(i18n.locale)]),
    );
    expect(html).not.toContain(t('recheck.advisoryBanner').replace('{names}', 'SA-2026-046'));
  });

  it('a static solve leaves a harmonic advisory up; running harmonic analysis again clears it', async () => {
    frame();
    expect(await reopen(HARMONIC_FROM, ['linear', 'harmonic'])).toContain('SA-2026-046');
    recheckStore.acknowledge();
    recheckStore.noteSolved('linear');
    expect(recheckStore.stale).toBe(true);
    expect(recheckStore.solvedAgain).toBe(true);
    expect(recheckStore.openAdvisories.map((a) => a.id)).toEqual(['SA-2026-046']);
    const html = banner();
    expect(html).toContain('recheck-advisory-banner');
    expect(html).toContain('SA-2026-046');
    expect(html, 'a static solve does not clear it, so the banner does not offer one').not.toContain('recheck-banner-rerun');
    recheckStore.noteSolved('harmonic');
    expect(recheckStore.openAdvisories).toEqual([]);
    expect(recheckStore.stale).toBe(false);
    expect(banner()).not.toContain('recheck-advisory-banner');
  });

  it('a harmonic run alone clears the harmonic advisory but not a static one', async () => {
    frame({ shear: true });
    const both = await reopen(HARMONIC_FROM, ['linear', 'harmonic']);
    expect(both).toEqual(expect.arrayContaining(['SA-2026-046', 'issue-1569']));
    recheckStore.acknowledge();
    recheckStore.noteSolved('harmonic');
    expect(recheckStore.openAdvisories.map((a) => a.id)).toEqual(['issue-1569']);
    expect(recheckStore.stale).toBe(true);
    recheckStore.noteSolved('linear');
    expect(recheckStore.stale).toBe(false);
  });

  it.each([
    ['a static solve', 'linear', ['SA-2026-046']],
    ['a harmonic run', 'harmonic', ['issue-1569']],
  ] as const)('after %s, saving and reopening keeps up the advisories still not run again', async (_label, kind, open) => {
    frame({ shear: true });
    await reopen(HARMONIC_FROM, ['linear', 'harmonic']);
    recheckStore.acknowledge();
    recheckStore.noteSolved(kind);
    const text = serializeProject();
    expect(JSON.parse(text).snapshot.pendingRecheckNotice.stamp.id).toBe(`old-${HARMONIC_FROM}`);
    recheckStore.reset();
    expect(deserializeProject(text)).toBe(true);
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.openAdvisories.map((a) => a.id)).toEqual(open);
    expect(recheckStore.stale).toBe(true);
    recheckStore.noteSolved(kind === 'linear' ? 'harmonic' : 'linear');
    expect(recheckStore.stale).toBe(false);
    expect(JSON.parse(serializeProject()).snapshot.pendingRecheckNotice).toBeUndefined();
  });

  it('says the results are affected when the stamp records that harmonic analysis ran, and nothing when it records it did not', async () => {
    frame();
    const all: SolveStamp['recorded'] = ['linear', 'pdelta', 'modal', 'buckling', 'spectral', 'timeHistory', 'plastic', 'nonlinear', 'harmonic', 'ssi'];
    expect(await reopen(HARMONIC_FROM, ['linear'], all), 'recorded and not run').not.toContain('SA-2026-046');
    expect(await reopen(HARMONIC_FROM, ['linear', 'harmonic'], all)).toContain('SA-2026-046');
    expect(recheckStore.assessment!.maybe).toEqual([]);
    recheckStore.acknowledge();
    const harmonic = ADVISORIES.find((x) => x.id === 'SA-2026-046')!;
    const html = banner();
    expect(html).toContain(t('recheck.advisoryAnalysis').replace('{name}', 'SA-2026-046').replace('{analysis}', harmonic.ifUsed![registryLocale(i18n.locale)]));
    expect(html).not.toContain(t('recheck.advisoryBannerMaybe').replace('{name}', 'SA-2026-046').replace('{analysis}', harmonic.ifUsed![registryLocale(i18n.locale)]));
    expect(await reopen(HARMONIC_FROM, ['linear'], ['linear', 'pdelta', 'modal', 'buckling', 'plastic', 'spectral']), 'a stamp that does not record harmonic').toContain('SA-2026-046');
    expect(recheckStore.assessment!.maybe).toEqual(['SA-2026-046']);
  });

  it('a project saved before stamps recorded every analysis still opens, and still counts harmonic as run', async () => {
    frame();
    recheckStore.restoreStamp(stamp(HARMONIC_FROM, ['linear']));
    const file = JSON.parse(serializeProject());
    expect(file.snapshot.solvedWith.recorded).toBeUndefined();
    recheckStore.reset();
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.capture()!.recorded).toBeUndefined();
    expect(recheckStore.assessment!.advisories.map((a) => a.id)).toContain('SA-2026-046');
    expect(recheckStore.assessment!.maybe).toEqual(['SA-2026-046']);
  });

  it('records a harmonic run in the stamp, and the stamp keeps it through save and load', async () => {
    frame();
    recheckStore.noteSolved('linear');
    recheckStore.noteSolved('harmonic');
    const solved = recheckStore.capture()!;
    expect(solved.analyses).toEqual(['harmonic', 'linear']);
    expect(solved.recorded).toContain('harmonic');
    const text = serializeProject();
    recheckStore.reset();
    expect(deserializeProject(text)).toBe(true);
    expect(recheckStore.capture()).toEqual(solved);
  });

  it('a shell model with a load case that imposes a displacement and combinations, solved before the fix, is affected', async () => {
    slab({ imposed: true });
    expect(await reopen(SHELL_FIX - 1)).toContain('SA-2026-047');
    expect(recheckStore.assessment!.maybe).not.toContain('SA-2026-047');
    recheckStore.acknowledge();
    const html = banner();
    expect(html).toContain(t('recheck.advisoryBanner').replace('{names}', 'SA-2026-047'));
    expect(html).not.toContain(t('recheck.advisoryBannerMaybeIf').replace('{name}', 'SA-2026-047').split(':')[0]);
    recheckStore.noteSolved('linear');
    expect(recheckStore.openAdvisories.map((a) => a.id)).not.toContain('SA-2026-047');
  });

  it.each([
    ['without an imposed displacement', {}],
    ['with a support settlement and no imposed displacement in a case', { settlement: true }],
    ['with an imposed displacement and no combinations, which the solve without them handles', { imposed: true, combinations: false }],
  ] as const)('a shell model %s, solved before the fix, may be affected', async (_label, opts) => {
    slab(opts);
    expect(await reopen(SHELL_FIX - 1)).toContain('SA-2026-047');
    expect(recheckStore.assessment!.maybe).toEqual(['SA-2026-047']);
    recheckStore.acknowledge();
    const shell = ADVISORIES.find((x) => x.id === 'SA-2026-047')!;
    const html = banner();
    expect(html).toContain(t('recheck.advisoryBannerMaybeIf').replace('{name}', 'SA-2026-047').replace('{analysis}', shell.ifUsed![registryLocale(i18n.locale)]));
    expect(html).not.toContain(t('recheck.advisoryBanner').replace('{names}', 'SA-2026-047'));
  });

  it('a model without shells is not warned, even with an imposed displacement and a settlement', async () => {
    const e = frame();
    const node = modelStore.model.elements.get(e)!.nodeJ;
    modelStore.updateSupport(modelStore.addSupport(node, 'pinned3d'), { dz: -0.01 });
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: node, dz: -0.01, caseId: modelStore.model.loadCases[0]!.id } });
    expect(await reopen(SHELL_FIX - 1)).not.toContain('SA-2026-047');
    expect(await reopen(0)).not.toContain('SA-2026-047');
  });

  it('a shell model solved with the fix, or opened with no stamp at all, is warned only before the fix', async () => {
    slab({ imposed: true });
    expect(await reopen(SHELL_FIX)).not.toContain('SA-2026-047');
    expect(await reopen(0)).toContain('SA-2026-047');
    expect(await reopen(1)).toContain('SA-2026-047');
  });

  it('an imposed displacement of zero does not make the model affected', async () => {
    const { corner, c1 } = slab();
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: corner, dz: 0, caseId: c1 } });
    await reopen(SHELL_FIX - 1);
    expect(recheckStore.assessment!.maybe).toEqual(['SA-2026-047']);
  });

  it('keeps the version stamp through save, load and export', async () => {
    frame({ shear: true });
    const old = stamp(SPAN_FIX - 1);
    recheckStore.restoreStamp(old);
    const text = serializeProject();
    expect(JSON.parse(text).snapshot.solvedWith).toEqual(old);
    recheckStore.reset();
    expect(deserializeProject(text)).toBe(true);
    expect(recheckStore.capture()).toEqual(old);
    expect(buildProjectFile().snapshot.solvedWith).toEqual(old);
    const { resultsVersion, commit, engineVersion, solvedAt } = old;
    expect(currentResultProvenance().solvedWith).toEqual({ resultsVersion, commit, engineVersion, solvedAt });
  });
});
