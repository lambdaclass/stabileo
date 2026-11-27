<script lang="ts">
  import { t, tp } from '../../lib/i18n';
  import { modelStore } from '../../lib/store';
  import { proOnlyContent } from '../../lib/store/workspace-switch';

  type Props = { target: 'space' | 'plane'; onCopy: () => void; onStay: () => void };
  let { target, onCopy, onStay }: Props = $props();

  const pro = proOnlyContent();
  const drops = [
    pro.shells && tp('downgrade.shells', { n: pro.shells }),
    pro.shellLoads && tp('downgrade.shellLoads', { n: pro.shellLoads }),
    pro.constraints && tp('downgrade.constraints', { n: pro.constraints }),
    pro.connectors && tp('downgrade.connectors', { n: pro.connectors }),
    pro.selfWeightRule && t('downgrade.selfWeight'),
  ].filter((x): x is string => !!x);
  const keeps = tp('downgrade.keepsLine', {
    nodes: modelStore.nodes.size,
    members: modelStore.elements.size,
    supports: modelStore.supports.size,
    loads: modelStore.loads.length - pro.shellLoads,
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onStay(); }} />

<div class="dg-overlay" role="dialog" aria-modal="true" aria-labelledby="dg-title" data-testid="pro-to-basic">
  <button class="dg-backdrop" aria-label={t('downgrade.stay')} onclick={onStay}></button>
  <div class="dg-sheet">
    <h3 id="dg-title">{target === 'space' ? t('downgrade.titleSpace') : t('downgrade.titlePlane')}</h3>
    <p class="dg-intro">{t('downgrade.intro')}</p>

    <p class="dg-head ok">{t('downgrade.keeps')}</p>
    <p class="dg-line">{keeps}</p>

    <p class="dg-head warn">{t('downgrade.drops')}</p>
    <ul class="dg-list" data-testid="pro-to-basic-drops">
      {#each drops as d (d)}<li>{d}</li>{/each}
    </ul>

    <p class="dg-note">{t('downgrade.rest')}</p>

    <div class="dg-actions">
      <button class="dg-btn" onclick={onStay} data-testid="pro-to-basic-stay">{t('downgrade.stay')}</button>
      <button class="dg-btn dg-go" onclick={onCopy} data-testid="pro-to-basic-copy">
        {target === 'space' ? t('downgrade.copySpace') : t('downgrade.copyPlane')}
      </button>
    </div>
  </div>
</div>

<style>
  .dg-overlay { position: fixed; inset: 0; z-index: 900; display: flex; align-items: center; justify-content: center; }
  .dg-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); border: none; cursor: default; }
  .dg-sheet {
    position: relative;
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    padding: 16px 18px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h3 { margin: 0 0 4px; font-family: var(--st-display); font-size: 1.05rem; color: var(--st-text); }
  .dg-intro { margin: 0 0 6px; font-size: 0.82rem; line-height: 1.45; color: var(--st-text-2); }
  .dg-head {
    margin: 6px 0 0;
    font-family: var(--st-mono);
    font-size: 0.64rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .dg-head.ok { color: var(--st-ok, #3fb68b); }
  .dg-head.warn { color: var(--st-warn); }
  .dg-line { margin: 0; font-size: 0.8rem; color: var(--st-text); }
  .dg-list { margin: 0; padding-left: 1.1rem; font-size: 0.8rem; color: var(--st-text); display: flex; flex-direction: column; gap: 2px; }
  .dg-note { margin: 6px 0 0; font-size: 0.74rem; color: var(--st-text-3); }
  .dg-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .dg-btn {
    padding: 6px 12px;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .dg-btn:hover { background: var(--st-surface-3); }
  .dg-go { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-text-on-accent); }
  .dg-go:hover { background: var(--st-accent-hover); }
</style>
