<script lang="ts">
  /**
   * A way to reach a person, from the corner of the page.
   *
   * This was a WhatsApp button wired straight to a number, so the page had
   * already chosen for the reader which of five channels they wanted. It
   * opens a small panel instead — WhatsApp beside Instagram, X, Discord and
   * LinkedIn — and it opens it HERE rather than sending anyone to a link hub
   * on someone else's domain. A visitor who taps a contact button has not
   * asked to leave the site.
   *
   * The glyph is a speech bubble, not any one platform's mark: naming one of
   * the five on the button would rank it above the rest before the reader has
   * seen the list.
   */
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { contactChannels } from '../../lib/contact/channels';

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();

  /*
   * The list, the marks and the language codes are all one description, in
   * `lib/contact/channels` — the editor's header offers the same five.
   * The greeting is the caller's because it is the only translated part.
   */
  const CHANNELS = $derived(contactChannels(t('contact.waGreeting')));

  /* Escape closes it, and a click anywhere else does too. A popover that can
     only be dismissed by the button that opened it traps a reader who opened
     it by accident.

     Escape also hands focus back to the button, as the editor's header menu
     does: a keyboard reader inside the list would otherwise be left on a link
     that has just stopped existing, and land at the top of the page. */
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      open = false;
      trigger?.focus();
    }
  }
  function onPointerDown(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onPointerDown} />

<div class="links-fab-root" bind:this={root}>
  {#if open}
    <div class="links-panel" role="group" aria-label={t('contact.linksLabel')}>
      <p class="links-panel-title">{t('contact.linksTitle')}</p>
      <ul>
        {#each CHANNELS as c}
          <li>
            <a href={c.href} target="_blank" rel="noreferrer" data-social={c.id}>
              <span class="social-mark" aria-hidden="true">{@html c.icon}</span>
              <span class="links-name">{c.label}</span>
              {#if c.langs}<span class="links-langs">{c.langs}</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <button
    bind:this={trigger}
    class="links-fab"
    class:open
    onclick={() => (open = !open)}
    aria-expanded={open}
    aria-label={t('contact.linksLabel')}
    title={t('contact.linksLabel')}
  >
    <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor"
         stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true" focusable="false">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.4-.7L3 21l1.9-5.1A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/>
      <circle cx="8.6" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="12.5" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="16.4" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
    </svg>
  </button>
</div>
