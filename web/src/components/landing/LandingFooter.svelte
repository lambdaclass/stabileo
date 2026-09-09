<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { REPO_URL, DOCS_HUB_URL, enterApp, SOCIAL_LINKS } from './landing-utils';
  import PublicLink from './PublicLink.svelte';

  const year = new Date().getFullYear();

  /*
   * Inline marks. A strict rule on this site is that a page fetches nothing
   * from a third party — an icon font or a CDN sprite would hand every visitor
   * to someone else's server just to draw four logos.
   */
  const ICONS: Record<string, string> = {
    instagram: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1 0 18.6 12 6.6 6.6 0 0 0 12 5.4zm0 10.9A4.3 4.3 0 1 1 16.3 12 4.3 4.3 0 0 1 12 16.3zm6.9-11.1a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M18.2 2.3h3.3l-7.2 8.2 8.5 11.2h-6.7l-5.2-6.8-6 6.8H1.6l7.7-8.8L1.2 2.3H8l4.7 6.2zm-1.2 17.7h1.8L7.1 4.2H5.2z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5A2.5 2.5 0 1 1 2.5 6 2.5 2.5 0 0 1 4.98 3.5zM3 8.98h4v12H3zM9.5 8.98h3.8v1.64h.06a4.2 4.2 0 0 1 3.78-2.08c4 0 4.76 2.63 4.76 6.05v6.4h-4v-5.68c0-1.35 0-3.1-1.9-3.1s-2.2 1.48-2.2 3v5.78h-4z"/></svg>',
    discord: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M20.3 4.9A16.5 16.5 0 0 0 16.2 3.6l-.2.4a15.3 15.3 0 0 1 3.6 1.8 14.6 14.6 0 0 0-11.2 0 15.3 15.3 0 0 1 3.6-1.8l-.2-.4A16.5 16.5 0 0 0 3.7 4.9 20.4 20.4 0 0 0 .8 18.6a16.6 16.6 0 0 0 5 2.5l1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 10.1 0l.4.3a10.8 10.8 0 0 1-1.7.8l1 1.7a16.6 16.6 0 0 0 5-2.5 20.4 20.4 0 0 0-2.9-13.7zM8.5 15.4a1.9 1.9 0 0 1 0-3.8 1.9 1.9 0 0 1 0 3.8zm7 0a1.9 1.9 0 0 1 0-3.8 1.9 1.9 0 0 1 0 3.8z"/></svg>',
  };

</script>

<footer class="sec sec--ink lp-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <span class="nav-logo" aria-hidden="true">S</span>
      <div>
        <p class="footer-name">Stabileo</p>
        <p class="footer-tagline">{t('landing.footTagline')}</p>
      </div>
    </div>

    <nav class="footer-links" aria-label={t('landing.footNav')}>
      <a href={DOCS_HUB_URL} target="_blank" rel="noreferrer">{t('landing.footDocs')}</a>
      <a href={REPO_URL} target="_blank" rel="noreferrer">{t('landing.footRepo')}</a>
      <PublicLink to="/blog">{t('landing.footBlog')}</PublicLink>
      <button onclick={() => enterApp()}>{t('landing.footLaunch')}</button>
    </nav>
  </div>

  <div class="wrap footer-social">
    <p class="footer-social-label">{t('landing.footSocial')}</p>
    <ul>
      {#each SOCIAL_LINKS as s}
        <li>
          <a href={s.href} target="_blank" rel="noreferrer" data-social={s.id}>
            {#if ICONS[s.id]}
              <span class="social-mark" aria-hidden="true">{@html ICONS[s.id]}</span>
            {/if}
            <span>{s.label}</span>
          </a>
        </li>
      {/each}
    </ul>
  </div>

  <div class="wrap footer-legal">
    <p>&copy; {year} Stabileo. {t('landing.footRights')}</p>
  </div>
</footer>

<div class="mobile-sticky">
  <button class="btn btn-primary" onclick={() => enterApp()}>{t('landing.navOpenEditor')}</button>
</div>
