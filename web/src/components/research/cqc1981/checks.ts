import validation from '../../../../../research/benchmarks/cqc-1981/VALIDATION.json';

export const roofNodeIds = [5, 6] as const;
export const checkCount = validation.checks.length;

function scientific(value: number): string {
  if (value === 0) return '0';
  const [mantissa, exponent] = value.toExponential().split('e');
  const superscript = String(Number(exponent)).replace('-', '⁻').replace(/\d/g, digit => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(digit)]);
  return `${mantissa} × 10${superscript}`;
}

export const relativeBound = scientific(validation.checks[0].tolerance);
const maximum = Math.max(...validation.checks.map(check => check.observed));
export const nativeMaximum = `≈ ${scientific(Number(maximum.toPrecision(2)))}`;
