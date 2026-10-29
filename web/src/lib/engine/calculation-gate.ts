let refusal: string | null = null;
export class CalculationRefused extends Error {}
export function refuseNewJobs(reason: string | null): void { refusal = reason; }
export function assertCalculationsAllowed(): void {
  if (import.meta.env.VITE_DESKTOP === '1' && refusal !== null) throw new CalculationRefused(refusal);
}
