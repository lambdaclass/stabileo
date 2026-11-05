import type { ResearchStrings } from '../i18n';
import results from '../../../../../research/metamaterials/grossman-2026/results/stabileo_results.json';
import comparisons from '../../../../../research/metamaterials/grossman-2026/reference-results/published_comparison.json';

export function articleStrings(strings: ResearchStrings, locale: string): ResearchStrings {
  const rows = results.foam.periodic;
  const i = rows.findIndex((row) => row.nu.mean <= 0);
  const a = rows[i - 1], b = rows[i];
  const fmt = (n: number, digits = 3) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
  const values: Record<string, string> = {
    nodes: fmt(824, 0), seeds: fmt(results.foam.seeds, 0), cells: fmt(results.foam.cells, 0),
    cross: fmt(a.eta + (b.eta - a.eta) * a.nu.mean / (a.nu.mean - b.nu.mean)),
    last: fmt(rows.at(-1)!.nu.mean), near: fmt(rows.at(-2)!.nu.mean),
    perfect: fmt(results.foam.strip_13x52[0].nu.mean),
    outside: comparisons.filter((row) => !row.passed).map((row) => fmt(row.eta)).join('; '),
    se: fmt(2 * rows.at(-1)!.nu.std / Math.sqrt(results.foam.seeds), 4),
  };
  return Object.fromEntries(Object.entries(strings).map(([key, value]) => [key,
    key.startsWith('springs') && typeof value === 'string'
      ? value.replace(/\b\d+\.\d+\b/g, (n) => new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(Number(n))).replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all)
      : value,
  ])) as ResearchStrings;
}
