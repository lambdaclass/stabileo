import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertZeroReactions } from './staged-round7-reactions.mjs';

for (const fields of [['rx', 'rz', 'my'], ['fx', 'fy', 'fz', 'mx', 'my', 'mz']]) {
  const rows = [1, 2].map(nodeId => ({ nodeId, ...Object.fromEntries(fields.map(f => [f, 0])) }));
  test(`${fields.length} components accept complete support rows`, () => assertZeroReactions(rows, [1, 2], fields));
  test(`${fields.length} components accept reordered support rows`, () => assertZeroReactions([...rows].reverse(), [1, 2], fields));
  test(`${fields.length} components reject absent support rows`, () => {
    for (const broken of [[], rows.slice(0, 1), [rows[0], rows[0]], [...rows, rows[0]], [rows[0], { ...rows[1], nodeId: 3 }]]) assert.throws(() => assertZeroReactions(broken, [1, 2], fields));
  });
}
