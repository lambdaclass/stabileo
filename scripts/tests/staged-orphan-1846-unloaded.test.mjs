import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertUnloadedStages } from './staged-orphan-1846-unloaded.mjs';

for (const dimension of [2, 3]) {
  for (const zero of [false, true]) {
    const fields = dimension === 2 ? ['ux', 'uz', 'ry'] : ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
    const input = { nodes: { 1: { id: 1 }, 2: { id: 2 } } };
    const stages = [{ name: 'before' }, { name: 'after' }];
    const output = () => ({
      displacements: [1, 2].map(nodeId => ({ nodeId, ...Object.fromEntries(fields.map(f => [f, 0])) })),
      structuredDiagnostics: [],
    });
    const result = () => ({ stages: stages.map(() => ({ results: output() })), finalResults: output() });
    const label = `${dimension}D ${zero ? 'inactive' : 'dormant'}`;
    test(`${label} complete unloaded result passes`, () => {
      assertUnloadedStages(result(), input, stages, dimension);
    });
    const rejects = (name, mutate) => {
      test(`${label} rejects ${name}`, () => {
        assertUnloadedStages(result(), input, stages, dimension);
        const fabricated = result();
        mutate(fabricated);
        assert.throws(() => assertUnloadedStages(fabricated, input, stages, dimension));
      });
    };
    rejects('empty stages', r => { r.stages = []; });
    rejects('missing stage', r => { r.stages.pop(); });
    rejects('extra stage', r => { r.stages.push(r.stages[0]); });
    rejects('missing finalResults', r => { delete r.finalResults; });
    for (const side of ['stage 0', 'stage 1', 'finalResults']) {
      const at = r => side === 'finalResults' ? r.finalResults : r.stages[Number(side.slice(-1))].results;
      for (const mutation of ['empty', 'missing', 'extra', 'duplicate', 'wrong']) {
        rejects(`${side} ${mutation} nodes`, r => {
          const d = at(r).displacements;
          if (mutation === 'empty') d.length = 0;
          if (mutation === 'missing') d.pop();
          if (mutation === 'extra') d.push({ ...d[0], nodeId: 3 });
          if (mutation === 'duplicate') d[1].nodeId = 1;
          if (mutation === 'wrong') d[1].nodeId = 3;
        });
      }
      for (const field of fields.filter(f => f !== 'ux')) {
        for (const invalid of [NaN, Infinity, -Infinity, undefined, null, '0', 1]) {
          rejects(`${side} ${field}=${String(invalid)}`, r => { at(r).displacements[0][field] = invalid; });
        }
      }
      rejects(`${side} NUM-INVARIANCE`, r => {
        at(r).structuredDiagnostics = [{ phase: 'NUM-INVARIANCE' }];
      });
    }
  }
}
