<script lang="ts">
  import { onMount } from 'svelte';
  import LandingNav from './landing/LandingNav.svelte';
  import LandingHero from './landing/LandingHero.svelte';
  import LandingFeatures from './landing/LandingFeatures.svelte';
  import LandingAI from './landing/LandingAI.svelte';
  import LandingDocs from './landing/LandingDocs.svelte';
  import LandingDemo from './landing/LandingDemo.svelte';
  import LandingRoadmap from './landing/LandingRoadmap.svelte';
  import LandingCapabilities from './landing/LandingCapabilities.svelte';
  import LandingSocialProof from './landing/LandingSocialProof.svelte';
  import LandingPricing from './landing/LandingPricing.svelte';
  import LandingChangelog from './landing/LandingChangelog.svelte';
  import LandingCTA from './landing/LandingCTA.svelte';
  import LandingFooter from './landing/LandingFooter.svelte';
  import { enterApp } from './landing/landing-utils';
  import './landing/landing.css';

  let landingEl: HTMLDivElement;
  let scrollPct = $state(0);
  let prefersReducedMotion = $state(false);

  onMount(() => {
    const onScroll = () => {
      const el = landingEl;
      if (!el) return;
      const denom = Math.max(1, el.scrollHeight - el.clientHeight);
      scrollPct = (el.scrollTop / denom) * 100;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        }
      },
      { threshold: 0.12, root: landingEl },
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
      if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', onMotionChange);
      else motionQuery.removeListener(onMotionChange);
    };
  });
</script>

<svelte:head>
  <title>Stabileo — Browser-Based Structural Analysis</title>
  <meta
    name="description"
    content="Browser-native 2D and 3D structural analysis. No install, no license. Model, solve, inspect, and share complete engineering output right in the browser."
  />
  <meta name="theme-color" content="#0a0a0b" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Stabileo — Browser-Based Structural Analysis" />
  <meta
    property="og:description"
    content="Model, solve, inspect, and share structural analysis directly in the browser."
  />
  <meta property="og:image" content="/screenshots/3d-industrial.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Stabileo — Browser-Based Structural Analysis" />
  <meta
    name="twitter:description"
    content="Professional-grade 2D and 3D structural analysis directly in the browser, with a structured solver humans and AI can both use."
  />
  <meta name="twitter:image" content="/screenshots/3d-industrial.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="landing" bind:this={landingEl}>
  <div class="scroll-progress" style="width:{scrollPct}%"></div>

  <LandingNav />
  <LandingHero {prefersReducedMotion} />
  <LandingFeatures {prefersReducedMotion} />
  <LandingAI />
  <LandingDocs />
  <LandingDemo />
  <LandingCapabilities />
  <LandingRoadmap {prefersReducedMotion} />
  <LandingSocialProof />
  <LandingPricing />
  <LandingChangelog />
  <LandingCTA />
  <LandingFooter />
</div>
