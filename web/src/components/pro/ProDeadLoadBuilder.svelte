<script lang="ts">
  /**
   * The permanent load, built from CIRSOC 101 Tabla 3.1 instead of typed.
   *
   * What this replaces: five fixed rows — a screed at 1,0 kN/m², a finish at 0,8, a
   * ceiling at 0,3, services at 0,3 and partitions at 1,0. Plausible values, presented
   * inside a panel whose whole promise is that its numbers come from a regulation, and
   * coming from nowhere. A reader had no way to tell them apart from the live load
   * beside them, which is read off Tabla 4.1 cell by cell.
   *
   * A row is now either a TABLE row — "baldosa cerámica, 12 mm" IS 0,28 kN/m² — or a
   * thickness of a material whose unit weight the table gives, or a typed value that
   * says on its face that it is an assumption. The three are visibly different because
   * they are different.
   */
  import { t } from '../../lib/i18n';
  import { te } from '../../lib/i18n/engine-text';
  import {
    DEAD_TABLE_2025, findDeadEntry, deadComponentLoad, checkPartitionAllowance,
    type DeadGroup,
  } from '../../lib/codes/cirsoc101/dead-loads';

  export interface DeadRow {
    /** Tabla 3.1 key, or null for a typed value. */
    entryKey: string | null;
    /** Metres, for a row the table prints per m³. */
    thickness: number;
    /** Tabla 3.1 (*) — laid on battens rather than boarding. */
    onBattens: boolean;
    /** kN/m², for a typed row. */
    q: number;
    /** True when this row is the allowance for interior partitions (§3.1.4). */
    isPartition: boolean;
  }

  interface Props {
    rows: DeadRow[];
    /** The unreduced Lo of the chosen occupancy, for the §3.1.4 check. */
    liveLo: number;
  }
  let { rows = $bindable(), liveLo }: Props = $props();

  const GROUPS: DeadGroup[] = ['ceiling', 'roof', 'concrete', 'floor', 'partition', 'glazing'];

  /** What one row contributes, and anything that has to be said with it. */
  function resolve(row: DeadRow) {
    if (row.entryKey === null) {
      return { q: row.q, labelKey: 'loads.dead.custom', notes: [], error: null, perVolume: false, battens: false };
    }
    const entry = findDeadEntry(row.entryKey);
    if (!entry) {
      return { q: 0, labelKey: 'loads.dead.custom', notes: [], error: null, perVolume: false, battens: false };
    }
    const r = deadComponentLoad(entry, { thicknessM: row.thickness, onBattens: row.onBattens });
    return {
      q: r.qKNm2, labelKey: entry.labelKey, notes: r.notes, error: r.error ?? null,
      perVolume: entry.areaKNm2 === null, battens: !!entry.battenDeduction,
    };
  }

  const resolved = $derived(rows.map(resolve));
  const partitionQ = $derived(
    rows.reduce((s, row, i) => s + (row.isPartition ? resolved[i].q : 0), 0),
  );
  const partition = $derived(checkPartitionAllowance(liveLo, partitionQ));
  /** Typed rows are assumptions and the panel says so once, not per row. */
  const anyAssumed = $derived(rows.some((r) => r.entryKey === null));

  let addKey = $state('');

  function addFromTable() {
    if (!addKey) return;
    const entry = findDeadEntry(addKey);
    rows = [...rows, {
      entryKey: addKey, thickness: 0.05, onBattens: false, q: 0,
      isPartition: entry?.group === 'partition',
    }];
    addKey = '';
  }
  function addCustom() {
    rows = [...rows, { entryKey: null, thickness: 0, onBattens: false, q: 0.5, isPartition: false }];
  }
  function remove(i: number) {
    rows = rows.filter((_, j) => j !== i);
  }
</script>

