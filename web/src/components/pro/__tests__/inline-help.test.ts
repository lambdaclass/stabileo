/**
 * The line under each PRO option is one component the reader can turn off, and only help goes
 * through it: a warning or a state still shows with the help off.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'src/components/pro');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.svelte') ? [p] : [];
});
const sources = files(root).map((p) => ({ p: p.slice(root.length + 1), s: readFileSync(p, 'utf8') }));

/** Lines that report a state, not what an option does: they stay whatever the setting. */
const STATE = new Set([
  'groups.none', 'view.none', 'fdn.noWall', 'groups.readOnly', 'building.levelsDefault', 'pro.shellCurvatureSelect',
  'spec.supports.oneForDetail', 'pro.shellOffsetWarn', 'spec.variable.framesOnly', 'spec.variable.offHint', 'combos.empty',
  'contour.line.noShell', 'report.qty.noDetailing', 'frameEd.pick', 'desk.pickMember', 'desk.frameUnique', 'desk.pickLevel',
  'colEd.pick', 'colEd.allChecks', 'fdnEd.none', 'joist.none', 'seisDes.noStoreys', 'seisDes.noFrame', 'slabEd.none',
  'wallEd.none', 'pro.po.stale', 'shear.noShape',
]);
const isState = (k: string) => STATE.has(k) || /\.off$|empty|periodCapped|floorNearFault|floorLowZone|topHeavy|suction|^windProfile\.b/.test(k);

describe('inline help in PRO', () => {
  it('goes through the one component: no fixed help line is written by hand', () => {
    const loose = sources.flatMap(({ p, s }) => [...s.matchAll(/<p class="[a-z]+-hint">\{t\('([^']+)'\)\}<\/p>/g)]
      .map((m) => m[1]!).filter((k) => !isState(k)).map((k) => `${p}: ${k}`));
    expect(loose).toEqual([]);
  });

  it('covers loads, combinations, analysis and the exports', () => {
    for (const f of ['ProLoadsTab.svelte', 'ProLoadCases.svelte', 'ProCombinationsList.svelte', 'ProAdvancedTab.svelte', 'ProReportDialog.svelte', 'export/ProDataExportDialog.svelte', 'export/ProDxfExportDialog.svelte', 'spec/SpecAnalysis.svelte']) {
      expect(sources.find((x) => x.p === f)?.s, f).toMatch(/<Hint /);
    }
  });

  it('shows only while the setting is on', () => {
    const hint = readFileSync(join(root, 'Hint.svelte'), 'utf8');
    expect(hint).toMatch(/\{#if uiStore\.inlineHelp\}/);
  });
});

describe('the inline help setting', () => {
  const mem = new Map<string, string>();
  beforeAll(() => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('starts on, and is remembered when turned off and on again', async () => {
    vi.resetModules();
    const { uiStore } = await import('../../../lib/store');
    expect(uiStore.inlineHelp).toBe(true);
    uiStore.inlineHelp = false;
    expect(mem.get('stabileo-inline-help')).toBe('0');
    vi.resetModules();
    expect((await import('../../../lib/store')).uiStore.inlineHelp).toBe(false);
    (await import('../../../lib/store')).uiStore.inlineHelp = true;
    expect(mem.get('stabileo-inline-help')).toBe('1');
  });
});
