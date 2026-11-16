import assert from 'node:assert/strict';

export function assertZeroReactions(rows, expected, fields) {
  assert.deepEqual(rows.map(r => r.nodeId).sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
  for (const row of rows) for (const field of fields) assert.ok(Number.isFinite(row[field]) && row[field] === 0, `reactions ${field}: ${row[field]}`);
}
