<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    adminAllowlist, allowlistSearch, parseAllowlistQuery, type AllowlistQuery,
  } from './admin-allowlist.svelte';
  import { adminErrorText } from './error-text';
  import { formatDateTime } from './format';
  import { pageCount } from './list-query';
  import { fieldErrors } from '../lib/api/error-text';
  import { t, tp } from '../lib/i18n';

  const SEARCH_DEBOUNCE_MS = 300;

  const initial = parseAllowlistQuery(location.search);
  let query = $state<AllowlistQuery>(initial);
  let searchInput = $state(initial.search);
  let newEmail = $state('');
  let confirmId = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const listKey = $derived(JSON.stringify([query.search, query.includeRemoved, query.page]));
  const pages = $derived(pageCount(adminAllowlist.total, adminAllowlist.limit));
  const addFieldError = $derived(fieldErrors(adminAllowlist.addError).email ?? null);
  const addGeneralError = $derived(adminAllowlist.addError && !addFieldError ? adminErrorText(adminAllowlist.addError) : null);

  function setQuery(next: AllowlistQuery, replace = false) {
    query = next;
    const url = `${location.pathname}${allowlistSearch(next)}${location.hash}`;
    if (replace) history.replaceState(history.state, '', url);
    else history.pushState(history.state, '', url);
  }

  function onSearchInput() {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (searchInput.trim() !== query.search.trim()) setQuery({ ...query, search: searchInput, page: 1 }, true);
    }, SEARCH_DEBOUNCE_MS);
  }

  function goTo(page: number) {
    setQuery({ ...query, page: Math.min(Math.max(1, page), pages) });
  }

  async function submitAdd(e: SubmitEvent) {
    e.preventDefault();
    notice = null;
    const entry = await adminAllowlist.add(newEmail);
    if (entry) {
      newEmail = '';
      notice = tp('admin.allowlist.added', { email: entry.email });
    }
  }

  async function confirmRemove(id: string) {
    notice = null;
    const entry = await adminAllowlist.remove(id);
    confirmId = null;
    if (entry) notice = tp('admin.allowlist.removed', { email: entry.email });
  }

  async function readd(id: string) {
    notice = null;
    const entry = await adminAllowlist.readd(id);
    if (entry) notice = tp('admin.allowlist.added', { email: entry.email });
  }

  $effect(() => {
    void listKey;
    untrack(() => adminAllowlist.load(query));
  });

  onMount(() => {
    const onPop = () => {
      query = parseAllowlistQuery(location.search);
      searchInput = query.search;
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      clearTimeout(debounce);
    };
  });
</script>

