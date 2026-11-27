import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../engine/steps/methods';
import { allMethods, methodsIn } from '../../engine/steps/registry';
import { ADV_FUNCTIONS, ADV_GROUPS, linkedMethods, ownerOfMethod, unavailable } from '../catalog';
import { DICTS, LOCALES } from './dictionaries';

const toolbar = readFileSync(new URL('../../../components/toolbar/ToolbarAdvanced.svelte', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('../../../components/advanced/AdvancedLauncher.svelte', import.meta.url), 'utf8');
const thumbs = readFileSync(new URL('../../../components/advanced/AdvThumb.svelte', import.meta.url), 'utf8');

describe('advanced functions catalog', () => {
  it('gives every function a group, a drawing and its words in every complete language', () => {
    expect(new Set(ADV_FUNCTIONS.map((f) => f.id)).size).toBe(ADV_FUNCTIONS.length);
    for (const f of ADV_FUNCTIONS) {
      expect(ADV_GROUPS, f.id).toContain(f.group);
      expect(thumbs, `${f.id} has no drawing`).toContain(`id === '${f.thumb}'`);
      expect(f.keywords.length, `${f.id} has no aliases`).toBeGreaterThan(0);
      const keys = [f.titleKey, `advCat.fn.${f.id}.desc`, `advCat.group.${f.group}`, ...(f.helpKey ? [f.helpKey] : [])];
      for (const loc of LOCALES) for (const k of keys) expect(DICTS[loc][k], `${loc}: ${k}`).toBeTruthy();
    }
  });

  it('leaves no group empty', () => {
    for (const g of ADV_GROUPS) expect(ADV_FUNCTIONS.some((f) => f.group === g), g).toBe(true);
  });

  it('reaches every explained method from some function, and links only methods that exist', () => {
    const registered = allMethods().map((m) => m.id);
    expect(new Set(linkedMethods())).toEqual(new Set(registered));
    for (const id of registered) expect(ownerOfMethod(id), id).toBeTruthy();
  });

  it('lists in each step-by-step topic exactly the methods of its catalog group', () => {
    for (const f of ADV_FUNCTIONS.filter((x) => x.stepsGroup)) {
      expect([...f.steps].sort(), f.id).toEqual(methodsIn(f.stepsGroup!).map((m) => m.id).sort());
    }
  });

  it('links an analysis to the methods that explain it', () => {
    const groupOf = (id: string) => allMethods().find((m) => m.id === id)!.group;
    expect(ADV_FUNCTIONS.find((f) => f.id === 'buckling')!.steps.map(groupOf)).toEqual(['secondOrder', 'secondOrder']);
    expect(ADV_FUNCTIONS.find((f) => f.id === 'plastic')!.steps.map(groupOf)).toEqual(['plastic', 'plastic']);
    expect(ADV_FUNCTIONS.find((f) => f.id === 'modal')!.steps.every((m) => groupOf(m) === 'dynamics')).toBe(true);
    expect(ADV_FUNCTIONS.find((f) => f.id === 'influenceLine')!.steps.map(groupOf)).toEqual(['influence']);
  });

  it('has an entry for every function the panel can run, and the panel runs every entry', () => {
    const keys = [...toolbar.matchAll(/\{ key: '(\w+)'/g)].map((m) => m[1]);
    const runnable = ADV_FUNCTIONS.filter((f) => !f.stepsGroup).map((f) => f.id);
    expect(new Set(keys)).toEqual(new Set(runnable));
    for (const id of runnable) expect(toolbar, `openFunction does not start ${id}`).toContain(`case '${id}':`);
  });

  it('offers the Mohr circle only in builds with the public tools, whose strings are pruned otherwise', () => {
    expect(ADV_FUNCTIONS.find((f) => f.id === 'mohr')!.feature).toBe('tools');
    expect(ADV_FUNCTIONS.filter((f) => f.feature).map((f) => f.id)).toEqual(['mohr']);
    expect(launcher).toContain("f.feature !== 'tools' || (__PUBLIC_FEATURES__.tools && tools())");
  });

  it('says why a function cannot run', () => {
    const plastic = ADV_FUNCTIONS.find((f) => f.id === 'plastic')!;
    const despiece = ADV_FUNCTIONS.find((f) => f.id === 'despiece')!;
    expect(unavailable(plastic, { is3D: true, members: 3, solved: true })).toBe('plane');
    expect(unavailable(plastic, { is3D: false, members: 0, solved: false })).toBe('model');
    expect(unavailable(despiece, { is3D: false, members: 3, solved: false })).toBe('results');
    expect(unavailable(despiece, { is3D: true, members: 3, solved: true })).toBeNull();
  });
});

it.each([false, true])('dispatches buckling exclusively to its workspace handler, space=%s', async space => {
  const { dispatchSecondOrder } = await import('../second-order-dispatch');
  const handlers = { handleBuckling: vi.fn(), handleBuckling3D: vi.fn(), handlePDelta: vi.fn(), handlePDelta3D: vi.fn() };
  dispatchSecondOrder('buckling', space, handlers);
  expect(space ? handlers.handleBuckling3D : handlers.handleBuckling).toHaveBeenCalledOnce();
  expect(space ? handlers.handleBuckling : handlers.handleBuckling3D).not.toHaveBeenCalled();
  for (const handler of [handlers.handlePDelta, handlers.handlePDelta3D]) expect(handler).not.toHaveBeenCalled();
});

it.skip('known wrong result: #2491 — gives plastic analysis and its methods the same containment reason', async () => {
  const { stepBlockedReason } = await import('../open-step');
  const { unavailableReasonKey } = await import('../catalog');
  const { uiStore } = await import('../../store');
  uiStore.analysisMode = '2d';
  const plastic = ADV_FUNCTIONS.find(f => f.id === 'plastic')!;
  const reason = unavailable(plastic, { is3D: false, members: 1, solved: true });
  for (const id of plastic.steps) expect(reason && unavailableReasonKey[reason]).toBe(stepBlockedReason(id));
});

it.skip('known wrong result: #2491 — looks up pending functions with the same runtime tools policy as the launcher', async () => {
  const { advFunction } = await import('../catalog');
  const flags = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => flags.get(key) ?? null });
  try {
    flags.set('stabileo-feature-tools', '0');
    expect(advFunction('mohr')).toBeUndefined();
    expect(advFunction('buckling')?.id).toBe('buckling');
    flags.set('stabileo-feature-tools', '1');
    const { tools } = await import('../../features');
    expect(!!advFunction('mohr')).toBe(tools());
  } finally {
    vi.unstubAllGlobals();
  }
});
