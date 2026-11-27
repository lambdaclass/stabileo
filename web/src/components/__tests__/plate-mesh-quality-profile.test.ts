import { render } from 'svelte/server';
import { afterEach, expect, it } from 'vitest';
import { tp } from '../../lib/i18n';
import { meshQuality, POOR_MAX_ASPECT } from '../../lib/model/physical/plate';
import { modelStore, uiStore } from '../../lib/store';
import { createPlate, plateEntry, plateStatus, planPlateMesh, setPlateMeshSpec } from '../../lib/store/physical-plates';
import ProShellTab from '../pro/ProShellTab.svelte';

function savedShell(name: string, width: number, y: number, original: boolean) {
  const points: [number, number, number][] = [[0, y, 0], [width, y, 0], [width, y + 1, 0], [0, y + 1, 0]];
  const outline = points.map(([x, y, z]) => modelStore.addNode(x, y, z)) as [number, number, number, number];
  const plate = createPlate({ name, outline, materialId: 1, thickness: 0.15 });
  if ('problem' in plate) throw Error(plate.problem);
  const quad = modelStore.addQuad(outline, 1, 0.15);
  const entry = plateEntry(plate.id)!;
  modelStore.setGroupMembers(plate.id, { ...entry.group.members, quads: [quad] });
  const quality = meshQuality({ points, cells: [[0, 1, 2, 3]] });
  const signature = planPlateMesh(plate.id)!.signature;
  modelStore.setGroupData(plate.id, {
    ...entry.group.data,
    surface: { ...entry.surface, meshed: { signature, cells: 1, quality, original } },
  });
  return plate.id;
}

function inspect(ids: number[]) {
  uiStore.selectMode = 'shells';
  uiStore.shellPickScope = 'plate';
  uiStore.selectPlates(ids);
  return render(ProShellTab).body.split('data-testid="plate-mesh-status"')[1]!.split('data-testid="plate-mesh-open"')[0]!;
}

afterEach(() => {
  uiStore.clearSelection();
  modelStore.clear();
});

it.each([true, false])('keeps the measured poor-cell warning for an original=%s mesh in single and mixed selections', (original) => {
  modelStore.clear();
  const bad = savedShell('Poor shell', POOR_MAX_ASPECT + 1, 0, original);
  const boundary = savedShell('Boundary shell', POOR_MAX_ASPECT, 3, false);
  const good = savedShell('Regular shell', POOR_MAX_ASPECT - 1, 6, false);
  modelStore.restore(modelStore.snapshot());
  const warning = tp('plates.poorCells', { n: 1 });
  expect(plateStatus(bad)).toBe('current');
  for (const stale of [false, true]) {
    if (stale) setPlateMeshSpec([bad], { size: plateEntry(bad)!.surface.mesh.size * 2 });
    expect(plateStatus(bad)).toBe(stale ? 'stale' : 'current');
    expect(inspect([bad])).toContain(warning);
    expect(inspect([boundary, good])).not.toContain(warning);
    const mixed = inspect([boundary, bad, good]);
    expect(mixed.split(warning)).toHaveLength(2);
    expect(mixed).toContain('Poor shell');
    if (!__PUBLIC_FEATURES__.proPlatesUnified) {
      for (const id of [boundary, bad, good]) expect(mixed).toContain(`data-testid="plate-status-${id}"`);
    }
  }
});
