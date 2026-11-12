import assert from 'node:assert/strict';

export function assertZeroReactions(rows, expected, fields) {
  for (const row of rows) for (const field of fields) assert.ok(Number.isFinite(row[field]) && row[field] === 0, `reactions ${field}: ${row[field]}`);
}
