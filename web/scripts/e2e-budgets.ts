// No trustworthy per-test timings are checked in (shard tables aggregate whole files).
export const SMOKE_TIMEOUT_MS = 45_000;
// Quarantined and explicitly slow tests keep the normal project's longer budgets.
export const SMOKE_PATTERN = /^(?!.*@(?:slow|flaky)\b).*@smoke\b/;
