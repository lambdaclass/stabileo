<script lang="ts">
  import PublicLink from '../landing/PublicLink.svelte';
  import { tBatch as t } from './batch-i18n';
  import { tm } from '../mohr/i18n';
  import Mohr2D from '../mohr/Mohr2D.svelte';
  import Mohr3D from '../mohr/Mohr3D.svelte';
  import MohrHelp from '../mohr/MohrHelp.svelte';
  import { decode2D, decode3D, encodeState, appHref } from '../../lib/mohr/state';
  import type { MohrToolId } from './mohr-tools';

  let { id }: { id: MohrToolId } = $props();
  const kind = $derived(id === 'mohr-2d' ? 'plane' : 'space');
  const query = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
  const e2e = query.get('e2e') === '1';
  let plane = $state(decode2D(query));
  let space = $state(decode3D(query));
  let showHelp = $state(false);
  let status = $state('');
  const current = $derived(kind === 'plane' ? plane : space);
  const appLink = $derived(appHref(kind, current, e2e));

  async function copyLink() {
    const params = encodeState(kind, current);
    if (e2e) params.set('e2e', '1');
    const url = `${location.origin}${location.pathname}?${params}`;
    history.replaceState(history.state, '', url);
    try {
      await navigator.clipboard.writeText(url);
      status = tm('mohr.copied');
    } catch {
      status = tm('mohr.copyFailed');
    }
  }
</script>

<div class="mohr-tool">
  <header class="tool-intro">
    <p class="crumb"><PublicLink to="/tools">{t('tools.index')}</PublicLink></p>
    <h1>{t(`tools.${id}`)}</h1>
    <p class="lead">{t(`tools.${id}.subtitle`)}</p>
  </header>
  <div class="mh-shell mh-toolbar mohr-actions">
    <button type="button" class="mh-btn" aria-expanded={showHelp} aria-controls="mohr-help" onclick={() => (showHelp = !showHelp)} data-testid="mohr-help-toggle">? {tm('mohr.help')}</button>
    <button type="button" class="mh-btn" onclick={copyLink} data-testid="mohr-copy-link">{tm('mohr.copyLink')}</button>
    <a class="mh-btn mh-btn-primary" href={appLink} data-testid="mohr-open-app">{tm('mohr.openInApp')} ↗</a>
    <span class="mh-status" role="status" data-testid="mohr-copy-status">{status}</span>
  </div>
  {#if showHelp}<div class="mh-shell"><MohrHelp {kind} id="mohr-help" /></div>{/if}
  {#if kind === 'plane'}
    <Mohr2D bind:value={plane} />
  {:else}
    <Mohr3D bind:value={space} />
  {/if}
  <p class="mh-shell mohr-other"><PublicLink to={`/tools/${kind === 'plane' ? 'mohr-3d' : 'mohr-2d'}`}>{t(`tools.${kind === 'plane' ? 'mohr-3d' : 'mohr-2d'}`)} →</PublicLink></p>
</div>

<style>
  .mohr-tool { display: grid; gap: 1rem; min-width: 0; }
  h1 { font: 600 clamp(2rem, 4.5vw, 3rem)/1.1 var(--lp-display); margin: .75rem 0; overflow-wrap: anywhere; hyphens: auto; }
  .lead { font-size: 1.05rem; color: var(--fg); margin-bottom: 0; max-width: 60rem; }
  .crumb { font-size: .95rem; color: var(--fg-2); margin-bottom: 1rem; }
  .crumb :global(a), .mohr-other :global(a) { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; }
  .mohr-actions :global(.mh-btn) { min-height: 44px; }
  .mohr-other { margin: 0; font-size: .95rem; }
</style>
