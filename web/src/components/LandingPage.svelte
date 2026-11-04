<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t, publicI18n } from '../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta, stabileoSoftware } from '../lib/page-meta';
  import SiteHeader from './site/SiteHeader.svelte';
  import LandingHero from './landing/LandingHero.svelte';
  import LandingPricing from './landing/LandingPricing.svelte';
  import LandingBasic from './landing/LandingBasic.svelte';
  import LandingProCalc from './landing/LandingProCalc.svelte';
  import LandingProDesign from './landing/LandingProDesign.svelte';
  import LandingAi from './landing/LandingAi.svelte';
  import LandingVerification from './landing/LandingVerification.svelte';
  import LandingEducation from './landing/LandingEducation.svelte';
  import LandingBlog from './landing/LandingBlog.svelte';
  import LandingFooter from './landing/LandingFooter.svelte';
  import LinksButton from './landing/LinksButton.svelte';
  import { enterApp } from './landing/landing-utils';
  import './landing/landing.css';

  let landingEl: HTMLDivElement;
  let scrollPct = $state(0);
  let prefersReducedMotion = $state(false);

  /**
   * Reactive metadata. The landing is client-rendered, so index.html holds the
   * English set a non-JS crawler sees and this only refines it for a real
   * browser: the Spanish and Portuguese landings get their own title,
   * description and og:locale. See src/lib/page-meta.ts — the blog uses it too.
   */
  function syncMetadata() {
    applyPageMeta({
      title: t('landing.metaTitle'),
      description: t('landing.metaDescription'),
      locale: publicI18n.locale,
      path: '/',
      graph: [stabileoSoftware(publicI18n.locale, { description: t('landing.metaDescription') })],
    });
  }

  $effect(() => {
    syncMetadata();
    return restorePageMeta;
  });

  onMount(() => {
    const onScroll = () => {
      const el = landingEl;
      if (!el) return;
      const denom = Math.max(1, el.scrollHeight - el.clientHeight);
      scrollPct = (el.scrollTop / denom) * 100;
    };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };

    prefersReducedMotion = motionQuery.matches;
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
    else motionQuery.addListener(onMotionChange);

    landingEl?.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const onMessage = (e: MessageEvent) => {
      // Same origin only: any page that frames or opened this one can post to it.
      if (e.origin !== window.location.origin) return;
      if (e.data === 'stabileo-enter-app') enterApp();
    };
    window.addEventListener('message', onMessage);

    return () => {
      landingEl?.removeEventListener('scroll', onScroll);
      window.removeEventListener('message', onMessage);
      if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', onMotionChange);
      else motionQuery.removeListener(onMotionChange);
    };
  });
</script>

<svelte:head>
  <!--
    No title/description/OG/Twitter tags here on purpose. `svelte:head` APPENDS
    to the document, and index.html already carries a full static set for
    crawlers that never run this code — emitting them again produced five
    <title> elements and eight duplicated metas whose English values
    contradicted each other. The reactive metadata is applied by rewriting the
    static tags in place (see `syncMetadata` in the script above), which keeps
    exactly one of each and lets the Spanish landing correct them.
  -->
  <!--
    Fonts are self-hosted from /fonts (see landing.css). The landing no longer
    contacts fonts.googleapis.com or fonts.gstatic.com. Only the four faces the
    first screen needs are preloaded; the rest arrive with the stylesheet.
  -->
  <link rel="preload" as="font" type="font/woff2" href="/fonts/space-grotesk.woff2" crossorigin="anonymous" />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/ibm-plex-sans.woff2" crossorigin="anonymous" />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/ibm-plex-mono-500.woff2" crossorigin="anonymous" />
</svelte:head>

<!--
  `.landing` is the scroll container (position: fixed; overflow-y: auto), not the
  document, so without a tabindex a keyboard-only user cannot scroll the page
  until they Tab onto something inside it. WCAG 2.1.1 / axe
  `scrollable-region-focusable`.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="landing" bind:this={landingEl} tabindex="0">
  <div class="scroll-progress" style="width:{scrollPct}%" aria-hidden="true"></div>

  <!--
    Narrative order: what it is, why it matters, what works today, proof, then
    the developing layers, then the vision, then the honest status table.

    The visitor meets Basic (04) before Education (08), PRO (09) or Stabileo
    AI (10), so the present state of the product is established before any
    future capability is described.

    Two sections have been removed rather than reordered, and for the same
    reason both times: a whole chapter overstated what it held. Real-time
    solving now sits in the Basic feature list, alongside the other things
    Basic does. The live demo — an embedded instance of the editor, running
    between Basic and the capabilities matrix — was the second, and the deck
    is renumbered so the sequence has no gap where it was.
  -->
  <SiteHeader page="landing" />
  <LandingHero {prefersReducedMotion} />
  <LandingBasic />
  <LandingProCalc />
  <LandingProDesign />
  <LandingAi />
  <LandingVerification />
  <LandingEducation />
  <LandingPricing />
  <LandingBlog />
  <LandingFooter />
  <LinksButton />
</div>
