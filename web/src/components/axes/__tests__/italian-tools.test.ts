import { afterEach, beforeEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { DEFAULT_AXES } from '../../../lib/axes/frame';
import { twoD } from '../../../lib/axes/display';
import { ensureLocale, setLocale } from '../../../lib/i18n';
import { validateAndSolve2D } from '../../../lib/engine/solver-service';
import { modelStore, uiStore } from '../../../lib/store';
import ContextHelp from '../../property/ContextHelp.svelte';
import ToolLoadOptions from '../../floating-tools/ToolLoadOptions.svelte';
import ToolNodeOptions from '../../floating-tools/ToolNodeOptions.svelte';

beforeEach(async () => {
  modelStore.clear();
  setLocale('it');
  await ensureLocale('it');
});
afterEach(() => {
  modelStore.clear();
  axesStore.reset();
  setLocale('en');
});

it.skip.each(['+Z', '+Y'] as const)('known wrong result: #2595 — Italian planar controls with %s up', up => {
  axesStore.choice = { ...DEFAULT_AXES, up };
  uiStore.analysisMode = '2d';
  uiStore.loadType = 'nodal';
  modelStore.addNode(0, 0);
  uiStore.currentTool = 'influenceLine';
  uiStore.showHelpPanel = true;
  const help = render(ContextHelp).body;
  const normal = twoD.normal.toLowerCase(), vertical = twoD.vertical.toLowerCase();
  expect(help).toContain(`R${vertical}, Rx, M${normal}`);
  expect(help).toContain('M, V, N');
  expect(render(ToolLoadOptions).body).toContain(`title="Momento flettente (M${normal})"`);
});

it.skip.each(['3d', 'pro'] as const)('known wrong result: #2595 — Italian working planes and global moments in %s', mode => {
  uiStore.analysisMode = mode;
  uiStore.nodeMode = 'create';
  uiStore.loadType = 'nodal';
  const planes = render(ToolNodeOptions).body;
  expect(planes).toContain('title="Piano XY (suolo)"');
  expect(planes).toContain('title="Piano XZ (frontale)"');
  expect(render(ToolLoadOptions).body).toContain('title="Momento in X"');
});

it.skip.each(['+Z', '+Y'] as const)('known wrong result: #2595 — the external stability check identifies missing vertical restraint with %s up', up => {
  axesStore.choice = { ...DEFAULT_AXES, up };
  const left = modelStore.addNode(0, 0), right = modelStore.addNode(4, 0);
  modelStore.addElement(left, right, 'frame');
  const mid = modelStore.addNode(2, 1);
  modelStore.addElement(left, mid, 'frame');
  for (const node of [left, mid, right]) modelStore.addSupport(node, 'rollerZ');
  modelStore.addNodalLoad(right, 0, -1);
  expect(validateAndSolve2D(modelStore.model)).toContain('nessun vincolo verticale');
});
