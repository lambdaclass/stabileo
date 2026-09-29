<script lang="ts">
  /**
   * The blocks of a step-by-step document (engine/steps/doc), drawn. Words are
   * translated here, mathematics goes through KaTeX, figures through the one
   * sketch renderer. Recursive for `sub` blocks.
   */
  import MathEquation from '../dsm/MathEquation.svelte';
  import StepSketch from './StepSketch.svelte';
  import StepBlocks from './StepBlocks.svelte';
  import { tp, t } from '../../lib/i18n';
  import { isTxt, type Block, type Cell, type Txt } from '../../lib/engine/steps/doc';
  import { numText } from '../../lib/engine/steps/format';

  let { blocks, detail = true }: { blocks: Block[]; detail?: boolean } = $props();

  const say = (x: Txt | string) => (typeof x === 'string' ? x : tp(x.key, x.params));

  function matrixTex(name: string, rows: number[][], scale?: number): string {
    const s = scale && scale !== 1 ? scale : 1;
    const body = rows.map((r) => r.map((v) => numText(v / s).replace('−', '-').replace(/·10\^(-?\d+)/, ' \\cdot 10^{$1}')).join(' & ')).join(' \\\\ ');
    const factor = s !== 1 ? `${numText(s).replace('−', '-').replace(/·10\^(-?\d+)/, ' \\cdot 10^{$1}')} \\cdot ` : '';
    return `${name} = ${factor}\\begin{bmatrix} ${body} \\end{bmatrix}`;
  }

  const diffOf = (a: number, b: number) => {
    const d = a - b;
    const scale = Math.max(Math.abs(a), Math.abs(b));
    if (scale < 1e-9) return '0';
    const rel = Math.abs(d) / scale;
    return rel < 1e-9 ? '0' : `${numText(d, 3)} (${(rel * 100).toFixed(rel < 0.001 ? 4 : 2)} %)`;
  };
</script>

