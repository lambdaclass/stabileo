import { appendFileSync } from 'node:fs';

/**
 * Whether a wall-clock budget is asserted. NO_WALL_CLOCK=1 skips budgets; with WALL_CLOCK_REPORT set,
 * an overrun is appended to that file as a JSON line instead of failing, so only the timing is soft.
 */
export function assertBudget(measured: number, budget: number, what: string, env: Record<string, string | undefined> = process.env): boolean {
  if (env.NO_WALL_CLOCK === '1') return false;
  const report = env.WALL_CLOCK_REPORT;
  if (!report || !Number.isFinite(measured)) return true;
  if (!(measured < budget)) appendFileSync(report, `${JSON.stringify({ what, measured, budget })}\n`);
  return false;
}
