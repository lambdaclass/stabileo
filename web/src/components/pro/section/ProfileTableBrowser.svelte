<script lang="ts">
  /**
   * The catalogue as a table: every column the property card has, for every profile of the
   * chosen families, sortable by any of them and exportable.
   *
   * The values are `profileProperties`, the same the card shows, so a modulus derived from the
   * outline says so here too (in the cell's title) and an absent J is a dash, never a zero.
   * Computing them resolves each outline, about 0.7 ms a profile, so the table opens on one
   * family and keeps what it has computed.
   */
  import { untrack } from 'svelte';
  import { t } from '../../../lib/i18n';
  import type { ProfileSource, ProfileEntry, ProfileId } from '../../../lib/profiles/catalogue';
  import { profileProperties, PROPERTY_ORDER, type ProfileProperties, type PropertyKey } from '../../../lib/profiles/properties';
  import type { ProfileFamily } from '../../../lib/data/steel-profiles';
  import { downloadText } from '../../../lib/store/file';

  interface Props {
    source: ProfileSource;
    selected: ProfileId;
    onPick: (id: ProfileId) => void;
  }
  const { source, selected, onPick }: Props = $props();

  const initialFamily = untrack(() => source.byId(selected)?.family ?? source.families()[0]!);
  let families = $state<ProfileFamily[]>([initialFamily]);
  let text = $state('');
  let sortKey = $state<PropertyKey | 'name'>('height');
  let ascending = $state(true);

  const cache = new Map<ProfileId, ProfileProperties>();
  const propsOf = (e: ProfileEntry) => {
    let p = cache.get(e.id);
    if (!p) { p = profileProperties(e); cache.set(e.id, p); }
    return p;
  };

  const rows = $derived.by(() => {
    const list = source.list({ families, text }).map((e) => ({ e, p: propsOf(e) }));
    const val = (r: (typeof list)[number]) => (sortKey === 'name' ? null : r.p[sortKey].value);
    return list.sort((a, b) => {
      if (sortKey === 'name') return (ascending ? 1 : -1) * a.e.name.localeCompare(b.e.name, undefined, { numeric: true });
      const va = val(a), vb = val(b);
      // Absent values sink, whichever way the column is sorted.
      if (va == null) return vb == null ? 0 : 1;
      if (vb == null) return -1;
      return ascending ? va - vb : vb - va;
    });
  });

  const SHORT: Record<PropertyKey, string> = {
    height: 'h', width: 'b', thickness: 't', rootRadius: 'r', area: 'A', mass: 'G',
    iy: 'Iy', iz: 'Iz', wy: 'Wy', wz: 'Wz', ry: 'ry', rz: 'rz', j: 'J',
  };
  const UNIT: Record<string, string> = { cm2: 'cm²', cm3: 'cm³', cm4: 'cm⁴', cm: 'cm', mm: 'mm', 'kg/m': 'kg/m' };
  const unitOf = (k: PropertyKey) => {
    const first = rows[0]?.p[k];
    return first ? UNIT[first.unit] ?? first.unit : '';
  };
  const fmt = (v: number | null) =>
    v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 0 : v >= 10 ? 1 : 2 });

  function sortBy(k: PropertyKey | 'name') {
    if (sortKey === k) ascending = !ascending;
    else { sortKey = k; ascending = true; }
  }
  function toggleFamily(f: ProfileFamily) {
    families = families.includes(f) ? families.filter((x) => x !== f) : [...families, f];
  }
  function exportCsv() {
    const head = ['name', 'family', 'standard', ...PROPERTY_ORDER.map((k) => `${SHORT[k]} (${unitOf(k)})`)];
    const body = rows.map(({ e, p }) => [e.name, e.family, e.standard, ...PROPERTY_ORDER.map((k) => p[k].value ?? '')]);
    const csv = [head, ...body].map((r) => r.map((c) => (typeof c === 'string' && /[",;]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
    downloadText(csv, 'profiles.csv', 'text/csv');
  }
</script>

<div class="browser" data-testid="profile-table-browser">
  <div class="bar">
    <input type="search" bind:value={text} placeholder={t('profileTable.search')} data-testid="profile-table-search" />
    <button type="button" onclick={exportCsv} data-testid="profile-table-csv">CSV</button>
  </div>
  <div class="fams">
    {#each source.families() as f (f)}
      <button type="button" class:on={families.includes(f)} aria-pressed={families.includes(f)}
        data-testid="profile-table-family-{f}" onclick={() => toggleFamily(f)}>{f}</button>
    {/each}
  </div>
  <p class="count" role="status">{t('profileTable.count').replace('{n}', String(rows.length))}</p>
  <div class="wrap">
    <table>
      <thead>
        <tr>
          <th><button type="button" onclick={() => sortBy('name')}>{t('profileTable.name')}{sortKey === 'name' ? (ascending ? ' ▲' : ' ▼') : ''}</button></th>
          {#each PROPERTY_ORDER as k (k)}
            <th title={t(`steel.props.label.${k}`)}>
              <button type="button" data-testid="profile-table-sort-{k}" onclick={() => sortBy(k)}>
                {SHORT[k]}{sortKey === k ? (ascending ? ' ▲' : ' ▼') : ''}
              </button>
              <span class="u">{unitOf(k)}</span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.e.id)}
          <tr class:sel={r.e.id === selected} data-testid="profile-table-row" onclick={() => onPick(r.e.id)}>
            <td class="name"><button type="button" onclick={() => onPick(r.e.id)}>{r.e.name}</button></td>
            {#each PROPERTY_ORDER as k (k)}
              {@const qv = r.p[k]}
              <td title={qv.basis === 'tabulated' ? '' : t(qv.noteKey ?? `steel.props.basis.title.${qv.basis}`)}
                  class:derived={qv.basis !== 'tabulated'}>{fmt(qv.value)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .browser { display: flex; flex-direction: column; gap: 4px; min-height: 0; height: 100%; }
  .bar { display: flex; gap: 6px; }
  .bar input { flex: 1; }
  input, button { font-size: 0.68rem; }
  input { background: var(--st-bg); color: var(--st-text); border: 1px solid var(--st-surface-3); border-radius: 3px; padding: 3px 5px; }
  .bar button, .fams button { padding: 1px 6px; background: transparent; color: var(--st-text-2); border: 1px solid var(--st-hair); border-radius: 3px; cursor: pointer; }
  .fams { display: flex; flex-wrap: wrap; gap: 3px; }
  .fams button.on { border-color: var(--st-interactive); color: var(--st-text); }
  .count { margin: 0; font-size: 0.64rem; color: var(--st-text-3); }
  .wrap { overflow: auto; flex: 1; min-height: 0; max-height: 440px; border: 1px solid var(--st-hair); border-radius: 3px; }
  table { border-collapse: collapse; font-size: 0.66rem; width: 100%; }
  th { position: sticky; top: 0; background: var(--st-surface-2); color: var(--st-text-3); font-weight: normal; padding: 2px 4px; text-align: right; white-space: nowrap; }
  th:first-child { text-align: left; }
  th button { background: none; border: none; color: var(--st-text-2); cursor: pointer; padding: 0; font-size: 0.66rem; }
  th .u { display: block; font-size: 0.58rem; }
  td { padding: 1px 4px; text-align: right; font-family: var(--st-mono, monospace); color: var(--st-text); white-space: nowrap; border-top: 1px solid var(--st-hair); }
  td.derived { color: var(--st-text-2); }
  td.name { text-align: left; }
  td.name button { background: none; border: none; padding: 0; color: inherit; font: inherit; cursor: pointer; }
  tr { cursor: pointer; }
  tr:hover td { background: var(--st-surface-2); }
  tr.sel td { background: var(--st-selected-bg); }
</style>
