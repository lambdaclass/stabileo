<script lang="ts">
  // Re-openable CAD draft provenance panel (PR [14] Layer 1).
  //
  // After a CAD draft is applied, the assumptions/warnings shown at wizard
  // step 4 are no longer visible in the live app — only a status-bar badge.
  // This panel re-surfaces the full provenance (file, date, status, the
  // engineering assumptions, and the layer-role mapping in effect) on demand,
  // and lets the user mark the draft reviewed from here.
  import { modelStore, uiStore } from '../lib/store';
  import { t } from '../lib/i18n';

  let { open = false, onclose = (() => {}) as () => void } = $props();

  const prov = $derived(modelStore.model.provenance ?? null);

  function markReviewed(): void {
    modelStore.markProvenanceReviewed();
    uiStore.toast(t('cad.markedReviewed'), 'success');
    onclose();
  }
</script>

{#if open && prov}
  <div class="overlay" role="presentation" onclick={onclose}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dialog" role="dialog" aria-label={t('cad.provTitle')} onclick={(e) => e.stopPropagation()}>
      <div class="header">
        <h2>{t('cad.provTitle')}</h2>
        <button class="close-btn" onclick={onclose} title={t('cad.cancel')}>✕</button>
      </div>
      <div class="body">
        <div class="meta">
          <div><span class="lbl">{t('cad.provFile')}</span> <span class="mono">{prov.fileName}</span></div>
          <div><span class="lbl">{t('cad.provDate')}</span> {prov.importedAtIso.slice(0, 10)}</div>
          <div>
            <span class="lbl">{t('cad.provStatus')}</span>
            <span class="status {prov.status === 'cad-draft-unreviewed' ? 'unrev' : 'rev'}">
              {prov.status === 'cad-draft-unreviewed' ? t('cad.provUnreviewed') : t('cad.provReviewed')}
            </span>
          </div>
        </div>

        <h3>{t('cad.assumptions')}</h3>
        <div class="assumptions">
          {#each prov.assumptions as a}
            <div class="assumption-line">• {a}</div>
          {/each}
        </div>

        {#if prov.layerMappings && prov.layerMappings.length > 0}
          <h3>{t('cad.provLayerMap')}</h3>
          <div class="role-summary">
            {#each prov.layerMappings.filter((m) => m.role !== 'ignore') as m}
              <span class="mono">{m.layer} → {t(`cad.role.${m.role}`)}</span>
            {/each}
          </div>
        {/if}
      </div>
      <div class="footer">
        <button class="btn" onclick={onclose}>{t('cad.cancel')}</button>
        <span class="spacer"></span>
        {#if prov.status === 'cad-draft-unreviewed'}
          <button class="btn apply" onclick={markReviewed}>{t('cad.markReviewedBtn')}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center; z-index: 960;
  }
  .dialog {
    background: #16213e; border: 1px solid #1a4a7a; border-radius: 8px;
    width: 640px; max-width: 94vw; max-height: 88vh;
    display: flex; flex-direction: column; color: #ddd;
  }
  .header { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 1rem; border-bottom: 1px solid #1a4a7a; }
  .header h2 { margin: 0; font-size: 1rem; color: #4ecdc4; flex: 1; }
  .close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 1rem; }
  .close-btn:hover { color: #fff; }
  .body { padding: 0.8rem 1rem; overflow-y: auto; flex: 1; }
  .meta { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; margin-bottom: 0.5rem; }
  .lbl { color: #888; }
  .mono { font-family: monospace; font-size: 0.75rem; }
  .status.unrev { color: #f0a500; }
  .status.rev { color: #4ecdc4; }
  h3 { font-size: 0.7rem; text-transform: uppercase; color: #888; margin: 0.8rem 0 0.3rem; }
  .assumptions { display: flex; flex-direction: column; gap: 0.2rem; }
  .assumption-line { font-size: 0.76rem; color: #bbb; line-height: 1.35; }
  .role-summary { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.72rem; }
  .footer { display: flex; gap: 0.5rem; padding: 0.7rem 1rem; border-top: 1px solid #1a4a7a; }
  .spacer { flex: 1; }
  .btn { padding: 0.4rem 0.9rem; border-radius: 4px; font-size: 0.78rem; cursor: pointer; background: #0f3460; color: #ccc; border: 1px solid #1a4a7a; }
  .btn:hover { border-color: #4ecdc4; color: #fff; }
  .btn.apply { background: rgba(78, 205, 196, 0.25); color: #4ecdc4; border-color: #4ecdc4; font-weight: 600; }
</style>
