<script lang="ts">
  /**
   * What holds a built-up section together — CIRSOC 301 §E.6.
   *
   * Renders `battenPlan()` and computes nothing. Every number on screen carries the dotted
   * clause it came from, and the batten's own dimensions are shown as unavailable with the
   * reason, because the code names no thickness, width or depth anywhere in §E.6 — only `Ip`,
   * and only inside a condition.
   *
   * The spacing is the one worth reading twice. A section has no length, so `a` is null here
   * and stays null until the section is on a member. Showing `L/3` against an assumed length
   * would be a fabricated dimension in the one place the brief is most explicit about.
   */
  import { t } from '../../../lib/i18n';
  import type { BattenPlan, BattenQuantity } from '../../../lib/section/battens';

  interface Props { plan: BattenPlan }
  const { plan }: Props = $props();

  function show(q: BattenQuantity): string {
    if (q.value === null) return '—';
    if (q.unit === 'count') return String(q.value);
    if (q.unit === 'm') return `${(q.value * 100).toFixed(1)} cm`;
    return `${q.value.toFixed(1)} ${q.unit}`;
  }

  const rows = $derived([
    { key: 'battens.minSegments', q: plan.minSegments },
    { key: 'battens.intermediate', q: plan.intermediateCount },
    { key: 'battens.spacing', q: plan.spacing },
    { key: 'battens.maxSpacing', q: plan.maxSpacingFromSlenderness },
    { key: 'battens.planes', q: plan.planes },
  ]);
</script>

<div class="battens" data-testid="batten-panel">
  <h4>{t('battens.title')}</h4>

  <p class="group" data-testid="batten-group">
    {t('battens.group')}: <strong>{t(`battens.group.${plan.group}`)}</strong>
  </p>

  {#if !plan.inScope}
    <p class="note" data-testid="batten-out-of-scope">{t('battens.notBuiltUp')}</p>
  {:else}
    <table>
      <tbody>
        {#each rows as row (row.key)}
          <tr data-testid={`batten-row-${row.key.split('.')[1]}`}>
            <th scope="row">{t(row.key)}</th>
            <td class="mono">{show(row.q)}</td>
            <!-- The clause, on every row. A number from §E.6 and a number derived from it are
                 different facts, and the clause is what tells them apart. -->
            <td class="clause">§{row.q.clause}</td>
          </tr>
          <tr class="why"><td colspan="3">{t(row.q.noteKey)}</td></tr>
        {/each}
      </tbody>
    </table>

    <section class="gap" data-testid="batten-geometry-unavailable">
      <h5>{t('battens.geometryUnavailable')} — {plan.geometry.state}</h5>
      <ul>
        {#each plan.geometry.missingKeys as k (k)}<li>{t(k)}</li>{/each}
      </ul>
      <p class="note">
        {t(plan.geometry.conditionKey)} <span class="clause">§{plan.geometry.conditionClause}</span>
      </p>
    </section>

    <ul class="rules" data-testid="batten-rules">
      {#each plan.ruleKeys as k (k)}<li>{t(k)}</li>{/each}
    </ul>
  {/if}
</div>

<style>
  .battens { display: flex; flex-direction: column; gap: 6px; font-size: 0.7rem; }
  h4 {
    margin: 0; font-size: 0.68rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--st-text-3);
  }
  h5 { margin: 0 0 2px; font-size: 0.68rem; color: var(--st-warn); }
  .group { margin: 0; color: var(--st-text-2); }
  .group strong { color: var(--st-text); font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th[scope='row'] { text-align: left; font-weight: 400; color: var(--st-text-2); padding: 2px 0; }
  td { padding: 2px 0 2px 8px; color: var(--st-text); }
  .mono { font-family: var(--st-mono, monospace); text-align: right; }
  .clause { color: var(--st-text-3); font-size: 0.64rem; white-space: nowrap; }
  tr.why td { padding: 0 0 4px; color: var(--st-text-3); font-size: 0.64rem; line-height: 1.35; }
  .gap {
    border: 1px solid var(--st-hair); border-radius: 4px; padding: 6px;
    background: var(--st-bg);
  }
  .note { margin: 0; color: var(--st-text-2); line-height: 1.4; }
  ul { margin: 0; padding-left: 1.1em; color: var(--st-text-2); line-height: 1.4; }
  .rules { font-size: 0.66rem; }
</style>
