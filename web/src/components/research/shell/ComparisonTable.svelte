<script lang="ts">
  /**
   * The paper's numbers next to Stabileo's and their difference, one row per check of the
   * experiment's published_comparison.json. Rows are the evidence CI checked, never retyped.
   */
  import { comparisonShape, comparisonPasses, type PublishedRow } from './context';
  import { comparisonStrings } from './comparison-strings';
  import { num } from './format';
  import Sci from './Sci.svelte';

  let { rows, names = {} }: { rows: PublishedRow[]; names?: Record<string, string> } = $props();
  const s = $derived(comparisonStrings());
  const relative = (r: PublishedRow) => r.metric.toLowerCase().startsWith('relative');
  const plain = (v: number) => v === 0 || (Math.abs(v) >= 1e-3 && Math.abs(v) < 1e6);
</script>

{#snippet value(v: number, unit: string)}
  {#if plain(v)}<span class="n">{num(v, { sig: 6 })}{#if unit}&#8239;{unit}{/if}</span>{:else}<Sci value={v} sig={4} {unit} />{/if}
{/snippet}

{#snippet gap(v: number, r: PublishedRow)}
  {#if relative(r)}
    {#if plain(v * 100)}<span class="n">{num(v * 100, { sig: 3 })}&#8239;%</span>{:else}<Sci value={v * 100} unit="%" />{/if}
  {:else if plain(v)}<span class="n">{num(v, { sig: 2 })}{#if r.unit}&#8239;{r.unit}{/if}</span>{:else}<Sci value={v} unit={r.unit ?? ''} />{/if}
{/snippet}

<div class="rs-compare">
  <table>
    <caption>{s.caption}</caption>
    <thead>
      <tr><th scope="col">{s.quantity}</th><th scope="col">{s.paper}</th><th scope="col">{s.ours}</th><th scope="col">{s.difference}</th><th scope="col">{s.tolerance}</th></tr>
    </thead>
    <tbody>
      {#each rows as r, i (r.id ?? r.name)}
        {@const shape = comparisonShape(r)}
        {@const passed = comparisonPasses(r)}
        <tr>
          <th scope="row">{names[r.id ?? r.name] ?? r.name}{#if i === 0 || rows[i - 1].source !== r.source}<span class="src" lang="en">{r.source}</span>{/if}</th>
          {#if shape === 'curve'}
            <td colspan="2" class="curve">{s.curve.replace('{n}', num(r.points!))}</td>
          {:else}
            <td>{#if Number.isFinite(r.reference)}{@render value(r.reference!, r.unit ?? '')}{:else}{s.unavailable}{/if}</td>
            <td>{#if Number.isFinite(r.computed)}{@render value(r.computed!, r.unit ?? '')}{:else}{s.unavailable}{/if}</td>
          {/if}
          <td>{#if shape !== 'unavailable' && Number.isFinite(r.observed)}{@render gap(r.observed, r)}{:else}{s.unavailable}{/if}</td>
          <td><span class={passed ? 'ok' : 'bad'} aria-label={passed ? s.within : s.outside}>{passed ? '✓' : '✗'}</span> {@render gap(r.tolerance, r)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .rs-compare {
    overflow-x: auto;
    margin: var(--rs-space-3, 0.75rem) 0 var(--rs-space-5, 1.5rem);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font: var(--rs-small) / 1.4 var(--st-sans);
  }
  caption {
    text-align: left;
    color: var(--fg-2);
    padding-bottom: 0.35rem;
  }
  th,
  td {
    border-bottom: 1px solid var(--hair);
    padding: 0.35rem 0.5rem;
    vertical-align: top;
    text-align: right;
    white-space: nowrap;
  }
  th[scope='row'],
  thead th:first-child {
    text-align: left;
    white-space: normal;
    min-width: 9rem;
  }
  thead th {
    color: var(--fg-2);
    font-weight: 500;
  }
  .src {
    display: block;
    color: var(--fg-2);
    font-size: 0.85em;
    font-weight: 400;
  }
  .curve {
    text-align: center;
    color: var(--fg-2);
    white-space: normal;
  }
  .n {
    font-variant-numeric: tabular-nums;
  }
  .ok {
    color: var(--st-ok);
  }
  .bad {
    color: var(--st-red, #c0392b);
  }
</style>
