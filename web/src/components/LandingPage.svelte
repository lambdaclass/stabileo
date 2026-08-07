<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t, publicI18n } from '../lib/i18n/store.svelte';
  import LandingNav from './landing/LandingNav.svelte';
  import LandingHero from './landing/LandingHero.svelte';
  import LandingProblem from './landing/LandingProblem.svelte';
  import LandingWhat from './landing/LandingWhat.svelte';
  import LandingBasic from './landing/LandingBasic.svelte';
  import LandingDemo from './landing/LandingDemo.svelte';
  import LandingCapabilities from './landing/LandingCapabilities.svelte';
  import LandingValidation from './landing/LandingValidation.svelte';
  import LandingCodes from './landing/LandingCodes.svelte';
  import LandingEducation from './landing/LandingEducation.svelte';
  import LandingPro from './landing/LandingPro.svelte';
  import LandingThesis from './landing/LandingThesis.svelte';
  import LandingStatus from './landing/LandingStatus.svelte';
  import LandingDocs from './landing/LandingDocs.svelte';
  import LandingCTA from './landing/LandingCTA.svelte';
  import LandingFooter from './landing/LandingFooter.svelte';
  import { enterApp, scrollToId } from './landing/landing-utils';
  import './landing/landing.css';

  let landingEl: HTMLDivElement;
  let scrollPct = $state(0);
  let prefersReducedMotion = $state(false);

  /**
   * Reactive metadata, applied by mutating the static tags in index.html
   * rather than appending a second set through `svelte:head`.
   *
   * The landing is client-rendered, so index.html holds the English metadata a
   * non-JS crawler sees and this only refines it for a real browser: the
   * Spanish landing gets Spanish title, description and og:locale. The
   * originals are captured once and restored when the landing unmounts, so
   * entering the application never leaves landing copy behind.
   */
  const META_TAGS = [
    ['meta[name="description"]', 'content'],
    ['meta[property="og:title"]', 'content'],
    ['meta[property="og:description"]', 'content'],
    ['meta[property="og:locale"]', 'content'],
    ['meta[property="og:locale:alternate"]', 'content'],
    ['meta[name="twitter:title"]', 'content'],
    ['meta[name="twitter:description"]', 'content'],
  ] as const;

  let originalMeta: { title: string; lang: string; tags: (string | null)[] } | null = null;

  function captureMetadata() {
    if (originalMeta) return;
    originalMeta = {
      title: document.title,
      lang: document.documentElement.lang,
      tags: META_TAGS.map(([sel, attr]) => document.querySelector(sel)?.getAttribute(attr) ?? null),
    };
  }

  function setMeta(selector: string, value: string) {
    document.querySelector(selector)?.setAttribute('content', value);
  }

  function syncMetadata() {
    const locale = publicI18n.locale;
    const title = `Stabileo — ${t('landing.heroH')}`;
    const description = t('landing.heroP');
    document.title = title;
    document.documentElement.lang = locale;
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:locale"]', locale === 'es' ? 'es_AR' : 'en_US');
    setMeta('meta[property="og:locale:alternate"]', locale === 'es' ? 'en_US' : 'es_AR');
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
  }

  function restoreMetadata() {
    if (!originalMeta) return;
    document.title = originalMeta.title;
    document.documentElement.lang = originalMeta.lang;
    META_TAGS.forEach(([sel, attr], i) => {
      const v = originalMeta!.tags[i];
      if (v !== null) document.querySelector(sel)?.setAttribute(attr, v);
    });
  }

  $effect(() => {
    captureMetadata();
    syncMetadata();
    return restoreMetadata;
  });

  onMount(() => {
    // #realtime was removed when the section folded into Basic. Redirect any
    // incoming link or bookmark to the section that now carries the feature,
    // both on first load and on a later hash change.
    const redirectRealtime = () => {
      if (window.location.hash !== '#realtime') return;
      history.replaceState(null, '', '#basic');
      // Defer to the next frame so the sections are laid out before scrolling.
      requestAnimationFrame(() => {
        scrollToId('basic', landingEl);
      });
    };
    redirectRealtime();
    window.addEventListener('hashchange', redirectRealtime);

    /**
     * Safety net for the reveal animation.
     *
     * `.reveal` starts transparent and is only painted once the observer adds
     * `.visible`, so a single missed callback does not degrade the animation —
     * it hides an entire section permanently, and the page looks like it has a
     * hole in it. That is far too much damage for a decorative effect.
     *
     * This runs on every scroll (the handler already exists) and reveals
     * anything whose top has passed the bottom of the scroll container,
     * regardless of whether the observer ever fired for it. The observer still
     * does the work in the normal case; this only guarantees the floor.
     */
    const revealPassed = () => {
      const el = landingEl;
      if (!el) return;
      const limit = el.getBoundingClientRect().bottom;
      for (const node of el.querySelectorAll('.reveal:not(.visible)')) {
        if (node.getBoundingClientRect().top < limit) node.classList.add('visible');
      }
    };

    const onScroll = () => {
      const el = landingEl;
      if (!el) return;
      const denom = Math.max(1, el.scrollHeight - el.clientHeight);
      scrollPct = (el.scrollTop / denom) * 100;
      revealPassed();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        }
      },
      { threshold: 0.08, root: landingEl },
    );

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };

    prefersReducedMotion = motionQuery.matches;
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
    else motionQuery.addListener(onMotionChange);

    landingEl?.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    for (const el of landingEl.querySelectorAll('.reveal')) observer.observe(el);

    const onMessage = (e: MessageEvent) => {
      if (e.data === 'stabileo-enter-app') enterApp();
    };
    window.addEventListener('message', onMessage);

    return () => {
      observer.disconnect();
      landingEl?.removeEventListener('scroll', onScroll);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('hashchange', redirectRealtime);
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
  <link rel="preload" as="font" type="font/woff2" href="/fonts/space-grotesk-700.woff2" crossorigin="anonymous" />
  <link rel="preload" as="font" type="font/woff2" href="/fonts/ibm-plex-sans-400.woff2" crossorigin="anonymous" />
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

    The visitor meets Basic (04) and its live demo (05) before Education (09),
    PRO (10) or Stabileo AI (11), so the present state of the product is
    established before any future capability is described.

    Real-time solving used to hold a section of its own here. It is a genuine
    differentiator but a narrow one, and giving it a whole section between the
    demo and the capabilities matrix overstated it — it now sits in the Basic
    feature list, where a visitor reads it alongside the other things Basic
    does.
  -->
  <LandingNav />
  <LandingHero {prefersReducedMotion} />
  <LandingProblem />
  <LandingWhat />
  <LandingBasic />
  <LandingDemo />
  <LandingCapabilities />
  <LandingValidation />
  <LandingCodes />
  <LandingEducation />
  <LandingPro />
  <LandingThesis />
  <LandingStatus />
  <LandingDocs />
  <LandingCTA />
  <LandingFooter />
</div>
