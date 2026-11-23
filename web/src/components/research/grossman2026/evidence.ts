import validation from '../../../../../research/metamaterials/grossman-2026/VALIDATION.json';
import published from '../../../../../research/metamaterials/grossman-2026/reference-results/published_comparison.json';
import strip from '../../../../../research/metamaterials/grossman-2026/reference-results/fig5_strip_comparison.json';
import type { PublishedRow } from '../shell/context';

export const evidence = ['paper', 'independent'].map((category) => {
  const checks = validation.checks.filter((check) => check.category === category);
  return { category, checks, passed: checks.filter((check) => check.passed).length, total: checks.length };
});
export const stripComparison = strip.checks;
export const comparisonRows: PublishedRow[] = [...published.checks, ...strip.checks];
