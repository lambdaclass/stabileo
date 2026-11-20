<script lang="ts">
  import { num } from '../shell/format';
  import type { Strings } from './strings-en';

  type Row = { id: string; reference?: number; computed?: number; relative?: boolean; observed: number; tolerance: number; passed: boolean; source: string };
  type Sensitivity = { parameter: string; value: number; rate: number; amplification: number; envelope: number };
  let { s, rows = [], sensitivity = [] }: { s: Strings; rows?: Row[]; sensitivity?: Sensitivity[] } = $props();

  const show = (v: number) => (Math.abs(v) >= 1 ? num(v, { sig: 6 }) : num(v, { sig: 4 }));
  const difference = (r: Row) => (r.observed < 1e-12 ? '0' : r.relative ? `${num(100 * r.observed, { sig: 2 })} %` : `${num(r.observed, { sig: 2 })} ${s.absolute}`);
  const parameters = $derived([...new Set(sensitivity.map(x => x.parameter))]);
  const rates = $derived([...new Set(sensitivity.map(x => x.rate))]);
  const page = (source: string) => source.replace(/^arXiv:2312\.13908v2 /, '').replace(/, read off the figure.*$/, '');
  const tolerance = (r: Row) => (r.relative === false ? `${num(r.tolerance, { sig: 2 })} ${s.absolute}` : `${num(100 * r.tolerance, { sig: 2 })} %`);
</script>

{#if rows.length}
  <div class="table-scroll">
    <table class="checks">
      <thead><tr><th scope="col">{s.table.quantity}</th><th scope="col">{s.table.paper}</th><th scope="col">{s.table.ours}</th><th scope="col">{s.table.difference}</th><th scope="col">{s.table.source}</th></tr></thead>
      <tbody>
        {#each rows as r}
          <tr class:failed={!r.passed}><th scope="row">{s.rows[r.id] ?? r.id}</th><td>{r.reference === undefined ? '—' : show(r.reference)}</td><td>{r.computed === undefined ? '—' : show(r.computed)}</td><td>{r.passed ? '✓' : '✗'} {difference(r)} {r.passed ? '' : `(${s.notReproduced} ${tolerance(r)})`}</td><td>{s.sources[r.id] ?? page(r.source)}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
{#if sensitivity.length}
  <div class="table-scroll">
    <table class="checks sensitivity">
      <thead><tr><th scope="col">{s.sensitivityTable.setting}</th><th scope="col">{s.sensitivityTable.value}</th>{#each rates as r}<th scope="col">A, µ̇ = {num(r, { sig: 2 })}</th><th scope="col">{s.envelopeColumn}</th>{/each}</tr></thead>
      <tbody>
        {#each parameters as p}
          {#each sensitivity.filter(x => x.parameter === p && x.rate === rates[0]) as row}
            <tr><th scope="row">{s.settingNames[p] ?? p}</th><td>{num(row.value, { sig: 3 })}</td>
              {#each rates as r}{@const x = sensitivity.find(x => x.parameter === p && x.rate === r && x.value === row.value)}<td>{num(x?.amplification ?? NaN, { sig: 3 })}</td><td>{num(x?.envelope ?? NaN, { sig: 3 })}</td>{/each}</tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .table-scroll { overflow-x: auto; }
  .checks { border-collapse: collapse; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .checks th, .checks td { padding: 0.35rem 0.6rem; border-bottom: 1px solid var(--hair); text-align: right; }
  .checks th[scope='row'] { text-align: left; font-weight: 500; }
  .checks td:not(:last-child) { white-space: nowrap; }
  .checks td:last-child { text-align: left; color: var(--fg-2); }
  .checks tr.failed th, .checks tr.failed td:not(:last-child) { color: var(--st-amber); }
  .checks thead th { color: var(--fg-2); font-weight: 500; }
</style>
