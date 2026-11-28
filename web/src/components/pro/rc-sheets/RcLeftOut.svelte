<script lang="ts">
  /** The members in concrete the sheets do not design, and the columns whose torsion they do not check, each with why. */
  import { i18n, t, tp, tpn } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { LeftOut } from '../../../lib/rc-sheets/coverage';

  let { left }: { left: readonly LeftOut[] } = $props();
  const out = $derived(left.filter((x) => x.reason !== 'torsion' && x.reason !== 'fcAssumed'));
  const torsion = $derived(left.filter((x) => x.reason === 'torsion'));
  const assumed = $derived(left.filter((x) => x.reason === 'fcAssumed'));
  const members = $derived(out.reduce((s, x) => s + x.members, 0));
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const line = (x: LeftOut) => x.reason === 'notPhysical'
    ? tpn(`rcSheets.leftOut.notPhysical.${x.kind === 'shell' ? 'shells' : 'bars'}`, x.members)
    : x.reason === 'torsion'
      ? tp('rcSheets.leftOut.torsion', { name: x.name ?? '', level: x.level ?? '—', tu: fmt(x.tu ?? 0, 1), limit: fmt(x.limit ?? 0, 1) })
      : x.reason === 'fcAssumed'
        ? tp('rcSheets.leftOut.fcAssumed', { name: x.name ?? '', level: x.level ?? '—', fc: fmt(x.fc ?? 0, 0) })
        : tp(`rcSheets.leftOut.${x.reason}`, { name: x.name ?? '', level: x.level ?? '—', kind: t(`rcSheets.leftOut.kindName.${['beam', 'column', 'brace', 'slab', 'wall'].includes(x.kind ?? '') ? x.kind : 'other'}`) });
</script>

{#if left.length}
  <details class="rclo" data-testid="rc-left-out">
    <summary data-testid="rc-left-out-summary">{[...(out.length ? [tpn('rcSheets.leftOut.summary', members)] : []), ...(torsion.length ? [tpn('rcSheets.leftOut.torsionSummary', torsion.length)] : []), ...(assumed.length ? [tpn('rcSheets.leftOut.fcSummary', assumed.length)] : [])].join(' · ')}</summary>
    <ul>
      {#each left as x, i (i)}<li data-testid="rc-left-out-row" data-reason={x.reason}>{line(x)}</li>{/each}
    </ul>
    <p>{t('rcSheets.leftOut.note')}</p>
  </details>
{/if}

<style>
  .rclo { margin: 0; font-size: 0.72rem; line-height: 1.45; color: var(--st-text); border: 1px solid var(--st-warn); border-radius: 4px; padding: 4px 8px; max-width: 120ch; }
  summary { cursor: pointer; color: var(--st-warn); font-weight: 600; }
  ul { margin: 4px 0 0; padding-left: 1.2em; }
  p { margin: 4px 0 0; color: var(--st-text-2); }
</style>