<div class="dl">
  <!--
    Keyed by the ROW, not by its index. `remove` filters and the two adders
    append, so a row's identity survives both — whereas an index key makes
    Svelte patch the block in place when one is deleted, handing the removed
    row's DOM to its neighbour along with the focus and any half-typed number
    the browser has not yet written back into the binding.
  -->
  {#each rows as row, i (row)}
    {@const r = resolved[i]}
    <div class="dl-row" data-testid="dead-row">
      <span class="dl-label">{t(r.labelKey)}</span>
      {#if row.entryKey === null}
        <span class="dl-qty"><input type="number" step="0.05" min="0" bind:value={rows[i].q}
               class="dl-num" data-testid="dead-q" /> <span class="dl-unit">kN/m²</span></span>
      {:else}
        <span class="dl-qty">
          {#if r.perVolume}
            <label class="dl-inline">
              <input type="number" step="0.01" min="0.001" bind:value={rows[i].thickness}
                     class="dl-num" data-testid="dead-thickness" aria-label={t('loads.dead.thickness')} title={t('loads.dead.thickness')} />
              m
            </label>
          {/if}
          <span class="dl-value" data-testid="dead-value">{r.q.toFixed(3)} kN/m²</span>
        </span>
      {/if}
      <label class="dl-inline dl-part">
        <input type="checkbox" bind:checked={rows[i].isPartition} data-testid="dead-is-partition" />
        {t('autoLoad.isPartition')}
      </label>
      <button class="dl-del" onclick={() => remove(i)} title={t('loads.dead.remove')}
              aria-label={t('loads.dead.remove')}>&#10005;</button>
    </div>
    {#if r.battens}
      <label class="dl-note dl-inline">
        <input type="checkbox" bind:checked={rows[i].onBattens} data-testid="dead-battens" />
        {t('loads.dead.onBattens')}
      </label>
    {/if}
    {#each r.notes as n (n.key)}
      <div class="dl-note">{te(n)}</div>
    {/each}
    {#if r.error}
      <div class="dl-err" data-testid="dead-error">{te(r.error)}</div>
    {/if}
  {/each}

  <div class="dl-add">
    <select bind:value={addKey} class="dl-select" data-testid="dead-picker">
      <option value="">{t('loads.dead.title')}…</option>
      {#each GROUPS as g (g)}
        <optgroup label={t(`loads.dead.group.${g}`)}>
          {#each DEAD_TABLE_2025.filter((e) => e.group === g) as e (e.key)}
            <option value={e.key}>
              {t(e.labelKey)}
              {#if e.areaKNm2 !== null}— {e.areaKNm2} kN/m²{:else}— {e.volumeKNm3} kN/m³{/if}
            </option>
          {/each}
        </optgroup>
      {/each}
    </select>
    <button class="al-btn-sm" onclick={addFromTable} disabled={!addKey}
            data-testid="dead-add-table">{t('loads.dead.addFromTable')}</button>
    <button class="al-btn-sm" onclick={addCustom}
            data-testid="dead-add-custom">{t('loads.dead.addCustom')}</button>
  </div>

  {#if anyAssumed}
    <div class="dl-note" data-testid="dead-assumed">{t('loads.dead.assumedWarning')}</div>
  {/if}

  <!--
    §3.1.4 requires the weight of interior partitions to be provided for whether or not
    they are drawn, unless the live load is over 4 kN/m². A build-up missing it shows up
    as nothing at all, which is why it is checked rather than looked for.
  -->
  <div class="dl-part-check" class:warn={partition.missing} data-testid="dead-partition-check">
    {te(partition.message)}
  </div>
</div>

<style>
  /* Fields, buttons and notes take the dialog's look (`ProAutoLoadsDialog`); this lays out the rows. */
  .dl { display: flex; flex-direction: column; gap: 4px; }
  .dl-row {
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto 18px; align-items: center; gap: 10px;
    min-height: 28px; padding: 0 2px; border-bottom: 1px solid var(--st-hair);
  }
  .dl-label { color: var(--st-text-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-qty { display: inline-flex; align-items: center; gap: 8px; justify-content: flex-end; }
  .dl-inline { display: inline-flex; align-items: center; gap: 4px; color: var(--st-text-3); white-space: nowrap; }
  .dl-part { font-size: 0.66rem; }
  .dl .dl-row input.dl-num { width: 64px; }
  .dl-unit, .dl-value { color: var(--st-text-3); font-family: var(--st-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dl-value { color: var(--st-value); min-width: 6.5rem; text-align: right; }
  .dl-del { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 0.75rem; padding: 0; }
  .dl-del:hover { color: var(--st-danger); }
  .dl-note { font-size: 0.64rem; color: var(--st-text-3); line-height: 1.4; padding: 2px 2px 0; }
  .dl-err { font-size: 0.66rem; color: var(--st-danger); line-height: 1.4; padding: 2px 2px 0; }
  .dl-add { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
  .dl-add .dl-select { flex: 1; min-width: 0; }
  .dl-part-check { font-size: 0.66rem; color: var(--st-text-3); line-height: 1.45; margin-top: 4px; }
  .dl-part-check.warn { color: var(--st-warn); }
</style>
