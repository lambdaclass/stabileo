<script lang="ts">
  import { t, tp } from '../../lib/i18n';
  import type { AdsOverview, Display } from '../../lib/api/marketing-admin';
  import { count, money } from './ads-format';

  let { goals, display }: { goals: AdsOverview['goals']; display: Display } = $props();
  const ORDER = ['signups', 'activations', 'clicks'] as const;
</script>

<div class="ins-panel" data-testid="ads-goals">
  <h2>{t('admin.ads.goals')}</h2>
  <p class="ads-help">{t('admin.ads.goalsHelp')}</p>
  <table class="ins-table">
    <thead><tr><th>{t('admin.ads.goal.title')}</th><th>{t('admin.ads.kpi.spend')}</th><th>{t('admin.ads.goalCount')}</th><th>{t('admin.ads.goalCost')}</th><th>{t('admin.ads.goalOther')}</th></tr></thead>
    <tbody>
      {#each ORDER as key (key)}
        {@const g = goals.metrics[key]}
        <tr data-testid={`ads-goal-${key}`}>
          <td>{t(`admin.ads.goal.${key}`)}</td>
          <td class="ins-mono">{money(g.spend, display)}</td>
          <td class="ins-mono">{count(g.count)}</td>
          <td class="ins-mono">{money(g.cost, display)}</td>
          <td class="ins-mono">{count(g.other)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if goals.unassigned.awareness > 0 || goals.unassigned.other > 0}
    <p class="ads-help">{tp('admin.ads.unassigned', { awareness: money(goals.unassigned.awareness, display), other: money(goals.unassigned.other, display) })}</p>
  {/if}
</div>

<style>
  .ads-help { margin: 6px 0 10px; font-size: 0.7rem; color: var(--st-text-2); }
  .ins-panel :global(.ins-mono) { white-space: nowrap; }
</style>
