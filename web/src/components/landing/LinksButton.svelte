<script lang="ts">
  /**
   * A way to reach a person, from the corner of the page.
   *
   * This was a WhatsApp button, wired straight to a number. It now opens the
   * Linktree, where WhatsApp sits beside Instagram, X, Discord and LinkedIn —
   * one corner button instead of a choice the page had already made for the
   * reader.
   *
   * ── The glyph ──
   *
   * A speech bubble, not Linktree's mark. What the button offers is "talk to
   * us"; Linktree is where that happens to live, and a logo most readers
   * cannot name is a worse promise than a shape all of them can. It is also
   * not the WhatsApp glyph any more: keeping it would name one of the five
   * channels behind the link and quietly rank it above the rest.
   *
   * Not green either. The page's palette is ink, paper and one accent, and a
   * saturated green would read as an ad rather than as part of the site.
   */
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { LINKTREE_URL } from './landing-utils';
</script>

<a
  class="links-fab"
  href={LINKTREE_URL}
  target="_blank"
  rel="noreferrer"
  aria-label={t('landing.linksLabel')}
  title={t('landing.linksLabel')}
>
  <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor"
       stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
       aria-hidden="true" focusable="false">
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.4-.7L3 21l1.9-5.1A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/>
    <circle cx="8.6" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
    <circle cx="12.5" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
    <circle cx="16.4" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
  </svg>
</a>
