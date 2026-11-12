<script lang="ts">
  import PublicLink from '../landing/PublicLink.svelte';
  import { tBatch as t } from './batch-i18n';
  import { tm } from '../mohr/i18n';
  import Mohr2D from '../mohr/Mohr2D.svelte';
  import Mohr3D from '../mohr/Mohr3D.svelte';
  import MohrHelp from '../mohr/MohrHelp.svelte';
  import MohrMenu from '../mohr/MohrMenu.svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { decode2D, decode3D, encodeState, appHref } from '../../lib/mohr/state';

  let { id }: { id: string } = $props();
  const kind = $derived(id === 'mohr-2d' ? 'plane' : 'space');
  const query = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
  const e2e = query.get('e2e') === '1';
  let plane = $state(decode2D(query));
  let space = $state(decode3D(query));
  const roomy = new MediaQuery('(min-width: 60rem) and (min-height: 560px)', false);
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
      setTimeout(() => (status = ''), 3000);
    } catch {
      status = tm('mohr.copyFailed');
    }
  }
</script>

<div class="mohr-page">
  <div class="mohr-tool mh-shell" class:fit={roomy.current}>
    <header class="tool-intro mohr-head">
      <div class="mohr-title">
        <p class="crumb"><PublicLink to="/tools">{t('tools.index')}</PublicLink></p>
        <h1>{t(`tools.${id}`)}</h1>
      </div>
      <div class="mh-toolbar mohr-actions">
        <MohrMenu label={tm('mohr.help')} wide button="mh-btn" testid="mohr-help-toggle">
          {#snippet summary()}{tm('mohr.help')}{/snippet}
          <MohrHelp {kind} id="mohr-help" lead={t(`tools.${id}.subtitle`)} />
        </MohrMenu>
        <button type="button" class="mh-btn" onclick={copyLink} data-testid="mohr-copy-link">{tm('mohr.copyLink')}</button>
        <a class="mh-btn mh-btn-primary" href={appLink} data-testid="mohr-open-app">{tm('mohr.openInApp')} ↗</a>
        <span class="mh-status" class:shown={status} role="status" data-testid="mohr-copy-status">{status}</span>
      </div>
    </header>
    {#if kind === 'plane'}
      <Mohr2D bind:value={plane} fit={roomy.current} />
    {:else}
      <Mohr3D bind:value={space} fit={roomy.current} />
    {/if}
  </div>
  <p class="mohr-other"><PublicLink to={`/tools/${kind === 'plane' ? 'mohr-3d' : 'mohr-2d'}`}>{t(`tools.${kind === 'plane' ? 'mohr-3d' : 'mohr-2d'}`)} →</PublicLink></p>
</div>

<style>
  .mohr-tool { --mh-focus: #ff7a55; display: grid; gap: .875rem; min-width: 0; }
  .mohr-tool.fit { height: calc(100dvh - var(--lp-nav-h, 3.625rem) - clamp(1rem, 2.5vw, 1.75rem) - .75rem); grid-template-rows: auto minmax(0, 1fr); gap: .75rem; }
  .mohr-page { display: grid; gap: 1rem; min-width: 0; }
  .mohr-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: .5rem 1.5rem; min-width: 0; position: relative; }
  .mohr-title { min-width: 0; }
  h1 { font: 600 clamp(1.375rem, 2.2vw, 1.875rem)/1.1 var(--lp-display); letter-spacing: -0.02em; max-width: none; margin: 0; overflow-wrap: anywhere; text-wrap: balance; }
  .crumb { font-size: .8125rem; color: var(--fg-2); margin: 0 0 .15rem; }
  .crumb :global(a) { display: inline-flex; align-items: center; min-height: 28px; }
  .mohr-other :global(a) { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; }
  .mohr-actions { position: relative; }
  .mohr-actions :global(.mh-btn) { min-height: 40px; }
  .mh-status { position: absolute; right: 0; top: calc(100% + .35rem); z-index: 5; padding: .3rem .6rem; border-radius: 3px; background: var(--mh-well); border: 1px solid var(--mh-hair-strong); color: var(--mh-fg); font-size: .8125rem; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .2s; }
  .mh-status.shown { opacity: 1; }
  .mohr-other { margin: 0; font-size: .95rem; }
  @media (any-pointer: coarse) {
    .crumb :global(a), .mohr-actions :global(.mh-btn) { min-height: 44px; }
  }
</style>
