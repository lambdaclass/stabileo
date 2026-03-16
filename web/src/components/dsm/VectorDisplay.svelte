<script lang="ts">
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store';

  let copyFeedback = $state<'ok' | null>(null);

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

  function fmtLatex(val: number): string {
    if (Math.abs(val) < 1e-10) return '0';
    if (Math.abs(val) >= 1e6 || (Math.abs(val) < 0.001 && Math.abs(val) > 0)) {
      const exp = Math.floor(Math.log10(Math.abs(val)));
      const mantissa = val / Math.pow(10, exp);
      return `${mantissa.toFixed(precision - 1)} \\times 10^{${exp}}`;
    }
    return val.toFixed(precision);
  }

  function toLatex(): string {
    const entries = vector.map(fmtLatex).join(' \\\\\n');
    return `\\begin{Bmatrix}\n${entries}\n\\end{Bmatrix}`;
  }

  async function copyLatex() {
    try {
      await navigator.clipboard.writeText(toLatex());
      copyFeedback = 'ok';
      setTimeout(() => { copyFeedback = null; }, 1500);
    } catch {
      uiStore.toast(t('dsm.latexCopyError'), 'error');
    }
  }
</script>

{#if title}
  <div class="vec-title">
    {title}
    {#if vector.length > 0}
      <button class="latex-copy-btn" onclick={copyLatex} title={t('dsm.latexCopyHint')}>
        {copyFeedback === 'ok' ? t('dsm.latexCopied') : t('dsm.latexCopy')}
      </button>
    {/if}
  </div>
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
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .latex-copy-btn {
    margin-left: auto;
    padding: 1px 6px;
    font-size: 0.6rem;
    color: #888;
    background: transparent;
    border: 1px solid #333;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .latex-copy-btn:hover {
    color: #ddd;
    border-color: #4ecdc4;
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