<section class="adm-allow" aria-labelledby="adm-allow-title">
  <div class="adm-head">
    <h1 id="adm-allow-title" class="adm-h1">{t('admin.allowlist.title')}</h1>
    <span class="adm-count" data-testid="admin-allowlist-total">{tp('admin.users.total', { count: adminAllowlist.total })}</span>
  </div>
  <p class="adm-help">{t('admin.allowlist.lede')}</p>

  <form class="adm-add" onsubmit={submitAdd} novalidate data-testid="admin-allowlist-add">
    <label class="adm-add-field">
      <span class="adm-label">{t('admin.allowlist.addLabel')}</span>
      <input
        type="email"
        bind:value={newEmail}
        oninput={() => adminAllowlist.clearAddError()}
        placeholder={t('admin.allowlist.addPlaceholder')}
        aria-invalid={!!addFieldError}
        data-testid="admin-allowlist-email"
      />
      {#if addFieldError}<span class="adm-field-err" data-testid="admin-allowlist-email-error">{addFieldError}</span>{/if}
    </label>
    <button type="submit" class="adm-btn primary" disabled={adminAllowlist.adding || !newEmail.trim()} data-testid="admin-allowlist-add-submit">
      {adminAllowlist.adding ? t('admin.working') : t('admin.allowlist.add')}
    </button>
  </form>
  {#if addGeneralError}<p class="adm-error" role="alert">{addGeneralError}</p>{/if}
  {#if notice}<p class="adm-done" role="status" data-testid="admin-allowlist-notice">{notice}</p>{/if}

  <div class="adm-toolbar">
    <input
      type="search"
      class="adm-search"
      placeholder={t('admin.allowlist.search')}
      aria-label={t('admin.allowlist.search')}
      bind:value={searchInput}
      oninput={onSearchInput}
      data-testid="admin-allowlist-search"
    />
    <label class="adm-check">
      <input
        type="checkbox"
        checked={query.includeRemoved}
        onchange={(e) => setQuery({ ...query, includeRemoved: e.currentTarget.checked, page: 1 })}
        data-testid="admin-allowlist-include-removed"
      />
      {t('admin.allowlist.includeRemoved')}
    </label>
  </div>

  {#if adminAllowlist.listError}
    <div class="adm-banner" role="alert" data-testid="admin-allowlist-error">
      <span>{adminErrorText(adminAllowlist.listError)}</span>
      <button type="button" class="adm-btn" onclick={() => adminAllowlist.load(query)}>{t('admin.users.retry')}</button>
    </div>
  {/if}

  <div class="adm-table-wrap" class:busy={adminAllowlist.loading}>
    <table class="adm-table" data-testid="admin-allowlist-table">
      <thead>
        <tr>
          <th scope="col">{t('admin.col.email')}</th>
          <th scope="col">{t('admin.col.status')}</th>
          <th scope="col">{t('admin.allowlist.addedBy')}</th>
          <th scope="col">{t('admin.allowlist.addedAt')}</th>
          <th scope="col" class="adm-actions-col"><span class="adm-sr">{t('admin.allowlist.actions')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each adminAllowlist.rows as row (row.id)}
          <tr data-testid="admin-allowlist-row">
            <td class="adm-email">{row.email}</td>
            <td>
              <span class="adm-badge" class:off={!row.is_active}>
                {row.is_active ? t('admin.status.active') : t('admin.allowlist.statusRemoved')}
              </span>
            </td>
            <td class="adm-muted-cell">{row.added_by?.email ?? t('admin.allowlist.system')}</td>
            <td class="adm-date">{formatDateTime(row.inserted_at)}</td>
            <td class="adm-actions-col">
              {#if confirmId === row.id}
                <span class="adm-confirm">
                  <span>{t('admin.allowlist.confirmRemove')}</span>
                  <button type="button" class="adm-btn" onclick={() => (confirmId = null)} disabled={adminAllowlist.busyId === row.id}>
                    {t('admin.confirm.cancel')}
                  </button>
                  <button
                    type="button" class="adm-btn danger" onclick={() => confirmRemove(row.id)}
                    disabled={adminAllowlist.busyId === row.id} data-testid="admin-allowlist-confirm-remove"
                  >{adminAllowlist.busyId === row.id ? t('admin.working') : t('admin.allowlist.remove')}</button>
                </span>
              {:else if row.is_active}
                <button type="button" class="adm-btn danger" onclick={() => { confirmId = row.id; notice = null; }} data-testid="admin-allowlist-remove">
                  {t('admin.allowlist.remove')}
                </button>
              {:else}
                <button
                  type="button" class="adm-btn" onclick={() => readd(row.id)}
                  disabled={adminAllowlist.busyId === row.id} data-testid="admin-allowlist-readd"
                >{adminAllowlist.busyId === row.id ? t('admin.working') : t('admin.allowlist.readd')}</button>
              {/if}
              {#if adminAllowlist.rowError?.id === row.id}
                <p class="adm-error" role="alert" data-testid="admin-allowlist-row-error">{adminErrorText(adminAllowlist.rowError.error)}</p>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td class="adm-empty" colspan="5">
              {adminAllowlist.loading ? t('admin.loading') : t('admin.allowlist.empty')}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <nav class="adm-pager" aria-label={t('admin.users.pagination')}>
    <span class="adm-page">{tp('admin.users.page', { page: query.page, pages })}</span>
    <div class="adm-pager-btns">
      <button type="button" class="adm-btn" disabled={query.page <= 1} onclick={() => goTo(query.page - 1)}>{t('admin.users.prev')}</button>
      <button type="button" class="adm-btn" disabled={query.page >= pages} onclick={() => goTo(query.page + 1)}>{t('admin.users.next')}</button>
    </div>
  </nav>
</section>

<style>
  .adm-allow { display: flex; flex-direction: column; gap: 12px; }
  .adm-head { display: flex; align-items: baseline; gap: 10px; }
  .adm-h1 { margin: 0; font-family: var(--st-display); font-size: 1.25rem; font-weight: 600; color: var(--st-text); }
  .adm-count { font-size: 0.78rem; color: var(--st-text-2); }
  .adm-help { margin: 0; font-size: 0.78rem; line-height: 1.5; color: var(--st-text-2); }

  .adm-add { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
  .adm-add-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 260px; min-width: 0; }

  .adm-label {
    font-size: 0.66rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-2);
  }

  .adm-add-field input, .adm-search {
    padding: 7px 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-size: 0.82rem;
  }

  .adm-add-field input:focus, .adm-search:focus { outline: none; border-color: var(--st-accent); }
  .adm-add-field input[aria-invalid='true'] { border-color: var(--st-danger); }
  .adm-field-err { font-size: 0.74rem; color: var(--st-danger); }

  .adm-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .adm-search { flex: 1 1 260px; min-width: 0; }
  .adm-check { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--st-text-2); cursor: pointer; }
  .adm-check input { accent-color: var(--st-accent); }

  .adm-error { margin: 0; font-size: 0.76rem; color: var(--st-danger); }

  .adm-done {
    margin: 0;
    padding: 6px 9px;
    border-left: 2px solid var(--st-ok);
    background: var(--st-surface-2);
    font-size: 0.78rem;
    color: var(--st-text);
  }

  .adm-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    background: var(--st-danger-bg);
    border-left: 2px solid var(--st-danger);
    font-size: 0.8rem;
    color: var(--st-text);
  }

  .adm-table-wrap {
    overflow-x: auto;
    background: var(--st-surface);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
    transition: opacity 0.12s;
  }

  .adm-table-wrap.busy { opacity: 0.6; }
  .adm-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }

  .adm-table th {
    padding: 8px 10px;
    background: var(--st-surface-2);
    border-bottom: 1px solid var(--st-hair-strong);
    color: var(--st-text-2);
    font-size: 0.66rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-align: left;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .adm-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-hair);
    color: var(--st-text);
    vertical-align: middle;
  }

  .adm-table tbody tr:last-child td { border-bottom: none; }
  .adm-email { word-break: break-all; }
  .adm-muted-cell { color: var(--st-text-2); word-break: break-all; }
  .adm-date { white-space: nowrap; color: var(--st-text-2); font-variant-numeric: tabular-nums; }
  .adm-actions-col { text-align: right; }
  .adm-empty { padding: 28px 10px; text-align: center; color: var(--st-text-2); }

  .adm-confirm { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; }

  .adm-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .adm-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--st-ok) 55%, transparent);
    background: color-mix(in srgb, var(--st-ok) 14%, transparent);
    color: var(--st-ok);
    font-size: 0.68rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .adm-badge.off {
    border-color: var(--st-hair-strong);
    background: var(--st-surface-2);
    color: var(--st-text-2);
  }

  .adm-pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.78rem;
    color: var(--st-text-2);
  }

  .adm-pager-btns { display: flex; gap: 8px; }

  .adm-btn {
    padding: 5px 11px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.76rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .adm-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .adm-btn:disabled { opacity: 0.45; cursor: default; }

  .adm-btn.danger { border-color: color-mix(in srgb, var(--st-danger) 55%, transparent); color: var(--st-danger); }
  .adm-btn.danger:hover:not(:disabled) { background: var(--st-danger-bg); }

  .adm-btn.primary {
    padding: 7px 12px;
    background: color-mix(in srgb, var(--st-accent) 18%, var(--st-surface-2));
    border-color: color-mix(in srgb, var(--st-accent) 55%, transparent);
    color: var(--st-text);
    font-weight: 600;
  }
</style>
