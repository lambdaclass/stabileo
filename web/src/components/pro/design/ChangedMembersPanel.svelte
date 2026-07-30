<script lang="ts">
  /**
   * Changed-members review: what was edited by hand, what was auto-designed, and
   * which members retained a PROVISIONAL (failing, uncertified) candidate.
   *
   * Provisional entries are listed here by contract: they are never assigned to the
   * model, never certified and never counted as passing (approved decision O3).
   */
  import { t, tp } from '../../../lib/i18n';
  import { verificationStore } from '../../../lib/store';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  import { revertReinforcement } from '../../../lib/store/rebar-edit';
  import OutcomeBadge from './OutcomeBadge.svelte';

  interface Props { onClose: () => void; onFocusElement: (id: number) => void }
  let { onClose, onFocusElement }: Props = $props();

  const edited = $derived([...designRunStore.manualOverrides].sort((a, b) => a - b));
  const provisional = $derived([...designRunStore.provisionalIds].sort((a, b) => a - b));
  const orientation = $derived(verificationStore.orientationIssues);

  function status(id: number) { return verificationStore.getDisplayStatus(id); }
  function util(id: number) {
    const u = verificationStore.getDisplayRatio(id);
    return u === null ? '—' : Number.isFinite(u) ? u.toFixed(2) : '∞';
  }
</script>

<div class="panel" data-testid="changed-members-panel" role="region" aria-label={t('design.changed.title')}>
  <div class="head">
    <strong>{t('design.changed.title')}</strong>
    <span class="muted">{edited.length}</span>
    {#if edited.length > 0}
      <button class="btn" data-testid="revert-all" onclick={() => revertReinforcement(edited)}>
        {t('design.changed.revertAll')}
      </button>
    {/if}
    <button class="x" onclick={onClose} aria-label={t('design.batch.cancel')} data-testid="changed-close">×</button>
  </div>

  {#if edited.length === 0}
    <div class="empty">{t('design.changed.none')}</div>
  {:else}
    <ul class="list">
      {#each edited as id (id)}
        <li data-testid={`changed-row-${id}`}>
          <button class="link mono" onclick={() => onFocusElement(id)}>{id}</button>
          <OutcomeBadge status={status(id)} compact />
          <span class="mono">u {util(id)}</span>
          <OutcomeBadge flag="edited" />
          <button class="btn btn-sm" data-testid={`revert-${id}`}
                  onclick={() => revertReinforcement([id])}>{t('design.changed.revertOne')}</button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if provisional.length > 0}
    <div class="head sub">
      <strong>{t('design.changed.provisionalTitle')}</strong>
      <span class="muted">{provisional.length}</span>
    </div>
    <ul class="list">
      {#each provisional as id (id)}
        {@const o = verificationStore.outcomeFor(id)}
        <li data-testid={`provisional-row-${id}`}>
          <button class="link mono" onclick={() => onFocusElement(id)}>{id}</button>
          {#if o}<OutcomeBadge outcome={o.outcome} compact />{/if}
          <OutcomeBadge flag="provisional" />
          {#if o?.provisional}
            <span class="mono">u {Number.isFinite(o.provisional.worstUtilization) ? o.provisional.worstUtilization.toFixed(2) : '∞'}</span>
            <span class="muted">{o.provisional.failingCheckCount} failing</span>
          {/if}
          {#if o?.limiting?.length}<span class="muted">{o.limiting.join(', ')}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if orientation.length > 0}
    <div class="head sub">
      <strong>{t('design.banner.orientationDetail')}</strong>
      <span class="muted">{orientation.length}</span>
    </div>
    <ul class="list">
      {#each orientation as iss (iss.elementId + iss.kind)}
        <li data-testid={`orientation-row-${iss.elementId}`}>
          <button class="link mono" onclick={() => onFocusElement(iss.elementId)}>{iss.elementId}</button>
          <span class="issue">{tp(iss.messageKey, iss.params)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .panel { border-top: 1px solid #1d3a5c; background: #081524; padding: 6px 10px;
    max-height: 30vh; overflow: auto; flex-shrink: 0; }
  .head { display: flex; align-items: center; gap: 8px; font-size: 0.74rem; color: #bcd; }
  .head.sub { margin-top: 7px; padding-top: 5px; border-top: 1px dashed #16304f; }
  .x { margin-left: auto; background: none; border: none; color: #9ab; font-size: 1.1rem; cursor: pointer; }
  .muted { color: #778; font-size: 0.68rem; }
  .empty { padding: 6px 0; font-size: 0.7rem; color: #667; font-style: italic; }
  .list { list-style: none; margin: 3px 0 0; padding: 0; }
  li { display: flex; align-items: center; gap: 7px; padding: 1px 0;
    font-size: 0.68rem; border-bottom: 1px solid #10233c; flex-wrap: wrap; }
  .link { background: none; border: none; color: #9fd8ff; cursor: pointer;
    padding: 0; text-decoration: underline; font-size: 0.68rem; }
  .link:focus-visible { outline: 2px solid #4ecdc4; outline-offset: 1px; }
  .mono { font-family: monospace; color: #ccd; }
  .issue { color: #ffcc9a; }
  .btn { padding: 1px 7px; background: #14304f; border: 1px solid #2a5a8a;
    border-radius: 3px; color: #dde; font-size: 0.66rem; cursor: pointer; }
  .btn-sm { margin-left: auto; }
  .btn:focus-visible { outline: 2px solid #4ecdc4; outline-offset: 1px; }
</style>
