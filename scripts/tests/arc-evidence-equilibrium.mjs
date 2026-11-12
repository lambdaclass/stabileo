import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function assertMemberEquilibrium(forces, label, solver, displacements) {
  assert.equal(forces.length, 2, `${label}: expected both arch members`);
  assert.equal(new Set(forces.map(f => f.elementId)).size, 2);
  for (const f of forces) {
    assert.ok([f.length, f.vStart, f.vEnd, f.mStart, f.mEnd].every(Number.isFinite));
    assert.ok(f.length > 0);
    if (solver) {
      assert.deepEqual(displacements.map(d => d.nodeId).sort((a,b) => a-b), Object.values(solver.nodes).map(n => n.id).sort((a,b) => a-b));
      const e = Object.values(solver.elements).find(e => e.id === f.elementId);
      assert.ok(e);
      assert.ok(!solver.loads.some(l => l.data.elementId === e.id));
      const at = id => {
        const n = solver.nodes[id], d = displacements.find(d => d.nodeId === id);
        return [n.x + d.ux, n.z + d.uz];
      };
      const a = at(e.nodeI), b = at(e.nodeJ);
      assert.ok(Math.abs(f.length - Math.hypot(b[0]-a[0], b[1]-a[1])) < 1e-12);
    }
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
    const {solver} = JSON.parse(record.arguments[0]);
    assertMemberEquilibrium(record.after.elementForces, `${record.id} after`, solver, record.after.displacements);
    const bad = structuredClone(record.after.elementForces);
    bad[0].vStart = record.before.elementForces[0].vStart;
    bad[0].vEnd = record.before.elementForces[0].vEnd;
    assert.throws(() => assertMemberEquilibrium(bad, 'old shear'), /member/);
    assert.throws(() => assertMemberEquilibrium([], 'empty members'));

    const suffix = record.id.slice('frozen-arch-'.length);
    const snapshot = JSON.parse(readFileSync(new URL(`../../web/results-frozen/solve_arc_length-${suffix}.json`, import.meta.url)));
    const v = snapshot.values, prefix = 'nonlinear.results.elementForces';
    const forces = Array.from({ length: v[`${prefix}.length`] }, (_, i) => Object.fromEntries(['elementId', 'length', 'vStart', 'vEnd', 'mStart', 'mEnd'].map(k => [k, v[`${prefix}[${i}].${k}`]])));
    const displacements = Array.from({length: v['nonlinear.results.displacements.length']}, (_, i) => Object.fromEntries(['nodeId', 'ux', 'uz'].map(k => [k, v[`nonlinear.results.displacements[${i}].${k}`]])));
    assertMemberEquilibrium(forces, `${record.id} frozen`, solver, displacements);
    const badFrozen = structuredClone(forces);
    badFrozen[0].vStart = record.before.elementForces[0].vStart;
    badFrozen[0].vEnd = record.before.elementForces[0].vEnd;
    assert.throws(() => assertMemberEquilibrium(badFrozen, 'old frozen shear', solver, displacements));
    for (const f of forces) {
      const after = record.after.elementForces.find(a => a.elementId === f.elementId);
      for (const [k, value] of Object.entries(f)) assert.equal(value, after[k], `${record.id} ${k}`);
    }
  }
}

export async function regenerateAfterResults() {
  const engine = await import('../../web/src/lib/wasm/dedaliano_engine.js');
  const wasm = readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url));
  engine.initSync({module: wasm});
  const file = new URL('../../docs/advisories/replays/SA-2026-061.json', import.meta.url);
  const replay = JSON.parse(readFileSync(file));
  for (const record of replay.records) {
    let output;
    try {
      const raw = engine[record.method](...record.arguments);
      output = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      try { output = {refused: JSON.parse(String(error))}; }
      catch { output = {refused: String(error)}; }
    }
    const r = output.results ?? output.finalResults ?? output;
    const notices = [];
    function walk(value, path) {
      if (!value || typeof value !== 'object') return;
      for (const [key, v] of Object.entries(value)) {
        if (/warning|diagnostic/i.test(key)) notices.push({path: path + '.' + key, value: v});
        else if (v && typeof v === 'object') walk(v, path + '.' + key);
      }
    }
    walk(output, '$');
    record.after = {refused: output.refused, converged: output.converged, finalLoadFactor: output.finalLoadFactor, reactions: r.reactions ?? r.peakReactions, constraintForces: r.constraintForces, elementForces: r.elementForces, displacements: r.displacements, equilibrium: r.equilibrium, notices};
  }
  delete replay.fixedSourceCommit;
  replay.fixedSourceParentCommit = '1deb0d21c703e59e50dc76b050f06eeb6d3af28d';
  replay.fixedSource = 'Final engine sources in the signed commit containing this replay; fixedSourceParentCommit identifies its parent.';
  replay.engineBuild.fixed = 'make wasm from the final round 8 engine sources; re-run every recorded exact argument using scripts/tests/arc-evidence-equilibrium.mjs --update';
  replay.engineBuild.fixedWasmSha256 = createHash('sha256').update(wasm).digest('hex');
  writeFileSync(file, JSON.stringify(replay, null, 2) + '\n');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv.includes('--update')) await regenerateAfterResults();
  checkStoredEvidence();
}
