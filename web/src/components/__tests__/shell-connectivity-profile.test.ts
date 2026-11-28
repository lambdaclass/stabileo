import { render } from 'svelte/server';
import { afterEach, expect, it } from 'vitest';
import { t, tp } from '../../lib/i18n';
import { modelStore, uiStore } from '../../lib/store';
import { applyPlateMeshes, createPlate, meshBeforeAnalysis, planPlateMesh, plateShellKeys } from '../../lib/store/physical-plates';
import { quickEdit } from '../../lib/store/pro-quick-edit.svelte';
import AnalysisMeshControl from '../pro/plates/AnalysisMeshControl.svelte';
import ProQuickEdit from '../pro/ProQuickEdit.svelte';
import ProShellTab from '../pro/ProShellTab.svelte';

afterEach(() => { modelStore.clear(); });

it('counts raw shells with unattached corners in the published shell panel', () => {
  modelStore.clear();
  const nodes = [[0, 0], [2, 0], [2, 2], [0, 2], [4, 0]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const [a, b, c, d, e] = nodes as [number, number, number, number, number];
  const mat = [...modelStore.materials.keys()][0]!;
  const check = (count: number) => {
    const html = render(ProShellTab).body;
    const message = t('pro.shellWarnDisconnected').replace('{n}', String(count));
    expect(html.includes(message)).toBe(count > 0 && !__PUBLIC_FEATURES__.proPlatesUnified);
  };
  check(0);
  modelStore.addQuad([a, b, c, d], mat, 0.2);
  modelStore.addPlate([b, e, c], mat, 0.2);
  check(2);
  const saved = modelStore.snapshot();
  modelStore.clear();
  modelStore.restore(saved);
  check(2);
  modelStore.addSupport(a, 'fixed');
  modelStore.addSupport(d, 'pinned');
  check(1);
  modelStore.addElement(e, a);
  check(0);
});

it('shows the published raw shell inventory, plate status and mesh display default', () => {
  modelStore.clear();
  const ids = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x,y]) => modelStore.addNode(x!, y!, 0)) as [number, number, number, number];
  const plate = createPlate({ outline: ids, thickness: 0.15, materialId: 1 });
  if ('problem' in plate) throw Error(plate.problem);
  const above = ids.map(n => {
    const p = modelStore.nodes.get(n)!;
    return modelStore.addNode(p.x, p.y, 3);
  });
  const upper = createPlate({ outline: above, thickness: 0.15, materialId: 1 });
  if ('problem' in upper) throw Error(upper.problem);
  uiStore.shellPickScope = 'plate';
  modelStore.addQuad(ids, 1, 0.15);
  modelStore.addPlate([ids[0], ids[1], ids[2]], 1, 0.15);
  const html = render(ProShellTab).body;
  const unified = Boolean(__PUBLIC_FEATURES__.proPlatesUnified);
  expect(html.includes(t('pro.nPlatesQuads').replace('{plates}', '1').replace('{quads}', '1'))).toBe(!unified);
  const status = html.match(/<span class="chip chip-unmeshed[^"]*">([^<]*)<\/span>/)?.[1];
  expect(status).toBe(unified ? undefined : t('plates.status.unmeshed'));
  expect(html.includes('data-testid="plate-filter-level"')).toBe(unified);
  const hint = t(unified ? 'plates.unified.showMeshHint' : 'plates.showMeshHint');
  expect(html).toContain('title="' + hint + '"');
  expect(uiStore.platesShowMesh).toBe(unified ? null : true);
});

it('known wrong result: #1928 the raw element table offers its owner exactly until that plate is selected', () => {
  modelStore.clear();
  const nodes = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const plate = createPlate({ outline: nodes, thickness: 0.15, materialId: 1 });
  if ('problem' in plate) throw Error(plate.problem);
  const plan = planPlateMesh(plate.id, { size: 1, element: 'quad', followMembers: false });
  if (!plan?.mesh) throw Error(String(plan?.refused));
  applyPlateMeshes([plan]);
  const key = plateShellKeys(plate.id)[0]!;
  const unified = Boolean(__PUBLIC_FEATURES__.proPlatesUnified);
  const check = (owner: boolean, specification: boolean) => {
    const html = render(ProShellTab).body;
    expect(html.includes('data-testid="shell-select-owner"')).toBe(owner);
    expect(html.includes('data-testid="shell-open-spec"')).toBe(specification);
  };
  uiStore.shellPickScope = 'plate';
  uiStore.selectPlates([plate.id]);
  check(false, unified);
  uiStore.selectShell(key);
  check(!unified, !unified);
  uiStore.shellPickScope = 'element';
  check(true, true);
  const raw = modelStore.addPlate([nodes[0]!, nodes[1]!, nodes[2]!], 1, 0.15);
  uiStore.selectShell('p' + raw);
  check(false, true);
  uiStore.selectPlates([]);
  uiStore.shellPickScope = 'plate';
});

it('known wrong result: #1928 the published quick editor can mesh an ownerless quad but not a triangle', () => {
  modelStore.clear();
  const nodes = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0)) as [number, number, number, number];
  const quad = modelStore.addQuad(nodes, 1, 0.15);
  const triangle = modelStore.addPlate([nodes[0], nodes[1], nodes[2]], 1, 0.15);
  try {
    for (const target of [{ kind: 'quad', id: quad }, { kind: 'plate', id: triangle }] as const) {
      quickEdit.open(target, 0, 0);
      const html = render(ProQuickEdit).body;
      const meshable = target.kind === 'quad' && !__PUBLIC_FEATURES__.proPlatesUnified;
      expect(html.includes('data-testid="qe-mesh-size"')).toBe(meshable);
      expect(html.includes('data-testid="qe-mesh"')).toBe(meshable);
      expect(html.includes('data-testid="qe-mesh-plate"')).toBe(false);
      expect(html.includes('data-testid="qe-flip"')).toBe(true);
    }
  } finally {
    quickEdit.close();
  }
});

it('known wrong result: #1928 the published Analyze ribbon warns about an unmeshed plate and explains the mesh it will use', () => {
  modelStore.clear();
  const nodes = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const plate = createPlate({ outline: nodes, thickness: 0.15, materialId: 1 });
  if ('problem' in plate) throw Error(plate.problem);
  const unified = Boolean(__PUBLIC_FEATURES__.proPlatesUnified);
  const previous = meshBeforeAnalysis.value;
  try {
    for (const auto of [false, true]) {
      meshBeforeAnalysis.value = auto;
      const html = render(AnalysisMeshControl).body;
      const label = unified ? (auto ? 'plates.meshShort.willMesh' : 'plates.meshShort.missing') : 'plates.pendingShort';
      expect(html.includes(tp(label, { n: 1 }))).toBe(true);
      const hint = t(unified ? 'plates.unified.meshBeforeAnalysisHint' : 'plates.meshBeforeAnalysisHint');
      expect(html).toContain('title="' + hint + '"');
      const state = html.match(/<span class="([^"]*)"[^>]*data-testid="analysis-mesh-state"/)?.[1];
      expect(state?.split(' ').includes('warn')).toBe(!unified || !auto);
    }
    const plan = planPlateMesh(plate.id, { size: 1, element: 'quad', followMembers: false });
    if (!plan?.mesh) throw Error(String(plan?.refused));
    applyPlateMeshes([plan]);
    expect(render(AnalysisMeshControl).body).toContain(unified ? tp('plates.meshShort.ready', { n: 1 }) : t('plates.allCurrent'));
  } finally {
    meshBeforeAnalysis.value = previous;
  }
});
