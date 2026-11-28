<script lang="ts">
  import { t } from '../../lib/i18n';
  import type { OccupancyEntry } from '../../lib/codes/cirsoc101/live-loads';

  let { id, value, rows, formatPressure, choose }: {
    id: string;
    value: string;
    rows: readonly OccupancyEntry[];
    formatPressure: (pressure: number) => string;
    choose: (key: string) => void;
  } = $props();
</script>

<select {id} data-testid={id} {value} onchange={event => choose(event.currentTarget.value)}>
  {#if !rows.some(row => row.key === value)}<option value={value} disabled>{value}</option>{/if}
  {#each rows as row (row.key)}
    <option value={row.key}>{t(row.labelKey)}{row.uniformKNm2 !== null ? ` · ${formatPressure(row.uniformKNm2)}` : ''}</option>
  {/each}
</select>
