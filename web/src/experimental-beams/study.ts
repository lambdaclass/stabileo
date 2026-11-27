import column from '../../../scripts/tests/fixtures/experimental-beam-column.json';
import arch from '../../../scripts/tests/fixtures/experimental-beam-arch.json';

export type Example = 'column' | 'arch';
export type Verdict = 'stable' | 'unstable' | 'undetermined';
export type Equilibrium = {
  loadFactor: number; displacements: [number, number, number][];
  relativeResidual: number; energy: number;
};
export type State = {
  equilibrium: Equilibrium;
  stability: { verdict: Verdict; reason: string; minimum: number | null; uncertainty: number | null; negativeModes: number };
};
export type Study = {
  model: typeof column.model; offsets: [number, number][];
  completed: boolean; iterations: number; states: State[]; lastEquilibrium: Equilibrium;
  localizationRequested: boolean;
  critical: null | {
    stable: State; unstable: State; nearCritical: State;
    resolution: 'bracketed' | 'spectralUncertainty' | 'correctionFailed' | 'budgetExhausted';
    kind: 'limitPointCandidate' | 'bifurcationCandidate' | 'unresolved';
    intervalSize: number; correctorError: string | null;
  };
};
export const labels: Record<Verdict, string> = {
  stable: 'Estable', unstable: 'Inestable', undetermined: 'No determinado',
};
export const colors: Record<Verdict, string> = {
  stable: '#116e51', unstable: '#ae3131', undetermined: '#936515',
};
export const reasons: Record<string, string> = {
  positiveTangent: 'Tangente positiva verificada.', negativeDirection: 'Se verificó una dirección de rigidez negativa.',
  nearSingular: 'La incertidumbre numérica impide decidir el signo de la rigidez.',
  notEquilibrated: 'El estado no satisface la tolerancia de equilibrio del diagnóstico.',
  nonFiniteSpectrum: 'El cálculo espectral excedió el rango numérico finito.',
  asymmetricTangent: 'La tangente no pasó la comprobación de simetría.',
  unverifiedSpectrum: 'No se pudo verificar la precisión del espectro completo.',
};

export function requestFor(example: Example, amplitude: number) {
  if (!Number.isFinite(amplitude) || Math.abs(amplitude) > 0.005) throw new Error('La amplitud debe estar entre −0,005 y 0,005 m.');
  const fixture = structuredClone(example === 'column' ? column : arch);
  const n = fixture.model.positions.length - 1;
  const shape = fixture.model.positions.map((_, i) => example === 'column'
    ? [i === 0 || i === n ? 0 : Math.sin(Math.PI * i / n), 0]
    : [0, Math.sin(Math.PI * i / (2 * n))]);
  return { ...fixture, imperfection: amplitude === 0 ? null : { shape, amplitude } };
}

export function point(example: Example, model: Study['model'], at: Equilibrium): [number, number] {
  const last = model.positions.length - 1;
  const x = example === 'column' ? at.displacements[Math.floor(last / 2)][0] : -at.displacements[last][1];
  return [x, -model.loads[last][1] * at.loadFactor];
}

// Do not paint one verdict across a transition or an unresolved sample.
export function segmentVerdict(a: State, b: State): Verdict {
  return a.stability.verdict === b.stability.verdict ? a.stability.verdict : 'undetermined';
}
