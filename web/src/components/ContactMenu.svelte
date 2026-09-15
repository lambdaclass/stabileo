<script lang="ts">
  /**
   * The five ways to reach us, from the editor's header.
   *
   * The landing has had this in its corner; the editor had nothing at all —
   * so the moment someone stopped reading and started modelling, the way to
   * ask a question disappeared. That is backwards: the questions come from
   * the people who are using it.
   *
   * Same channels, same marks, same language codes, from
   * `lib/contact/channels`. What is not shared is the shape: the landing's
   * is a floating panel over a marketing page, this one is a menu under a
   * header button, beside Stabileo AI and Settings — the corner where the
   * controls that act on the APPLICATION rather than on the model live, which
   * is exactly what a contact menu is.
   *
   * The glyph is a speech bubble rather than any one platform's mark: naming
   * one of the five on the button would rank it above the rest before the
   * reader has seen the list.
   */
  import { t } from '../lib/i18n';
  import { contactChannels } from '../lib/contact/channels';

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();

  const CHANNELS = $derived(contactChannels(t('contact.waGreeting')));

  /* Escape closes it, and a click anywhere else does too. A menu that only
     the button that opened it can dismiss traps whoever opened it by
     accident — and in the editor that button is one pixel away from work.

     Escape also hands focus back to the button. Closing a list a keyboard
     user is inside of, while focus sits on a link that no longer exists,
     drops them at the top of the document. A pointer that clicked elsewhere
     has already put focus where it meant to, so that path leaves it alone. */
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      open = false;
      trigger?.focus();
    }
  }
  function onPointerDown(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onPointerDown} />

<div class="contact-anchor" bind:this={root}>
  <!--
    A disclosure, not an ARIA menu.
    ───────────────────────────────
    This was `aria-haspopup="menu"` over `role="menu"` and `role="menuitem"`.
    Those roles are a promise: a screen reader announces a menu, and its user
    reaches for the arrow keys, Home, End and typeahead — none of which this
    implements. What it is, is a button that shows a short list of ordinary
    links, which Tab already walks. So it says that: the button reports
    whether the list is expanded and which element it controls, and the list
    is a labelled group — the shape the landing's corner panel already uses
    for the same five links.
  -->
  <button
    bind:this={trigger}
    class="btn-contact"
    class:on={open}
    onclick={() => (open = !open)}
    title={t('contact.linksLabel')}
    aria-label={t('contact.linksLabel')}
    aria-expanded={open}
    aria-controls={open ? 'contact-menu' : undefined}
    data-testid="contact-open"
  >
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
         stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true" focusable="false">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.4-.7L3 21l1.9-5.1A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/>
      <circle cx="8.6" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="12.5" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="16.4" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
    </svg>
  </button>

  {#if open}
    <div class="contact-menu" id="contact-menu" role="group" aria-label={t('contact.linksLabel')} data-testid="contact-menu">
      <p class="contact-title">{t('contact.linksTitle')}</p>
      <ul>
        {#each CHANNELS as c (c.id)}
          <li>
            <a href={c.href} target="_blank" rel="noreferrer" data-social={c.id}>
              <span class="contact-mark" aria-hidden="true">{@html c.icon}</span>
              <span class="contact-name">{c.label}</span>
              {#if c.langs}<span class="contact-langs">{c.langs}</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .contact-anchor { position: relative; display: inline-flex; }

  /* Sized and bordered like `.btn-help` beside it: the header's controls are
     one row of 32 px shapes, and a button that is nearly that reads as a
     misalignment rather than as a different kind of control. */
  .btn-contact {
    width: 32px;
    height: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--st-hair-strong);
    border-radius: 50%;
    color: var(--st-text-3);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }

  .btn-contact:hover { background: var(--st-surface-3); color: var(--st-text); }
  .btn-contact.on { border-color: var(--st-accent); color: var(--st-text); }

  .contact-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 200;
    min-width: 14rem;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius-lg);
    padding: 0.6rem;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  }

  .contact-title {
    margin: 0.1rem 0 0.5rem;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .contact-menu ul { list-style: none; margin: 0; padding: 0; }

  .contact-menu a {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.4rem 0.45rem;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    text-decoration: none;
    font-size: 0.82rem;
  }

  .contact-menu a:hover { background: var(--st-surface-3); color: var(--st-text); }

  .contact-mark { display: flex; color: var(--st-text-3); }
  .contact-menu a:hover .contact-mark { color: var(--st-accent); }

  .contact-name { flex: 1 1 auto; }

  /* The account's own language, not the reader's — so it stays in the Latin
     alphabet, small, and to the side. It is a caveat, not a label. */
  .contact-langs {
    flex: none;
    font-family: var(--st-mono);
    font-size: 0.66rem;
    color: var(--st-text-3);
    letter-spacing: 0.03em;
  }
</style>
