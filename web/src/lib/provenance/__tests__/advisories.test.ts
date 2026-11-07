import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { ADVISORIES } from '../advisories';
import { RESULT_CHANGES } from '../full-registry';
import { FEATURE_IDS } from '../model-features';
import { REGISTRY_LOCALES, conditionGroups } from '../registry';
import type { SolveStamp } from '../solve-stamp';
import { modelStore } from '../../store/model.svelte';
import { recheckStore } from '../../store/recheck.svelte';
import { buildProjectFile, deserializeProject, serializeProject } from '../../store/file';
import { currentResultProvenance } from '../../store/result-provenance';
import RecheckNotice from '../../../components/RecheckNotice.svelte';
import { t } from '../../i18n';
import '../../store/index';

const versionOf = (id: string) => RESULT_CHANGES.changes.find((c) => c.id === id)!.resultsVersion;
const SPAN_FIX = versionOf('span-check-shear-thermal');
const HARMONIC_FROM = versionOf('harmonic-modal-residual-checked');
const HARMONIC_FIX = versionOf('harmonic-modal-or-direct-per-frequency');

function stamp(resultsVersion: number, analyses: SolveStamp['analyses'] = ['linear']): SolveStamp {
  return { ...recheckStore.capture()!, id: `old-${resultsVersion}`, resultsVersion, analyses };
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

async function reopen(resultsVersion: number, analyses?: SolveStamp['analyses']) {
  recheckStore.restoreStamp(stamp(resultsVersion, analyses));
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
    expect(banner()).toContain(t('recheck.advisoryBanner').replace('{names}', 'SA-2026-046'));
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
