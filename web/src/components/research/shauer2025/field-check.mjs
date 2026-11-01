export function maxDifference(a, b) {
  if (a.length !== b.length || !Array.from(a).every(Number.isFinite) || !Array.from(b).every(Number.isFinite)) return Infinity;
  return a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
}

export function mirrorMap(nodes) {
  const key = (x, y) => `${Math.round(x * 1e7)},${Math.round(y * 1e7)}`;
  const at = new Map();
  for (let i = 0; i < nodes.length / 2; i++) {
    const k = key(nodes[2 * i], nodes[2 * i + 1]);
    at.set(k, [...(at.get(k) ?? []), i]);
  }
  return Array.from({ length: nodes.length / 2 }, (_, i) => {
    const matches = at.get(key(nodes[2 * i], -nodes[2 * i + 1])) ?? [];
    return matches.length === 2 ? matches.find(j => j !== i) : matches[0];
  });
}

export function expectedStress(nodes, elements, damage, displacement, material) {
  const { e, nu, plane } = material;
  const a = plane === 'strain' ? e * (1 - nu) / ((1 + nu) * (1 - 2 * nu)) : e / (1 - nu * nu);
  const b = plane === 'strain' ? e * nu / ((1 + nu) * (1 - 2 * nu)) : a * nu;
  const g = e / (2 * (1 + nu));
  const out = [];
  for (let k = 0; k < elements.length; k += 4) {
    const ids = Array.from(elements.slice(k, k + 4));
    const dx = [-0.25, 0.25, 0.25, -0.25], dy = [-0.25, -0.25, 0.25, 0.25];
    const sum = fn => ids.reduce((v, n, i) => v + fn(n, i), 0);
    const xx = sum((n, i) => dx[i] * nodes[2 * n]), xy = sum((n, i) => dx[i] * nodes[2 * n + 1]);
    const yx = sum((n, i) => dy[i] * nodes[2 * n]), yy = sum((n, i) => dy[i] * nodes[2 * n + 1]);
    const det = xx * yy - xy * yx;
    const gx = dx.map((v, i) => (yy * v - xy * dy[i]) / det);
    const gy = dy.map((v, i) => (xx * v - yx * dx[i]) / det);
    const ex = sum((n, i) => gx[i] * displacement[2 * n]);
    const ey = sum((n, i) => gy[i] * displacement[2 * n + 1]);
    const shear = sum((n, i) => gy[i] * displacement[2 * n] + gx[i] * displacement[2 * n + 1]);
    const degradation = (1 - sum(n => damage[n]) / 4) ** 2;
    out.push(degradation * (a * ex + b * ey), degradation * (b * ex + a * ey), degradation * g * shear);
  }
  return out;
}

export function checkFields(frame, nodes, elements, snapshots, material, replay = false) {
  const failures = [];
  for (const key of ['step', 'damage_max']) {
    if (!Number.isFinite(frame.step?.[key])) failures.push(`missing or non-finite ${key}`);
  }
  const n = nodes.length / 2, ne = elements.length / 4;
  if (frame.damage?.length !== n || frame.displacement?.length !== 2 * n || (!replay && frame.syy?.length !== ne)
    || (frame.syy && frame.syy.length !== ne)) return ['field length mismatch'];
  if (![frame.damage, frame.displacement, ...(frame.syy ? [frame.syy] : [])].every(a => Array.from(a).every(Number.isFinite))) return ['non-finite fields'];
  if (Number.isFinite(frame.step?.damage_max)) {
    const maximum = Math.max(...frame.damage);
    const expected = replay ? Math.max(0, Math.min(1.05, frame.step.damage_max)) : frame.step.damage_max;
    if (Math.abs(maximum - expected) > (replay ? 1.05 / 510 + 6e-8 : 6e-8)) failures.push('maximum damage inconsistent with nodal field');
  }
  const k = frame.step?.step;
  const d = snapshots.damage[k];
  if (d) {
    const expected = replay ? d.map(v => Math.max(0, Math.min(1.05, v))) : d;
    const mirrored = mirrorMap(nodes).map(i => expected[i]);
    const diff = Math.min(maxDifference(frame.damage, expected), k > 56 ? maxDifference(frame.damage, mirrored) : Infinity);
    if (diff > (k === 57 ? 1e-4 : 1e-8) + (replay ? 1.05 / 510 : 6e-8)) failures.push(`damage snapshot ${k} mismatch`);
  }
  const u = snapshots.displacement[k];
  if (u) {
    const scale = Math.max(...u.map(Math.abs));
    if (maxDifference(frame.displacement, u) > scale * (replay ? 1 / 254 + 1e-7 : 1e-7)) failures.push(`displacement snapshot ${k} mismatch`);
  }
  if (frame.syy) {
    const stress = expectedStress(nodes, elements, frame.damage, frame.displacement, material).filter((_, i) => i % 3 === 1);
    const scale = Math.max(...stress.map(Math.abs), 1e-10);
    if (maxDifference(frame.syy, stress) > scale * 2e-4 + 1e-8) failures.push('stress inconsistent with displacement and damage');
  }
  return failures;
}
