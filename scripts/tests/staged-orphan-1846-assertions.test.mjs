import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./staged-orphan-1846-wasm.mjs', import.meta.url), 'utf8');
const comparison = source.slice(source.indexOf('let failures = 0;'), source.indexOf('console.log(`${cases.length}'));

function compare(dimension, change) {
  const displacement = dimension === 2
    ? { nodeId: 2, ux: 1, uz: 2, ry: 3 }
    : { nodeId: 2, ux: 1, uy: 2, uz: 3, rx: 4, ry: 5, rz: 6 };
  const linear = { displacements: [{ ...displacement, nodeId: 1 }, structuredClone(displacement)] };
  const staged = { displacements: [{ ...displacement, nodeId: 1 }, structuredClone(displacement)] };
  change(linear, staged);
  const solve2d = () => linear;
  const solve3d = () => linear;
  runInNewContext(comparison, {
    assert, console: { error() {} }, solve_2d: solve2d, solve_3d: solve3d,
    cases: [['injected', { nodes: { 1: {}, 2: {} }, elements: {}, supports: {}, loads: [] }, dimension === 2 ? solve2d : solve3d, () => JSON.stringify({ finalResults: staged })]],
  });
}

for (const dimension of [2, 3]) {
  test(`${dimension}D finite matching result passes`, () => compare(dimension, () => {}));
  const fields = dimension === 2 ? ['ux', 'uz', 'ry'] : ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  for (const field of fields) {
    for (const side of ['linear', 'staged']) {
      for (const invalid of [NaN, Infinity, -Infinity, undefined, null, '1']) {
        test(`${dimension}D rejects ${side} ${field}=${String(invalid)}`, () => {
          assert.throws(() => compare(dimension, (linear, staged) => {
            (side === 'linear' ? linear : staged).displacements[0][field] = invalid;
          }));
        });
      }
      test(`${dimension}D rejects missing ${side} ${field}`, () => {
        assert.throws(() => compare(dimension, (linear, staged) => {
          delete (side === 'linear' ? linear : staged).displacements[0][field];
        }));
      });
    }
    test(`${dimension}D rejects ${field} outside tolerance`, () => {
      assert.throws(() => compare(dimension, (_, staged) => { staged.displacements[0][field] += 1e-6; }));
    });
  }
  test(`${dimension}D rejects missing staged node`, () => {
    assert.throws(() => compare(dimension, (_, staged) => { staged.displacements = []; }));
  });
}

for (const dimension of [2, 3]) {
  for (const side of ['linear', 'staged']) {
    for (const mutation of ['empty', 'missing', 'extra', 'duplicate']) {
      test(`${dimension}D rejects ${side} ${mutation} nodes`, () => {
        assert.throws(() => compare(dimension, (linear, staged) => {
          const result = side === 'linear' ? linear : staged;
          if (mutation === 'empty') result.displacements = [];
          if (mutation === 'missing') result.displacements.pop();
          if (mutation === 'extra') result.displacements.push({ ...result.displacements[0], nodeId: 3 });
          if (mutation === 'duplicate') result.displacements[1].nodeId = 1;
        }));
      });
    }
  }
}
