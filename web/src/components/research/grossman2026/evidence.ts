import validation from '../../../../../research/metamaterials/grossman-2026/VALIDATION.json';
import strip from '../../../../../research/metamaterials/grossman-2026/reference-results/published_comparison.json';

export const evidence = ['paper', 'independent'].map((category) => {
  const checks = validation.checks.filter((check) => check.category === category);
  return { category, checks, passed: checks.filter((check) => check.passed).length, total: checks.length };
});
export const stripComparison = strip;
