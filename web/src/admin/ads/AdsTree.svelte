<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from '../../lib/i18n';
  import type { AcquisitionSummary, CampaignSummary } from '../../lib/api/marketing-admin';
  import { channelLabel, count, percent } from './ads-format';

  let { campaigns }: { campaigns: CampaignSummary[] } = $props();

  const open = new SvelteSet<string>();

  function toggle(id: string) {
    if (open.has(id)) open.delete(id);
    else open.add(id);
  }

  type Line = { id: string; depth: number; title: string; meta: string | null; row: AcquisitionSummary; expandable: boolean };

  const lines = $derived.by(() => {
    const out: Line[] = [];
    for (const c of campaigns) {
      const cid = `${c.channel}|${c.campaign}`;
      out.push({ id: cid, depth: 0, title: c.campaign, meta: channelLabel(c.channel), row: c, expandable: c.ad_sets.length > 0 });
      if (!open.has(cid)) continue;
      for (const s of c.ad_sets) {
        const sid = `${cid}|${s.ad_set ?? ''}`;
        out.push({ id: sid, depth: 1, title: s.ad_set ?? t('admin.ads.none'), meta: null, row: s, expandable: s.ads.length > 0 });
        if (!open.has(sid)) continue;
        for (const a of s.ads) out.push({ id: `${sid}|${a.ad ?? ''}`, depth: 2, title: a.ad ?? t('admin.ads.none'), meta: null, row: a, expandable: false });
      }
    }
    return out;
  });

  const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);
</script>

<div class="ins-panel" data-testid="ads-tree">
  <h2>{t('admin.ads.tree')}</h2>
  <p class="ads-help">{t('admin.ads.treeHelp')}</p>
  {#if campaigns.length === 0}
    <p class="ins-muted">{t('admin.ads.noCampaigns')}</p>
  {:else}
    <div class="ins-table-wrap">
      <table class="ins-table ads-table">
        <thead>
          <tr>
            <th>{t('admin.ads.col.name')}</th>
            <th>{t('admin.ads.acq.accounts')}</th>
            <th>{t('admin.ads.acq.analyzedRate')}</th>
            <th>{t('admin.ads.acq.savedRate')}</th>
            <th>{t('admin.ads.acq.returnedRate')}</th>
          </tr>
        </thead>
        <tbody>
          {#each lines as line (line.id)}
            <tr data-testid={`ads-row-${line.depth}`}>
              <td>
                <div class="ads-name" style:padding-left={`${line.depth * 18}px`}>
                  {#if line.expandable}
                    <button type="button" class="ads-twist" aria-expanded={open.has(line.id)} aria-label={t('admin.ads.expand')} onclick={() => toggle(line.id)}>{open.has(line.id) ? '−' : '+'}</button>
                  {:else}
                    <span class="ads-twist-space"></span>
                  {/if}
                  <span>
                    <span class="ads-title">{line.title}</span>
                    {#if line.meta}<span class="ads-meta">{line.meta}</span>{/if}
                  </span>
                </div>
              </td>
              <td class="ins-mono strong">{count(line.row.accounts)}</td>
              <td class="ins-mono">{percent(rate(line.row.analyzed, line.row.accounts))}</td>
              <td class="ins-mono">{percent(rate(line.row.saved, line.row.accounts))}</td>
              <td class="ins-mono">{percent(rate(line.row.returned, line.row.return_eligible))}</td>
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
  .ads-twist { width: 22px; height: 22px; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 3px; cursor: pointer; font-size: 0.7rem; padding: 0; flex: none; }
  .ads-twist-space { width: 22px; flex: none; }
  .ads-title { display: block; font-weight: 600; font-size: 0.78rem; overflow-wrap: anywhere; }
  .ads-meta { display: block; font-size: 0.66rem; color: var(--st-text-2); }
  .strong { font-weight: 700; }
  .ads-table :global(.ins-mono) { white-space: nowrap; }
</style>
