import { render } from 'svelte/server';
import { afterEach, expect, it } from 'vitest';
import { t } from '../../lib/i18n';
import { modelStore } from '../../lib/store';
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
