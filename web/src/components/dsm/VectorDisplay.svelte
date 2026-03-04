<script lang="ts">
  let {
    vector = [],
    labels = [],
    precision = 4,
    title = '',
    highlightIndices = new Set<number>(),
    horizontal = false,
  }: {
    vector: number[];
    labels?: string[];
    precision?: number;
    title?: string;
    highlightIndices?: Set<number>;
    horizontal?: boolean;
  } = $props();

  function fmt(val: number): string {
    if (Math.abs(val) < 1e-10) return '0';
    if (Math.abs(val) >= 1e6 || (Math.abs(val) < 0.001 && Math.abs(val) > 0)) {
      return val.toExponential(precision - 1);
    }
    return val.toFixed(precision);
  }
</script>

{#if title}
  <div class="vec-title">{title}</div>
{/if}
<div class="vec-scroll" class:horizontal>
  <table class="vec-table" class:horizontal>
    {#if horizontal}
      {#if labels.length > 0}
        <tr>
          {#each labels as label, i}
            <th class:hl={highlightIndices.has(i)}>{label}</th>
          {/each}
        </tr>
      {/if}
      <tr>
        {#each vector as val, i}
          <td class:hl={highlightIndices.has(i)} class:pos={val > 1e-10} class:neg={val < -1e-10} class:zero={Math.abs(val) <= 1e-10}>
            {fmt(val)}
          </td>
        {/each}
      </tr>
    {:else}
      {#each vector as val, i}
        <tr>
          {#if labels.length > 0}
            <th class:hl={highlightIndices.has(i)}>{labels[i] ?? ''}</th>
          {/if}
          <td class:hl={highlightIndices.has(i)} class:pos={val > 1e-10} class:neg={val < -1e-10} class:zero={Math.abs(val) <= 1e-10}>
            {fmt(val)}
          </td>
        </tr>
      {/each}
    {/if}
  </table>
</div>

<style>
  .vec-title {
    font-size: 0.7rem;
    color: #888;
    margin-bottom: 0.25rem;
    font-weight: 600;
  }
  .vec-scroll {
    overflow: auto;
    max-height: 300px;
  }
  .vec-scroll.horizontal {
    overflow-x: auto;
    overflow-y: hidden;
    max-height: none;
  }
  .vec-table {
    border-collapse: collapse;
    font-family: 'Courier New', monospace;
    font-size: 0.65rem;
    white-space: nowrap;
  }
  .vec-table th {
    padding: 0.15rem 0.3rem;
    background: #16213e;
    color: #888;
    font-weight: 500;
    font-size: 0.6rem;
    text-align: right;
  }
  .vec-table th.hl { background: rgba(78, 205, 196, 0.2); color: #4ecdc4; }
  .vec-table td {
    padding: 0.15rem 0.4rem;
    text-align: right;
    border: 1px solid #1a1a2e;
    background: #0f0f1e;
  }
  .vec-table td.pos { color: #4ecdc4; }
  .vec-table td.neg { color: #e94560; }
  .vec-table td.zero { color: #444; }
  .vec-table td.hl { background: rgba(78, 205, 196, 0.08); }
</style>
