<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { LineLayout } from '../../../lib/rc-sheets/beam-line';
  import type { BeamRow } from '../../../lib/rc-sheets/beam-row';
  import RcLineEditor from './RcLineEditor.svelte';
  import RcLineSvg from './RcLineSvg.svelte';
  import RcChecks from './RcChecks.svelte';
  import RcCombos from './RcCombos.svelte';
  import RcSteps from './RcSteps.svelte';

  let { line, spans }: { line: LineLayout; spans: BeamRow[] } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  let open = $state<string | null>(null);
  const kind = (k: string) => t(`rcSheets.line.kind.${k}`);
</script>

<RcLineEditor {line} />
<RcLineSvg {line} />
<table class="rcd" data-testid="rc-schedule">
  <thead><tr><th>{t('rcSheets.line.mark')}</th><th>{t('rcSheets.line.kind')}</th><th>{t('rcSheets.col.bars')}</th><th class="n">{t('rcSheets.line.from')}</th><th class="n">{t('rcSheets.line.to')}</th><th class="n">{t('rcSheets.line.length')}</th><th class="n">kg</th></tr></thead>
  <tbody>
    {#each line.bars as b (b.mark)}
      <tr><td>{b.mark}</td><td>{kind(b.kind)} ({t(b.face === 'top' ? 'rcSheets.col.top' : 'rcSheets.col.bottom')})</td><td>{b.bars.count} Ø{b.bars.dia}{b.hooks[0] || b.hooks[1] ? ' ⌐' : ''}</td>
        <td class="n">{fmt(b.from)}</td><td class="n">{fmt(b.to)}</td><td class="n">{fmt(b.length)}</td><td class="n">{fmt(b.weight, 1)}</td></tr>
    {/each}
  </tbody>
</table>
<RcChecks lines={line.verifications} />
<details>
  <summary>{t('rcSheets.steps')}</summary>
  <RcSteps groups={line.steps} />
</details>
<h5 class="rcd-h">{t('rcSheets.line.spanChecks')}</h5>
{#each spans as s (s.key)}
  <div class="rcd-span st-{s.status}">
    <button type="button" class="rcd-toggle" onclick={() => (open = open === s.key ? null : s.key)} data-testid="rc-span-toggle">
      <strong>{s.name}</strong> <span>{t(`rcSheets.status.${s.status}`)}</span>
    </button>
    {#if open === s.key}
      <RcChecks lines={s.verifications} />
      <details open={s.status === 'fail'}>
        <summary>{t('rcSheets.combo.title')} ({s.combos.rows.length})</summary>
        <RcCombos table={s.combos} />
      </details>
      <details>
        <summary>{t('rcSheets.steps')}</summary>
        <RcSteps groups={s.steps} />
      </details>
    {/if}
  </div>
{/each}

<style>
  .rcd { width: 100%; border-collapse: collapse; font-size: 0.72rem; margin-bottom: 8px; }
  th { text-align: left; font-weight: 600; color: var(--st-text-2); padding: 3px 6px; border-bottom: 1px solid var(--st-hair); background: var(--st-surface-2); }
  td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); color: var(--st-text); }
  .n { text-align: right; font-family: var(--st-mono); }
  details { margin: 4px 0 8px; }
  summary { cursor: pointer; font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); margin-bottom: 4px; }
  .rcd-h { margin: 8px 0 4px; font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--st-text-2); }
  .rcd-span { border: 1px solid var(--st-hair); border-radius: 6px; padding: 4px 8px; margin-bottom: 4px; }
  .rcd-toggle { background: none; border: none; color: var(--st-text); font-size: 0.74rem; cursor: pointer; display: flex; gap: 8px; padding: 2px 0; }
  .st-ok .rcd-toggle span { color: var(--st-ok); }
  .st-warn .rcd-toggle span { color: var(--st-warn); }
  .st-fail .rcd-toggle span { color: var(--st-danger); }
</style>
