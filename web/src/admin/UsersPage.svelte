<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { adminUsers } from './admin-users.svelte';
  import { adminErrorText } from './error-text';
  import { formatDateTime } from './format';
  import { PAGE_SIZE, pageCount, parseQuery, toSearch, toggleSort, type ListQuery } from './list-query';
  import type { SortBy, StatusFilter } from '../lib/api/admin';
  import { t, tp } from '../lib/i18n';
  import UserDrawer from './UserDrawer.svelte';

  const SEARCH_DEBOUNCE_MS = 300;

  const initial = parseQuery(location.search);
  let query = $state<ListQuery>(initial);
  let searchInput = $state(initial.search);
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const listKey = $derived(JSON.stringify([query.search, query.status, query.sortBy, query.sortDir, query.page]));
  const userId = $derived(query.user);
  const pages = $derived(pageCount(adminUsers.total));
  const from = $derived(adminUsers.total === 0 ? 0 : (query.page - 1) * PAGE_SIZE + 1);
  const to = $derived(Math.min(query.page * PAGE_SIZE, adminUsers.total));

  const columns: { key: SortBy | null; label: string; numeric?: boolean }[] = [
    { key: 'name', label: 'admin.col.name' },
    { key: 'email', label: 'admin.col.email' },
    { key: null, label: 'admin.col.status' },
    { key: 'inserted_at', label: 'admin.col.created' },
    { key: 'last_sign_in_at', label: 'admin.col.lastSignIn' },
    { key: null, label: 'admin.col.sessions', numeric: true },
  ];

  function setQuery(next: ListQuery, replace = false) {
    query = next;
    const url = `${location.pathname}${toSearch(next)}${location.hash}`;
    if (replace) history.replaceState(history.state, '', url);
    else history.pushState(history.state, '', url);
  }

  function onSearchInput() {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (searchInput.trim() !== query.search.trim()) setQuery({ ...query, search: searchInput, page: 1 }, true);
    }, SEARCH_DEBOUNCE_MS);
  }

  function setStatus(status: StatusFilter) {
    setQuery({ ...query, status, page: 1 });
  }

  function sortBy(column: SortBy) {
    setQuery(toggleSort(query, column));
  }

  function goTo(page: number) {
    setQuery({ ...query, page: Math.min(Math.max(1, page), pages) });
  }

  function openUser(id: string) {
    setQuery({ ...query, user: id });
  }

  function closeUser() {
    setQuery({ ...query, user: null });
  }

  function reload() {
    void adminUsers.load(query);
  }

  function ariaSort(key: SortBy | null): 'ascending' | 'descending' | undefined {
    if (!key || query.sortBy !== key) return undefined;
    return query.sortDir === 'asc' ? 'ascending' : 'descending';
  }

  $effect(() => {
    void listKey;
    untrack(() => adminUsers.load(query));
  });

  $effect(() => {
    const id = userId;
    untrack(() => (id ? adminUsers.open(id) : adminUsers.close()));
  });

  $effect(() => {
    if (!adminUsers.loading && !adminUsers.listError && adminUsers.total > 0 && query.page > pages) {
      untrack(() => setQuery({ ...query, page: pages }, true));
    }
  });

  onMount(() => {
    const onPop = () => {
      query = parseQuery(location.search);
      searchInput = query.search;
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      clearTimeout(debounce);
    };
  });
</script>

