/**
 * The PRO Write card, given the coordinates of an existing node.
 *
 * Every interactive way to put a node somewhere welds onto a node already there: the nodes
 * table, the paste, the 3D coordinate dialog. A twin in the same place looks joined and analyses
 * as a cut. The Write card, which replaced the table's empty row, called the blind `addNode`
 * and stacked one; it now welds like the rest.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';

afterEach(() => { modelStore.clear(); uiStore.analysisMode = '2d'; });

describe('PRO Write card: a node typed where one already is', () => {
  it('writes through the welding add', () => {
    const src = readFileSync(resolve(__dirname, '../../../components/pro/ProNodesTab.svelte'), 'utf8');
    const body = src.slice(src.indexOf('function writeNode()'), src.indexOf('</script>'));
    expect(body).toMatch(/modelStore\.addNodeWelded\(/);
    expect(body).not.toMatch(/modelStore\.addNode\(/);
  });

  it('a complete duplicate selects the existing node rather than adding a twin', () => {
    uiStore.analysisMode = 'pro';
    modelStore.clear();
    const id = modelStore.addNode(0, 0, 3);
    expect(modelStore.addNodeWelded(0, 0, 3)).toBe(id);
    expect(modelStore.nodes.size).toBe(1);
  });
});
