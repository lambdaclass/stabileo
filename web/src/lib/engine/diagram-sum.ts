export type DiagramSum = readonly number[];

export function sumDiagramTerms(terms: readonly number[]): DiagramSum {
  const partials: number[] = [];
  for (let term of terms) {
    let kept = 0;
    for (let i = 0; i < partials.length; i++) {
      let other = partials[i]!;
      if (Math.abs(term) < Math.abs(other)) [term, other] = [other, term];
      const next = term + other;
      if (!Number.isFinite(next)) return [next];
      const residual = other - (next - term);
      if (residual !== 0) partials[kept++] = residual;
      term = next;
    }
    partials.length = kept;
    if (term !== 0) partials.push(term);
  }
  return partials;
}

export function roundDiagramSum(partials: DiagramSum): number {
  let sum = partials.at(-1) ?? 0;
  for (let i = partials.length - 2; i >= 0; i--) {
    const term = partials[i]!;
    const next = sum + term;
    const residual = term - (next - sum);
    sum = next;
    if (residual !== 0) {
      const low = partials[i - 1] ?? 0;
      if ((residual > 0 && low > 0) || (residual < 0 && low < 0)) {
        const twice = 2 * residual;
        const adjusted = sum + twice;
        if (adjusted - sum === twice) sum = adjusted;
      }
      break;
    }
  }
  return sum;
}
