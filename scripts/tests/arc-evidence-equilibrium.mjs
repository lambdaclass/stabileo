import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function assertMemberEquilibrium(forces, label) {
  assert.equal(forces.length, 2, `${label}: expected both arch members`);
  assert.equal(new Set(forces.map(f => f.elementId)).size, 2);
  for (const f of forces) {
    assert.ok([f.length, f.vStart, f.vEnd, f.mStart, f.mEnd].every(Number.isFinite));
    assert.ok(f.length > 0);
    assert.ok(Math.abs(f.vStart - f.vEnd) < 1e-9);
    assert.ok(Math.abs(f.mEnd - f.mStart + f.vStart * f.length) < 1e-9, `${label} member ${f.elementId}: ${JSON.stringify(f)}`);
  }
}

export function checkStoredEvidence() {
  const replay = JSON.parse(readFileSync(new URL('../../docs/advisories/replays/SA-2026-061.json', import.meta.url)));
  const arches = replay.records.filter(r => r.id.startsWith('frozen-arch-'));
  assert.equal(arches.length, 2);
  for (const record of arches) {
    assert.equal(record.after.converged, true);
    assertMemberEquilibrium(record.after.elementForces, `${record.id} after`);
    const suffix = record.id.slice('frozen-arch-'.length);
    const snapshot = JSON.parse(readFileSync(new URL(`../../web/results-frozen/solve_arc_length-${suffix}.json`, import.meta.url)));
    const v = snapshot.values, prefix = 'nonlinear.results.elementForces';
    const forces = Array.from({ length: v[`${prefix}.length`] }, (_, i) => Object.fromEntries(['elementId', 'length', 'vStart', 'vEnd', 'mStart', 'mEnd'].map(k => [k, v[`${prefix}[${i}].${k}`]])));
    assertMemberEquilibrium(forces, `${record.id} frozen`);
    for (const f of forces) {
      const after = record.after.elementForces.find(a => a.elementId === f.elementId);
      for (const [k, value] of Object.entries(f)) assert.equal(value, after[k], `${record.id} ${k}`);
    }
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) checkStoredEvidence();
