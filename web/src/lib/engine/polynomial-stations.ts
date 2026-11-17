export function polynomialValue(coefficients: readonly number[], x: number): number {
  return coefficients.reduceRight((sum, c) => sum * x + c, 0);
}

export function polynomialDerivative(coefficients: readonly number[]): number[] {
  return coefficients.slice(1).map((c, i) => (i + 1) * c);
}

export function cubicOnInterval(evaluate: (t: number) => number, lo: number, hi: number): number[] {
  const nodes = Array.from({ length: 4 }, (_, i) => (1 - Math.cos((2 * i + 1) * Math.PI / 8)) / 2);
  const divided = nodes.map(u => evaluate(lo + (hi - lo) * u));
  for (let j = 1; j < 4; j++) for (let i = 3; i >= j; i--) divided[i] = (divided[i]! - divided[i - 1]!) / (nodes[i]! - nodes[i - j]!);
  let coefficients = [divided[3]!];
  for (let i = 2; i >= 0; i--) {
    const next = Array<number>(coefficients.length + 1).fill(0);
    coefficients.forEach((c, j) => { next[j] -= nodes[i]! * c; next[j + 1] += c; });
    next[0] += divided[i]!;
    coefficients = next;
  }
  if (coefficients.some(c => !Number.isFinite(c))) throw new Error('Cannot form finite member diagram polynomial');
  return coefficients;
}

export function polynomialRootCandidates(coefficients: readonly number[], lo = 0, hi = 1): number[] {
  const c = [...coefficients];
  while (c.length && c.at(-1) === 0) c.pop();
  if (c.length < 2) return [];
  if (c.some(v => !Number.isFinite(v))) throw new Error('Cannot isolate non-finite member diagram polynomial');
  const scale = Math.max(...c.map(Math.abs));
  const normalized = c.map(v => v / scale);
  if (c.length === 2) {
    const root = -normalized[0]! / normalized[1]!;
    return root >= lo && root <= hi ? [root] : [];
  }
  const critical = polynomialRootCandidates(polynomialDerivative(normalized), lo, hi);
  const cuts = [...new Set([lo, ...critical, hi])].sort((a, b) => a - b);
  const roots = [...critical];
  for (let k = 0; k + 1 < cuts.length; k++) {
    let a = cuts[k]!, b = cuts[k + 1]!;
    let fa = polynomialValue(normalized, a);
    const fb = polynomialValue(normalized, b);
    if (fa === 0) roots.push(a);
    if (fb === 0) roots.push(b);
    if (fa === 0 || fb === 0 || (fa < 0) === (fb < 0)) continue;
    while (true) {
      const mid = a + (b - a) / 2;
      if (mid === a || mid === b) { roots.push(mid); break; }
      const fm = polynomialValue(normalized, mid);
      if (fm === 0) { roots.push(mid); break; }
      if ((fm < 0) === (fa < 0)) { a = mid; fa = fm; } else b = mid;
    }
  }
  return [...new Set(roots)].sort((a, b) => a - b);
}

export function magnitudeStations(parts: readonly ((t: number) => number)[], method: 'abs' | 'srss', cuts: readonly number[]): number[] {
  const positions = new Set<number>();
  for (let k = 0; k + 1 < cuts.length; k++) {
    const lo = cuts[k]!, hi = cuts[k + 1]!, width = hi - lo;
    if (!(width > 0)) continue;
    const polynomials = parts.map(evaluate => cubicOnInterval(evaluate, lo, hi));
    const scale = Math.max(0, ...polynomials.flatMap(p => p.map(Math.abs)));
    if (scale === 0) continue;
    const normalized = polynomials.map(p => p.map(c => c / scale));
    if (method === 'srss') {
      const squared = Array<number>(7).fill(0);
      for (const p of normalized) p.forEach((a, i) => p.forEach((b, j) => { squared[i + j] += a * b; }));
      for (const u of polynomialRootCandidates(polynomialDerivative(squared))) positions.add(lo + width * u);
    } else {
      const zeros = [...new Set([0, 1, ...normalized.flatMap(p => polynomialRootCandidates(p))])].sort((a, b) => a - b);
      for (const u of zeros) positions.add(lo + width * u);
      for (let j = 0; j + 1 < zeros.length; j++) {
        const a = zeros[j]!, b = zeros[j + 1]!;
        const sum = Array<number>(4).fill(0);
        for (const p of normalized) {
          const sign = polynomialValue(p, a + (b - a) / 2) < 0 ? -1 : 1;
          p.forEach((c, i) => { sum[i] += sign * c; });
        }
        for (const u of polynomialRootCandidates(polynomialDerivative(sum), a, b)) positions.add(lo + width * u);
      }
    }
  }
  return [...positions];
}
