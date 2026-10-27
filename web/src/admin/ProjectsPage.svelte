<script lang="ts">
  import { onMount } from 'svelte';
  import { adminProjects } from './admin-insights.svelte';
  import { PAGE_SIZE } from './list-store.svelte';
  import { adminErrorText } from './error-text';
  import { formatDateTime } from './format';
  import { t, tp } from '../lib/i18n';

  let search = $state('');
  let mode = $state('');
  let timer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    void adminProjects.load({ offset: 0 });
  });

  function onSearch() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void adminProjects.load({ search, offset: 0 }), 250);
  }

  const offset = $derived(Number(adminProjects.params.offset ?? 0));
  const size = (b: number) => (b >= 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} kB`);
</script>

<section class="ins" aria-labelledby="ins-projects-title" data-testid="admin-projects">
  <div class="ins-head">
    <h1 id="ins-projects-title" class="ins-h1">{t('admin.projects.title')}</h1>
    <span class="ins-sub">{tp('admin.users.total', { count: adminProjects.total })}</span>
  </div>
  <p class="ins-muted">{t('admin.projects.lede')}</p>

  <div class="ins-toolbar">
    <input class="ins-input" type="search" bind:value={search} oninput={onSearch} placeholder={t('admin.projects.search')} data-testid="admin-projects-search" />
    <select class="ins-select" bind:value={mode} onchange={() => adminProjects.load({ app_mode: mode, offset: 0 })} aria-label={t('admin.projects.mode')}>
      <option value="">{t('admin.status.all')}</option>
      <option value="basic">{t('cloud.modeBasic')}</option>
      <option value="pro">{t('cloud.modePro')}</option>
    </select>
  </div>

  {#if adminProjects.error}<div class="ins-banner" role="alert">{adminErrorText(adminProjects.error)}</div>{/if}

  <div class="ins-table-wrap">
    <table class="ins-table">
      <thead>
        <tr>
          <th>{t('admin.projects.name')}</th>
          <th>{t('admin.projects.owner')}</th>
          <th>{t('admin.projects.mode')}</th>
          <th class="num">{t('admin.projects.members')}</th>
          <th class="num">{t('admin.projects.size')}</th>
          <th>{t('admin.projects.version')}</th>
          <th>{t('admin.projects.updated')}</th>
          <th>{t('admin.projects.research')}</th>
        </tr>
      </thead>
      <tbody>
        {#each adminProjects.rows as p (p.id)}
          <tr data-testid="admin-project-row">
            <td>{p.name}</td>
            <td><span title={p.owner.name}>{p.owner.email}</span></td>
            <td><span class="ins-tag">{p.app_mode === 'pro' ? t('cloud.modePro') : t('cloud.modeBasic')}</span></td>
            <td class="num">{p.element_count ?? '—'}</td>
            <td class="num">{size(p.content_bytes)}</td>
            <td class="ins-mono">{p.app_version ?? '—'}</td>
            <td>{formatDateTime(p.updated_at)}</td>
            <td><span class="ins-tag" class:ok={p.research_consent}>{p.research_consent ? t('admin.yes') : t('admin.no')}</span></td>
          </tr>
        {:else}
          <tr><td colspan="8" class="ins-muted">{adminProjects.loading ? t('admin.loading') : t('admin.projects.empty')}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  {@render pager()}
</section>

{#snippet pager()}
  <nav class="ins-pager" aria-label={t('admin.users.pagination')}>
    <span>{tp('admin.users.range', { from: adminProjects.total ? offset + 1 : 0, to: Math.min(offset + PAGE_SIZE, adminProjects.total), total: adminProjects.total })}</span>
    <span>
      <button class="ins-btn" disabled={offset === 0} onclick={() => adminProjects.load({ offset: Math.max(0, offset - PAGE_SIZE) })}>{t('admin.users.prev')}</button>
      <button class="ins-btn" disabled={offset + PAGE_SIZE >= adminProjects.total} onclick={() => adminProjects.load({ offset: offset + PAGE_SIZE })}>{t('admin.users.next')}</button>
    </span>
  </nav>
{/snippet}
