<script lang="ts">
  import { t } from '../../lib/i18n';
  import AuthDialog from './AuthDialog.svelte';
  import GoogleMark from '../register/GoogleMark.svelte';

  let { text, action = false, placement }: { text: string; action?: boolean; placement: string } = $props();
  let open = $state(false);
</script>

<div class="signin-notice" data-testid="signin-notice-{placement}">
  <p>{text}</p>
  {#if action}
    <button type="button" class="signin-google" onclick={() => (open = true)} data-testid="signin-notice-button-{placement}">
      <span class="signin-mark"><GoogleMark /></span>
      <span>{t('account.google.continue')}</span>
    </button>
  {/if}
</div>
{#if action}<AuthDialog bind:open {placement} />{/if}

<style>
  .signin-notice {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid color-mix(in srgb, var(--st-accent) 45%, var(--st-hair));
    border-radius: 6px;
    background: color-mix(in srgb, var(--st-accent) 8%, var(--st-surface-2));
  }
  p {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.35;
    color: var(--st-text);
  }
  .signin-google {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    align-self: flex-start;
    padding: 0.25rem 0.75rem 0.25rem 0.25rem;
    border: 0;
    border-radius: 4px;
    background: var(--st-accent);
    color: #fff;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }
  .signin-google:hover { filter: brightness(1.08); }
  .signin-google:focus-visible { outline: 2px solid var(--st-text); outline-offset: 2px; }
  .signin-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 2px;
    background: #fff;
  }
</style>
