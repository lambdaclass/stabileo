export type DiagramSum = readonly number[];
export type DiagramPolynomial = readonly DiagramSum[];

interface DiagramAccumulator {
  partials: number[];
  size: number;
}

function accumulateDiagramTerm(accumulator: DiagramAccumulator, term: number): boolean {
  const { partials, size } = accumulator;
  let kept = 0;
  for (let i = 0; i < size; i++) {
    let other = partials[i]!;
    if (Math.abs(term) < Math.abs(other)) {
      const swap = term;
      term = other;
      other = swap;
    }
    const next = term + other;
    if (!Number.isFinite(next)) {
      partials[0] = next;
      accumulator.size = 1;
      return false;
    }
    const residual = other - (next - term);
    if (residual !== 0) partials[kept++] = residual;
    term = next;
  }
  if (term !== 0) partials[kept++] = term;
  accumulator.size = kept;
  return true;
}

export function sumDiagramTerms(terms: readonly number[]): DiagramSum {
  const accumulator: DiagramAccumulator = { partials: [], size: 0 };
  for (const term of terms) {
    if (!accumulateDiagramTerm(accumulator, term)) break;
  }
  accumulator.partials.length = accumulator.size;
  return accumulator.partials;
}

function accumulateCoefficient(next: DiagramAccumulator, coefficient: DiagramSum, value: DiagramAccumulator, x: number): void {
  next.size = 0;
  for (const term of coefficient) {
    if (!accumulateDiagramTerm(next, term)) return;
  }
  for (let i = 0; i < value.size; i++) {
    if (!accumulateDiagramTerm(next, value.partials[i]! * x)) return;
  }
}

function evaluatePolynomial(coefficients: DiagramPolynomial, x: number, value: DiagramAccumulator, next: DiagramAccumulator): DiagramAccumulator {
  value.size = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    accumulateCoefficient(next, coefficients[i]!, value, x);
    const previous = value;
    value = next;
    next = previous;
  }
  return value;
}

export function polynomialValue(coefficients: DiagramPolynomial, x: number): DiagramSum {
  const result = evaluatePolynomial(coefficients, x, { partials: [], size: 0 }, { partials: [], size: 0 });
  result.partials.length = result.size;
  return result.partials;
}

export function prepareRoundedPolynomial(coefficients: DiagramPolynomial): (x: number) => number {
  const first: DiagramAccumulator = { partials: [], size: 0 };
  const second: DiagramAccumulator = { partials: [], size: 0 };
  return x => {
    const { partials, size } = evaluatePolynomial(coefficients, x, first, second);
    return roundPartials(partials, size);
  };
}

export function roundDiagramSum(partials: DiagramSum): number {
  return roundPartials(partials, partials.length);
}

function roundPartials(partials: DiagramSum, size: number): number {
  let sum = partials[size - 1] ?? 0;
  for (let i = size - 2; i >= 0; i--) {
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