<section class="adm-users" aria-labelledby="adm-users-title">
  <div class="adm-users-head">
    <h1 id="adm-users-title" class="adm-h1">{t('admin.users.title')}</h1>
    <span class="adm-count" data-testid="admin-users-total">{tp('admin.users.total', { count: adminUsers.total })}</span>
  </div>

  <div class="adm-toolbar">
    <input
      type="search"
      class="adm-search"
      placeholder={t('admin.users.search')}
      aria-label={t('admin.users.search')}
      bind:value={searchInput}
      oninput={onSearchInput}
      data-testid="admin-users-search"
    />
    <div class="adm-seg" role="radiogroup" aria-label={t('admin.users.status')}>
      {#each ['all', 'active', 'disabled'] as const as status (status)}
        <button
          type="button"
          role="radio"
          class="adm-seg-btn"
          class:on={query.status === status}
          aria-checked={query.status === status}
          onclick={() => setStatus(status)}
          data-testid={`admin-users-status-${status}`}
        >{t(`admin.status.${status}`)}</button>
      {/each}
    </div>
  </div>

  {#if adminUsers.listError}
    <div class="adm-banner" role="alert" data-testid="admin-users-error">
      <span>{adminErrorText(adminUsers.listError)}</span>
      <button type="button" class="adm-btn" onclick={reload}>{t('admin.users.retry')}</button>
    </div>
  {/if}

  <div class="adm-table-wrap" class:busy={adminUsers.loading}>
    <table class="adm-table" data-testid="admin-users-table">
      <thead>
        <tr>
          {#each columns as col (col.label)}
            <th scope="col" class:num={col.numeric} aria-sort={ariaSort(col.key)}>
              {#if col.key}
                {@const key = col.key}
                <button
                  type="button"
                  class="adm-sort"
                  class:on={query.sortBy === key}
                  onclick={() => sortBy(key)}
                  data-testid={`admin-sort-${key}`}
                >
                  {t(col.label)}
                  <span class="adm-sort-arrow" aria-hidden="true">
                    {query.sortBy === key ? (query.sortDir === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </button>
              {:else}
                {t(col.label)}
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each adminUsers.rows as user (user.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <tr class:sel={user.id === query.user} onclick={() => openUser(user.id)} data-testid="admin-user-row">
            <td>
              <button
                type="button"
                class="adm-name"
                onclick={(e) => { e.stopPropagation(); openUser(user.id); }}
              >{user.name}</button>
              {#if user.is_admin}<span class="adm-admin-tag">{t('admin.isAdmin')}</span>{/if}
            </td>
            <td class="adm-email">{user.email}</td>
            <td>
              <span class="adm-badge" class:off={!user.is_active} data-testid="admin-user-status">
                {user.is_active ? t('admin.status.active') : t('admin.status.disabled')}
              </span>
            </td>
            <td class="adm-date">{formatDateTime(user.inserted_at)}</td>
            <td class="adm-date">{formatDateTime(user.last_sign_in_at)}</td>
            <td class="num">{user.active_sessions}</td>
          </tr>
        {:else}
          <tr>
            <td class="adm-empty" colspan={columns.length}>
              {adminUsers.loading ? t('admin.users.loading') : t('admin.users.empty')}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <nav class="adm-pager" aria-label={t('admin.users.pagination')}>
    <span class="adm-range" data-testid="admin-users-range">
      {tp('admin.users.range', { from, to, total: adminUsers.total })}
    </span>
    <div class="adm-pager-btns">
      <button type="button" class="adm-btn" disabled={query.page <= 1} onclick={() => goTo(query.page - 1)} data-testid="admin-page-prev">
        {t('admin.users.prev')}
      </button>
      <span class="adm-page">{tp('admin.users.page', { page: query.page, pages })}</span>
      <button type="button" class="adm-btn" disabled={query.page >= pages} onclick={() => goTo(query.page + 1)} data-testid="admin-page-next">
        {t('admin.users.next')}
      </button>
    </div>
  </nav>
</section>

{#if query.user}
  <UserDrawer onclose={closeUser} />
{/if}

<style>
  .adm-users { display: flex; flex-direction: column; gap: 12px; }

  .adm-users-head { display: flex; align-items: baseline; gap: 10px; }
  .adm-h1 { margin: 0; font-family: var(--st-display); font-size: 1.25rem; font-weight: 600; color: var(--st-text); }
  .adm-count { font-size: 0.78rem; color: var(--st-text-2); }

  .adm-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

  .adm-search {
    flex: 1 1 260px;
    min-width: 0;
    padding: 7px 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-size: 0.82rem;
  }

  .adm-search:focus { outline: none; border-color: var(--st-accent); }

  .adm-seg {
    display: inline-flex;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    overflow: hidden;
  }

  .adm-seg-btn {
    padding: 6px 12px;
    background: var(--st-surface-2);
    border: none;
    border-right: 1px solid var(--st-hair);
    color: var(--st-text-2);
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
  }

  .adm-seg-btn:last-child { border-right: none; }
  .adm-seg-btn:hover { background: var(--st-surface-3); color: var(--st-text); }
  .adm-seg-btn.on { background: var(--st-selected-bg); color: var(--st-text); box-shadow: inset 0 -2px 0 var(--st-accent); }

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
    position: sticky;
    top: 0;
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
  .adm-table tbody tr[data-testid] { cursor: pointer; }
  .adm-table tbody tr[data-testid]:hover td { background: var(--st-surface-2); }
  .adm-table tbody tr.sel td { background: var(--st-selected-bg); }

  .num { text-align: right; font-family: var(--st-mono); }
  .adm-table th.num { text-align: right; }

  .adm-sort {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
  }

  .adm-sort:hover, .adm-sort.on { color: var(--st-text); }
  .adm-sort-arrow { font-size: 0.6rem; opacity: 0.7; }

  .adm-name {
    padding: 0;
    background: none;
    border: none;
    color: var(--st-text);
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .adm-name:hover { color: var(--st-accent); }

  .adm-admin-tag {
    margin-left: 6px;
    padding: 0 5px;
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  .adm-email { color: var(--st-text-2); word-break: break-all; }
  .adm-date { white-space: nowrap; color: var(--st-text-2); font-variant-numeric: tabular-nums; }

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
    border-color: color-mix(in srgb, var(--st-danger) 55%, transparent);
    background: var(--st-danger-bg);
    color: var(--st-danger);
  }

  .adm-empty { padding: 28px 10px; text-align: center; color: var(--st-text-2); }

  .adm-pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.78rem;
    color: var(--st-text-2);
  }

  .adm-pager-btns { display: flex; align-items: center; gap: 8px; }
  .adm-range, .adm-page { font-variant-numeric: tabular-nums; }

  .adm-btn {
    padding: 5px 11px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.76rem;
    cursor: pointer;
  }

  .adm-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .adm-btn:disabled { opacity: 0.45; cursor: default; }
</style>
