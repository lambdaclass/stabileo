<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { REPO_URL, DOCS_HUB_URL, SOCIAL_LINKS } from './landing-utils';
  import { SOCIAL_ICONS as ICONS } from '../../lib/contact/channels';
  import PublicLink from './PublicLink.svelte';
  import OpenEditorButton from './OpenEditorButton.svelte';
  import BrandMark from './BrandMark.svelte';
  import { accounts, publicFeatureEnabled, PUBLIC_POLICY_AVAILABLE, tools } from '../../lib/features';
  import { onMount } from 'svelte';

  let adConsent = $state<typeof import('../../lib/tracking/ad-consent.svelte').adConsent | null>(null);

  if (__PUBLIC_FEATURES__.accounts) onMount(() => {
    if (accounts()) {
      void import('../../lib/tracking/ad-consent.svelte').then(
        module => { adConsent = module.adConsent; },
        error => console.warn('landing: advertising preferences did not load', error),
      );
    }
  });

  const year = new Date().getFullYear();
  const GROUPS: [string, string, [string, string][]][] = [
    ['product', 'landing.navProduct', [...(tools() ? [] : [['/examples', 'landing.navExamples'] as [string, string]]), ['/tools', 'landing.navTools'], ['/#pricing', 'landing.navPricing']]],
    ['verification', 'landing.footVerification', [['/reliability', 'landing.footReliability'], ['/research', 'landing.navResearch'], ['/paper', 'landing.navPaper'], ['/cirsoc', ''], ['/sap2000-alternative', 'landing.footSap2000'], ['/etabs-alternative', 'landing.footEtabs']]],
    ['project', 'landing.footProject', [['/blog', 'landing.footBlog'], ['/changelog', 'landing.footChangelog'], ...(__PUBLIC_FEATURES__.accounts && accounts() ? [['/terms', 'landing.footTerms'], ['/privacy', 'landing.footPrivacy']] as [string, string][] : [])]],
  ];
</script>

<footer class="sec sec--ink lp-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <span class="nav-logo"><BrandMark /></span>
      <div>
        <p class="footer-name">Stabileo</p>
        <p class="footer-tagline">{t('landing.footTagline')}</p>
      </div>
    </div>

    <div class="footer-right">
      <nav class="footer-links" aria-label={t('landing.footNav')}>
        {#each GROUPS as [id, head, links]}
          <div class="footer-group">
            <p class="footer-head" id="foot-{id}">{t(head)}</p>
            <ul aria-labelledby="foot-{id}">
              {#if id === 'product'}<li><OpenEditorButton label="landing.footLaunch" /></li>{/if}
              {#each (PUBLIC_POLICY_AVAILABLE ? links.filter(([to]) => publicFeatureEnabled(to)) : links) as [to, key]}<li><PublicLink {to}>{key ? t(key) : 'CIRSOC'}</PublicLink></li>{/each}
              {#if id === 'project'}
                <li><a href={DOCS_HUB_URL} target="_blank" rel="noreferrer">{t('landing.footDocs')}</a></li>
                <li><a href={REPO_URL} target="_blank" rel="noreferrer">{t('landing.footRepo')}</a></li>
                {#if __PUBLIC_FEATURES__.accounts && adConsent?.available}<li><button onclick={() => adConsent?.reopen()} data-testid="footer-ad-cookies">{t('landing.footAdCookies')}</button></li>{/if}
              {/if}
            </ul>
          </div>
        {/each}
      </nav>

      <ul class="footer-social" aria-label={t('landing.footSocial')}>
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
  </div>

  <div class="wrap footer-legal">
    <p>&copy; {year} Stabileo. {t('landing.footRights')}</p>
  </div>
</footer>

<div class="mobile-sticky">
  <OpenEditorButton class="btn btn-primary" label="landing.navOpenEditor" />
</div>
