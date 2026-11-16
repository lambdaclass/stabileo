<script lang="ts">
  import { num } from '../shell/format';
  import type { Strings } from './strings-en';
  import validation from '../../../../../research/mechanics/heyman-1966/VALIDATION.json';

  type Check = { id: string; computed?: number; reference?: number; passed: boolean };
  let { s }: { s: Strings } = $props();

  const checks = validation.checks as Check[];
  const byId = (id: string) => checks.find(c => c.id === id)!;
  const fill = (template: string, values: Record<string, string>) => Object.entries(values).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), template);
  const signed = (d: number, dp: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${num(Math.abs(d), { dp })}`;
  const groups = $derived(validation.least_thickness.flatMap(row => (['milankovitch', 'ccr'] as const).map(key => ({
    title: fill(s[key], { a: num(row.alpha) }),
    rows: (['eta', 'beta', 'h'] as const).map(q => {
      const c = byId(`${key}-${row.alpha}-${q}`);
      const dp = q === 'beta' ? 4 : 7;
      const difference = q === 'beta' ? `${signed(c.computed! - c.reference!, 4)}°` : `${signed(100 * (c.computed! - c.reference!) / c.reference!, 4)} %`;
      return { quantity: s.quantities[q], published: num(c.reference!, { dp: q === 'beta' ? 4 : undefined, sig: q === 'beta' ? undefined : 6 }), ours: num(c.computed!, { dp }), difference, passed: c.passed };
    }),
  }))));
</script>

<div class="table-scroll">
  <table class="checks">
    <thead><tr><th scope="col">{s.table.quantity}</th><th scope="col">{s.table.published}</th><th scope="col">{s.table.ours}</th><th scope="col">{s.table.difference}</th></tr></thead>
    {#each groups as group}
      <tbody>
        <tr class="group"><th scope="rowgroup" colspan="4">{group.title}</th></tr>
        {#each group.rows as row}
          <tr class:open={!row.passed}>
            <th scope="row">{row.quantity}</th>
            <td>{row.published}</td>
            <td>{row.ours}</td>
            <td><span class="mark" aria-hidden="true">{row.passed ? '✓' : '✗'}</span> {row.difference}</td>
          </tr>
        {/each}
      </tbody>
    {/each}
  </table>
</div>

<style>
  .table-scroll { overflow-x: auto; }
  .checks { width: 100%; border-collapse: collapse; font-size: 0.85rem; line-height: 1.35; }
  .checks th, .checks td { text-align: left; vertical-align: top; padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--hair); }
  .checks thead th { color: var(--fg-2); font-weight: 500; }
  .checks thead th + th { text-align: right; }
  .checks td { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .checks tbody th { font-weight: 500; min-width: 8rem; }
  .checks .group th { color: var(--fg-2); font-weight: 600; font-size: 0.8rem; padding-top: 0.9rem; }
  .checks .mark { color: var(--rs-plot-ours); }
  .checks tr.open .mark { color: #e5484d; }
</style>
