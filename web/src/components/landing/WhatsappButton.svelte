<script lang="ts">
  /**
   * A way to reach a person, from the corner of the page.
   *
   * Not a WhatsApp-green circle. The brand colour would be the only saturated
   * green on a page whose palette is ink, paper and one accent, and it would
   * read as an ad rather than as part of the site. The glyph keeps the shape
   * everyone recognises — that is what makes it findable — and sits on the
   * deck's own dark card with its own hairline, the way every other surface
   * here is built. Green only in the mark itself.
   *
   * Renders nothing until a number is configured: see contact.ts.
   */
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { hasWhatsapp, whatsappUrl } from './contact';
</script>

{#if hasWhatsapp()}
  <a
    class="wa-fab"
    href={whatsappUrl(t('landing.waGreeting'))}
    target="_blank"
    rel="noreferrer"
    aria-label={t('landing.waLabel')}
    title={t('landing.waLabel')}
  >
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.84-.85 2.03 0 1.2.87 2.35.99 2.51.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29z"/>
    </svg>
  </a>
{/if}
