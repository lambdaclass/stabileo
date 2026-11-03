<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from '../../lib/i18n';
  import type { AdRow, Display } from '../../lib/api/marketing-admin';
  import { channelLabel, count, goalLabel, money, objectiveLabel, percent, resultLabel, statusLabel } from './ads-format';

  let { tree, display }: { tree: AdRow[]; display: Display } = $props();

  const open = new SvelteSet<string>();

  function toggle(id: string) {
    if (open.has(id)) open.delete(id);
    else open.add(id);
  }

  type Line = { row: AdRow; depth: number };

  const lines = $derived.by(() => {
    const out: Line[] = [];
    const walk = (rows: AdRow[], depth: number) => {
      for (const row of rows) {
        out.push({ row, depth });
        if (open.has(row.id)) walk(row.children ?? [], depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  });
</script>

<div class="ins-panel" data-testid="ads-tree">
  <h2>{t('admin.ads.tree')}</h2>
  <p class="ads-help">{t('admin.ads.treeHelp')}</p>
  {#if tree.length === 0}
    <p class="ins-muted">{t('admin.ads.noSpend')}</p>
  {:else}
    <div class="ins-table-wrap">
      <table class="ins-table ads-table">
        <thead>
          <tr>
            <th>{t('admin.ads.col.name')}</th>
            <th>{t('admin.ads.kpi.spend')}</th>
            <th>{t('admin.ads.kpi.clicks')}</th>
            <th>{t('admin.ads.col.ctr')}</th>
            <th>{t('admin.ads.kpi.signupClicks')}</th>
            <th>{t('admin.ads.kpi.signups')}</th>
            <th>{t('admin.ads.kpi.accounts')}</th>
            <th>{t('admin.ads.kpi.activated')}</th>
            <th>{t('admin.ads.col.costAccount')}</th>
            <th>{t('admin.ads.col.result')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each lines as { row, depth } (row.id)}
            <tr class={`lvl-${row.level}`} data-testid={`ads-row-${row.level}`}>
              <td style={`padding-left:${8 + depth * 18}px`}>
                <div class="ads-name">
                  {#if row.children?.length}
                    <button type="button" class="ads-twist" aria-expanded={open.has(row.id)} aria-label={t('admin.ads.expand')} onclick={() => toggle(row.id)}>{open.has(row.id) ? '▾' : '▸'}</button>
                  {:else}
                    <span class="ads-twist-space"></span>
                  {/if}
                  {#if row.thumbnail_url}<img class="ads-thumb" src={row.thumbnail_url} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
                  <span>
                    <span class="ads-title">{row.name ?? row.external_id}</span>
                    <span class="ads-meta">
                      {channelLabel(row.channel)} · {statusLabel(row.status)}
                      {#if row.level === 'campaign'} · {objectiveLabel(row.objective)} · {goalLabel(row.goal)}{/if}
                    </span>
                  </span>
                </div>
              </td>
              <td class="ins-mono">{money(row.spend, display)}</td>
              <td class="ins-mono">{count(row.clicks)}</td>
              <td class="ins-mono">{percent(row.ctr)}</td>
              <td class="ins-mono">{count(row.signup_clicks)}</td>
              <td class="ins-mono">{count(row.signups)}</td>
              <td class="ins-mono strong">{count(row.accounts)}</td>
              <td class="ins-mono">{count(row.activated)}</td>
              <td class="ins-mono">{money(row.cost_per_account, display)}</td>
              <td class="ads-result">{count(row.results)} <span class="ads-meta">{resultLabel(row.result_type)}</span></td>
              <td class="ads-links">
                {#if row.links.preview}<a href={row.links.preview} target="_blank" rel="noopener noreferrer">{t('admin.ads.link.preview')}</a>{/if}
                {#if row.links.instagram}<a href={row.links.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>{/if}
                {#if row.links.facebook}<a href={row.links.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>{/if}
                {#if row.links.manager}<a href={row.links.manager} target="_blank" rel="noopener noreferrer">{t('admin.ads.link.manager')}</a>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .ads-help { margin: -6px 0 10px; font-size: 0.7rem; color: var(--st-text-2); max-width: 90ch; }
  .ads-table td { vertical-align: middle; }
  .ads-name { display: flex; align-items: center; gap: 8px; min-width: 220px; }
  .ads-twist { width: 22px; height: 22px; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 3px; cursor: pointer; font-size: 0.7rem; padding: 0; }
  .ads-twist-space { width: 22px; flex: none; }
  .ads-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 3px; flex: none; }
  .ads-title { display: block; font-weight: 600; font-size: 0.78rem; }
  .ads-meta { display: block; font-size: 0.66rem; color: var(--st-text-2); }
  .ads-result { font-size: 0.74rem; }
  .ads-links { display: flex; flex-direction: column; gap: 2px; font-size: 0.68rem; white-space: nowrap; }
  .strong { font-weight: 700; }
  .ads-table :global(.ins-mono) { white-space: nowrap; }
  .lvl-ad_group td, .lvl-ad td { background: color-mix(in srgb, var(--st-surface-2) 50%, transparent); }
</style>