{#snippet cell(c: Cell)}
  {#if typeof c === 'number'}{numText(c)}
  {:else if typeof c === 'string'}{c}
  {:else if isTxt(c)}{say(c)}
  {:else}<MathEquation equation={c.tex} />{/if}
{/snippet}

{#each blocks as b}
  {#if b.kind === 'p'}
    {#if detail || !b.detail}<p class="sb-p" class:detail={b.detail}>{say(b.text)}</p>{/if}
  {:else if b.kind === 'eq'}
    <div class="sb-eq"><MathEquation equation={b.tex} displayMode /></div>
    {#if b.note && detail}<p class="sb-note-small">{say(b.note)}</p>{/if}
  {:else if b.kind === 'calc'}
    <div class="sb-calc">
      {#if b.label}<div class="sb-calc-label">{say(b.label)}</div>{/if}
      <div class="sb-row"><span class="sb-tag">{t('steps.view.formula')}</span><div class="sb-math"><MathEquation equation={b.formula} displayMode /></div></div>
      {#if b.subst}<div class="sb-row"><span class="sb-tag">{t('steps.view.subst')}</span><div class="sb-math"><MathEquation equation={b.subst} displayMode /></div></div>{/if}
      <div class="sb-row result"><span class="sb-tag">{t('steps.view.result')}</span><div class="sb-math"><MathEquation equation={b.result} displayMode /></div></div>
      {#if b.check}<div class="sb-row check"><span class="sb-tag">{t('steps.view.check')}</span><div class="sb-math"><MathEquation equation={b.check} displayMode /></div></div>{/if}
    </div>
  {:else if b.kind === 'table'}
    <div class="sb-scroll">
      <table class="sb-table">
        <thead><tr>{#each b.head as h}<th>{@render cell(h)}</th>{/each}</tr></thead>
        <tbody>{#each b.rows as r}<tr>{#each r as c}<td>{@render cell(c)}</td>{/each}</tr>{/each}</tbody>
      </table>
    </div>
    {#if b.caption}<p class="sb-caption">{say(b.caption)}</p>{/if}
  {:else if b.kind === 'matrix'}
    {#if b.rowLabels || b.colLabels}
      <div class="sb-scroll">
        <div class="sb-mname"><MathEquation equation={`${b.name} =${b.scale && b.scale !== 1 ? ` ${numText(b.scale).replace('−', '-')} \\cdot` : ''}`} /></div>
        <table class="sb-table sb-matrix">
          {#if b.colLabels}<thead><tr><th></th>{#each b.colLabels as c}<th>{c}</th>{/each}</tr></thead>{/if}
          <tbody>{#each b.rows as r, i}<tr>{#if b.rowLabels}<th>{b.rowLabels[i]}</th>{:else if b.colLabels}<th></th>{/if}{#each r as v}<td>{numText(v / (b.scale ?? 1))}</td>{/each}</tr>{/each}</tbody>
        </table>
      </div>
    {:else}
      <div class="sb-scroll sb-eq"><MathEquation equation={matrixTex(b.name, b.rows, b.scale)} displayMode /></div>
    {/if}
    {#if b.caption}<p class="sb-caption">{say(b.caption)}</p>{/if}
  {:else if b.kind === 'fig'}
    <figure class="sb-fig">
      <StepSketch sketch={b.sketch} />
      {#if b.caption}<figcaption>{say(b.caption)}</figcaption>{/if}
    </figure>
  {:else if b.kind === 'note'}
    <p class="sb-callout {b.tone}">{say(b.text)}</p>
  {:else if b.kind === 'sub'}
    <section class="sb-sub">
      <h4>{say(b.title)}</h4>
      <StepBlocks blocks={b.blocks} {detail} />
    </section>
  {:else if b.kind === 'compare'}
    <div class="sb-scroll">
      <table class="sb-table sb-compare">
        <thead><tr><th></th><th>{t('steps.view.compare.method')}</th><th>{t('steps.view.compare.matrix')}</th><th>{t('steps.view.compare.diff')}</th></tr></thead>
        <tbody>
          {#each b.rows as r}
            <tr><th><MathEquation equation={r.label} /></th><td>{numText(r.method)} {r.unit}</td><td>{numText(r.matrix)} {r.unit}</td><td>{diffOf(r.method, r.matrix)}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if b.caption}<p class="sb-caption">{say(b.caption)}</p>{/if}
  {/if}
{/each}

<style>
  .sb-p { margin: 0.4rem 0; font-size: 0.82rem; line-height: 1.45; color: var(--st-text); }
  .sb-p.detail { color: var(--st-text-2); }
  .sb-note-small { margin: -0.2rem 0 0.4rem; font-size: 0.74rem; color: var(--st-text-2); text-align: center; }
  .sb-eq { overflow-x: auto; }
  .sb-calc {
    margin: 0.55rem 0; padding: 0.35rem 0.55rem;
    border-left: 2px solid var(--st-hair-strong);
    background: color-mix(in srgb, var(--st-surface-2) 60%, transparent);
    border-radius: 0 var(--st-radius) var(--st-radius) 0;
  }
  .sb-calc-label { font-size: 0.74rem; font-weight: 600; color: var(--st-text); margin-bottom: 0.1rem; }
  .sb-row { display: grid; grid-template-columns: 5.6rem 1fr; align-items: center; gap: 0.4rem; }
  .sb-tag { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--st-text-3); }
  .sb-math { overflow-x: auto; min-width: 0; }
  .sb-math :global(.math-eq.display) { margin: 0.2rem 0; text-align: left; }
  .sb-row.result .sb-tag { color: var(--st-accent); }
  .sb-row.check .sb-tag { color: #2fb36b; }
  .sb-scroll { overflow-x: auto; max-width: 100%; }
  .sb-table { border-collapse: collapse; margin: 0.45rem auto; font-size: 0.76rem; color: var(--st-text); }
  .sb-table th, .sb-table td { padding: 0.2rem 0.5rem; border-bottom: 1px solid var(--st-hair); text-align: center; white-space: nowrap; }
  .sb-table thead th { border-bottom: 1px solid var(--st-hair-strong); font-weight: 600; color: var(--st-text-2); }
  .sb-matrix td { font-variant-numeric: tabular-nums; }
  .sb-mname { text-align: center; margin-top: 0.3rem; }
  .sb-caption, .sb-fig figcaption { font-size: 0.72rem; font-style: italic; color: var(--st-text-2); text-align: center; margin: 0.1rem 0 0.5rem; }
  .sb-fig { margin: 0.5rem 0; padding: 0.3rem; border: 1px solid var(--st-hair); border-radius: var(--st-radius); background: color-mix(in srgb, var(--st-surface-2) 40%, transparent); }
  .sb-callout { font-size: 0.78rem; margin: 0.5rem 0; padding: 0.4rem 0.6rem; border-radius: var(--st-radius); border: 1px solid var(--st-hair-strong); }
  .sb-callout.info { border-color: color-mix(in srgb, #4f8ef7 55%, transparent); }
  .sb-callout.warn { border-color: color-mix(in srgb, #f59e0b 60%, transparent); }
  .sb-callout.ok { border-color: color-mix(in srgb, #2fb36b 60%, transparent); }
  .sb-sub { margin: 0.6rem 0 0.4rem; }
  .sb-sub h4 { margin: 0.2rem 0; font-size: 0.84rem; color: var(--st-accent); font-weight: 600; }
</style>
