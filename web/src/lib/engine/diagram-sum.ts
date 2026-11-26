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

function appendTerms(accumulator: DiagramAccumulator, terms: DiagramSum): boolean {
  for (const term of terms) {
    if (!accumulateDiagramTerm(accumulator, term)) return false;
  }
  return true;
}

export function sumDiagramTerms(terms: readonly number[]): DiagramSum {
  const accumulator: DiagramAccumulator = { partials: [], size: 0 };
  appendTerms(accumulator, terms);
  accumulator.partials.length = accumulator.size;
  return accumulator.partials;
}

function appendScaledTerms(next: DiagramAccumulator, value: DiagramAccumulator, x: number): void {
  for (let i = 0; i < value.size; i++) {
    if (!accumulateDiagramTerm(next, value.partials[i]! * x)) return;
  }
}

function accumulateCoefficient(next: DiagramAccumulator, coefficient: DiagramSum, value: DiagramAccumulator, x: number): void {
  next.size = 0;
  if (appendTerms(next, coefficient)) appendScaledTerms(next, value, x);
}

export function polynomialValue(coefficients: DiagramPolynomial, x: number): DiagramSum {
  let value: DiagramAccumulator = { partials: [], size: 0 };
  let next: DiagramAccumulator = { partials: [], size: 0 };
  for (let i = coefficients.length - 1; i >= 0; i--) {
    accumulateCoefficient(next, coefficients[i]!, value, x);
    const previous = value;
    value = next;
    next = previous;
  }
  value.partials.length = value.size;
  return value.partials;
}

interface PreparedCoefficient extends DiagramAccumulator {
  acceptsMore: boolean;
}

function accumulatePreparedCoefficient(next: DiagramAccumulator, c: PreparedCoefficient, value: DiagramAccumulator, x: number): void {
  next.size = c.size;
  for (let i = 0; i < c.size; i++) next.partials[i] = c.partials[i]!;
  if (c.acceptsMore) appendScaledTerms(next, value, x);
}

function preparePolynomialCoefficients(coefficients: DiagramPolynomial): PreparedCoefficient[] {
  return coefficients.map(terms => {
    const coefficient: PreparedCoefficient = { partials: [], size: 0, acceptsMore: true };
    coefficient.acceptsMore = appendTerms(coefficient, terms);
    return coefficient;
  });
}

function roundPreparedPolynomial(prepared: PreparedCoefficient[]): (x: number) => number {
  if (prepared.length === 0) return () => 0;
  const a: DiagramAccumulator = { partials: [], size: 0 };
  const b: DiagramAccumulator = { partials: [], size: 0 };
  const leading = prepared.pop()!;
  if (prepared.length === 3) {
    const constant = prepared[0]!, linear = prepared[1]!, quadratic = prepared[2]!;
    return x => {
      accumulatePreparedCoefficient(a, quadratic, leading, x);
      accumulatePreparedCoefficient(b, linear, a, x);
      accumulatePreparedCoefficient(a, constant, b, x);
      return roundPartials(a.partials, a.size);
    };
  }
  return x => {
    if (prepared.length === 0) return roundPartials(leading.partials, leading.size);
    let value = a, next = b;
    accumulatePreparedCoefficient(value, prepared[prepared.length - 1]!, leading, x);
    for (let i = prepared.length - 2; i >= 0; i--) {
      accumulatePreparedCoefficient(next, prepared[i]!, value, x);
      const previous = value;
      value = next;
      next = previous;
    }
    return roundPartials(value.partials, value.size);
  };
}

export function prepareRoundedPolynomial(coefficients: DiagramPolynomial): (x: number) => number {
  return roundPreparedPolynomial(preparePolynomialCoefficients(coefficients));
}

export function preparePolynomialSign(coefficients: DiagramPolynomial): (x: number) => number {
  const prepared = preparePolynomialCoefficients(coefficients);
  if (coefficients.length > 4 || coefficients.some(terms =>
    terms.length > 4 || terms.some(term => !(Math.abs(term) <= 1)))) {
    const compensated = roundPreparedPolynomial(prepared);
    return x => Math.sign(compensated(x));
  }
  const [constant = 0, linear = 0, quadratic = 0, cubic = 0] =
    prepared.map(({ partials, size }) => roundPartials(partials, size));
  const compensated = roundPreparedPolynomial(prepared);
  const roundoffBound = 2 ** -39;
  return x => {
    const estimate = constant + x * (linear + x * (quadratic + x * cubic));
    if (x >= 0 && x <= 1 && Math.abs(estimate) > roundoffBound) return Math.sign(estimate);
    return Math.sign(compensated(x));
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
