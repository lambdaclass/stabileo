<script lang="ts">
  import { t, tp, i18n } from '../../lib/i18n';
  import { cloudProjects } from '../../lib/store/cloud-projects.svelte';
  import { errorText } from '../../lib/api/error-text';
  import { uiStore } from '../../lib/store';
  import type { CloudProject } from '../../lib/api/projects';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let search = $state('');
  let error = $state<string | null>(null);
  let busyId = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let newName = $state('');

  $effect(() => {
    if (open) void load();
  });

  async function load() {
    error = null;
    try {
      await cloudProjects.refresh(search.trim() || undefined);
    } catch (e) {
      error = errorText(e);
    }
  }

  async function save(asNew: boolean) {
    error = null;
    try {
      await cloudProjects.saveCurrent({ asNew });
      uiStore.toast(t('cloud.saved'), 'success');
    } catch (e) {
      error = errorText(e);
    }
  }

  async function act(id: string, run: () => Promise<void>) {
    busyId = id;
    error = null;
    try {
      await run();
    } catch (e) {
      error = errorText(e);
    } finally {
      busyId = null;
    }
  }

  function openProject(p: CloudProject) {
    void act(p.id, async () => {
      await cloudProjects.open(p.id);
      open = false;
    });
  }

  function replace(p: CloudProject) {
    if (!confirm(tp('cloud.confirmReplace', { name: p.name }))) return;
    void act(p.id, async () => {
      await cloudProjects.replace(p.id);
      uiStore.toast(t('cloud.saved'), 'success');
    });
  }

  const mustReplace = $derived(!cloudProjects.linkedId && cloudProjects.atLimit);

  function remove(p: CloudProject) {
    if (!confirm(tp('cloud.confirmDelete', { name: p.name }))) return;
    void act(p.id, () => cloudProjects.remove(p.id));
  }

  function startRename(p: CloudProject) {
    renaming = p.id;
    newName = p.name;
  }

  function commitRename(p: CloudProject) {
    const name = newName.trim();
    renaming = null;
    if (!name || name === p.name) return;
    void act(p.id, () => cloudProjects.rename(p.id, name));
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const fmtSize = (b: number) => (b >= 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} kB`);
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="cp-overlay" onclick={() => (open = false)} onkeydown={(e) => e.key === 'Escape' && (open = false)}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="cp" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="cp-title" data-testid="cloud-projects">
      <h3 id="cp-title">{t('cloud.title')}</h3>
      <p class="lede">{t('cloud.lede')}</p>

      <div class="cp-save">
        {#if mustReplace}
          <p class="limit" data-testid="cloud-limit">{tp(cloudProjects.maxProjects === 1 ? 'cloud.limitOne' : 'cloud.limitMany', { max: cloudProjects.maxProjects })}</p>
        {:else}
          <button class="btn primary" onclick={() => save(false)} disabled={cloudProjects.saving} data-testid="cloud-save">
            {cloudProjects.linkedId ? t('cloud.saveChanges') : t('cloud.saveCurrent')}
          </button>
          {#if cloudProjects.linkedId && !cloudProjects.atLimit}
            <button class="btn" onclick={() => save(true)} disabled={cloudProjects.saving} data-testid="cloud-save-new">{t('cloud.saveAsNew')}</button>
          {/if}
        {/if}
        <span class="count">{tp('cloud.count', { n: cloudProjects.total, max: cloudProjects.maxProjects })}</span>
      </div>

      <input class="cp-search" type="search" placeholder={t('cloud.search')} bind:value={search} oninput={() => void load()} data-testid="cloud-search" />

      {#if error}<p class="err" role="alert" data-testid="cloud-error">{error}</p>{/if}

      {#if cloudProjects.items.length === 0 && !cloudProjects.loading}
        <p class="empty">{t('cloud.empty')}</p>
      {:else}
        <ul class="cp-list">
          {#each cloudProjects.items as p (p.id)}
            <li class="cp-row" class:linked={p.id === cloudProjects.linkedId} data-testid="cloud-row">
              <div class="cp-main">
                {#if renaming === p.id}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input class="cp-rename" bind:value={newName} autofocus aria-label={t('cloud.newName')}
                    onkeydown={(e) => { if (e.key === 'Enter') commitRename(p); if (e.key === 'Escape') renaming = null; }}
                    onblur={() => commitRename(p)} />
                {:else}
                  <span class="cp-name">{p.name}</span>
                {/if}
                <span class="cp-meta">
                  <span class="tag">{p.app_mode === 'pro' ? t('cloud.modePro') : t('cloud.modeBasic')}</span>
                  {#if p.element_count !== null}{tp('cloud.members', { n: p.element_count })} · {/if}{fmtSize(p.content_bytes)} · {fmtDate(p.updated_at)}
                </span>
              </div>
              <div class="cp-actions">
                {#if mustReplace}
                  <button class="btn primary" onclick={() => replace(p)} disabled={busyId === p.id || cloudProjects.saving} data-testid="cloud-replace">{t('cloud.replace')}</button>
                {/if}
                <button class="btn" onclick={() => openProject(p)} disabled={busyId === p.id} data-testid="cloud-open">{t('cloud.open')}</button>
                <button class="btn" onclick={() => startRename(p)} disabled={busyId === p.id}>{t('cloud.rename')}</button>
                <button class="btn danger" onclick={() => remove(p)} disabled={busyId === p.id} data-testid="cloud-delete">{t('cloud.delete')}</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="footer">
        <button class="btn" onclick={() => (open = false)}>{t('cloud.close')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .cp-overlay {
    position: fixed;
    inset: 0;
    z-index: 210;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--st-bg) 72%, transparent);
  }
  .cp {
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 18px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.35);
    color: var(--st-text);
  }
  h3 { margin: 0 0 4px; font-size: 0.95rem; font-weight: 600; }
  .lede { margin: 0 0 12px; font-size: 0.72rem; line-height: 1.5; color: var(--st-text-3); }
  .cp-save { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
  .limit { margin: 0; flex: 1; font-size: 0.72rem; line-height: 1.45; color: var(--st-text-2); }
  .count { margin-left: auto; font-size: 0.66rem; color: var(--st-text-3); }
  .cp-search, .cp-rename {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font: inherit;
    font-size: 0.76rem;
  }
  .cp-search { margin-bottom: 10px; }
  .cp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .cp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-left: 2px solid transparent;
    border-radius: var(--st-radius);
  }
  .cp-row.linked { border-left-color: var(--st-accent); }
  .cp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .cp-name { font-size: 0.8rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cp-meta { font-size: 0.64rem; color: var(--st-text-3); }
  .tag {
    display: inline-block;
    margin-right: 4px;
    padding: 0 5px;
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    font-size: 0.6rem;
  }
  .cp-actions { display: flex; gap: 4px; flex: none; }
  .empty { font-size: 0.74rem; color: var(--st-text-3); }
  .err { margin: 0 0 8px; font-size: 0.7rem; color: var(--st-bad, #e06c75); }
  .footer { display: flex; justify-content: flex-end; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--st-hair); }
  .btn {
    padding: 5px 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.primary {
    background: color-mix(in srgb, var(--st-accent) 18%, var(--st-surface-2));
    border-color: color-mix(in srgb, var(--st-accent) 55%, transparent);
    color: var(--st-text);
    font-weight: 600;
  }
  .btn.danger:hover:not(:disabled) { border-color: var(--st-bad, #e06c75); color: var(--st-bad, #e06c75); }
  @media (max-width: 560px) {
    .cp-row { flex-direction: column; align-items: stretch; }
  }
</style>
