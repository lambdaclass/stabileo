<script lang="ts">
  import { onMount } from 'svelte';
  import { t, i18n, setLocale } from '../lib/i18n';

  const repoUrl = 'https://github.com/lambdaclass/stabileo';

  /** Called when the user clicks a CTA that should enter the main app shell. */
  function enterApp() {
    window.dispatchEvent(new CustomEvent('stabileo-enter-app'));
  }

  let landingEl: HTMLDivElement;
  let demoLoaded = $state(false);
  let prefersReducedMotion = false;

  type Slideshow = {
    images: string[];
    idx: number;
    paused: boolean;
    iv: ReturnType<typeof setInterval> | null;
  };

  function createSlideshow(images: string[]): Slideshow {
    return { images, idx: 0, paused: false, iv: null };
  }

  function clearSlideshow(ss: Slideshow) {
    if (ss.iv) clearInterval(ss.iv);
    ss.iv = null;
  }

  function startSlideshow(ss: Slideshow, ms = 4000) {
    clearSlideshow(ss);
    if (prefersReducedMotion || ss.images.length < 2) return;
    ss.iv = setInterval(() => {
      if (!ss.paused) ss.idx = (ss.idx + 1) % ss.images.length;
    }, ms);
  }

  function goToSlide(ss: Slideshow, i: number) {
    ss.idx = i;
    ss.paused = true;
    clearSlideshow(ss);
    if (prefersReducedMotion || ss.images.length < 2) return;
    ss.iv = setInterval(() => {
      if (ss.paused) {
        ss.paused = false;
        return;
      }
      ss.idx = (ss.idx + 1) % ss.images.length;
    }, 4500);
  }

  function restartSlideshows() {
    startSlideshow(hero, 4200);
    startSlideshow(ss2d, 5200);
    startSlideshow(ss3d, 5200);
    startSlideshow(ssPro, 5600);
  }

  let hero = $state(createSlideshow([
    '/screenshots/3d-industrial.png',
    '/screenshots/2d-moments.png',
    '/screenshots/pro-verification.png',
  ]));

  let ss2d = $state(createSlideshow([
    '/screenshots/2d-loads.png',
    '/screenshots/2d-moments.png',
    '/screenshots/2d-section-analysis.png',
  ]));

  let ss3d = $state(createSlideshow([
    '/screenshots/3d-loads.png',
    '/screenshots/3d-section-analysis.png',
    '/screenshots/3d-industrial.png',
  ]));

  let ssPro = $state(createSlideshow([
    '/screenshots/pro-features.png',
    '/screenshots/pro-verification.png',
  ]));

  let scrollPct = $state(0);

  const depthTiles = [
    {
      code: '02',
      image: '/screenshots/2d-loads.png',
      tone: 'amber',
      titleKey: 'landing.capGrid2Title',
      descKey: 'landing.capGrid2Desc',
    },
    {
      code: '03',
      image: '/screenshots/3d-section-analysis.png',
      tone: 'plum',
      titleKey: 'landing.capGrid3Title',
      descKey: 'landing.capGrid3Desc',
    },
    {
      code: '04',
      image: '/screenshots/3d-loads.png',
      tone: 'ink',
      titleKey: 'landing.capGrid4Title',
      descKey: 'landing.capGrid4Desc',
    },
    {
      code: '07',
      image: '/screenshots/pro-verification.png',
      tone: 'paper',
      titleKey: 'landing.capGrid7Title',
      descKey: 'landing.capGrid7Desc',
    },
  ];

  const releaseCards = [
    { date: 'Feb 2026', key: 'landing.cl202602', tone: 'amber' },
    { date: 'Jan 2026', key: 'landing.cl202601', tone: 'plum' },
    { date: 'Dec 2025', key: 'landing.cl202512', tone: 'ink' },
  ];

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onMount(() => {
    const onScroll = () => {
      const el = landingEl;
      if (!el) return;
      const denom = Math.max(1, el.scrollHeight - el.clientHeight);
      scrollPct = (el.scrollTop / denom) * 100;
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      }
    }, { threshold: 0.12, root: landingEl });

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
      clearSlideshow(hero);
      clearSlideshow(ss2d);
      clearSlideshow(ss3d);
      clearSlideshow(ssPro);
      if (!prefersReducedMotion) restartSlideshows();
    };

    prefersReducedMotion = motionQuery.matches;
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
    else motionQuery.addListener(onMotionChange);

    if (!prefersReducedMotion) restartSlideshows();

    landingEl?.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    for (const el of landingEl.querySelectorAll('.reveal')) observer.observe(el);

    const onMessage = (e: MessageEvent) => {
      if (e.data === 'stabileo-enter-app') enterApp();
    };
    window.addEventListener('message', onMessage);

    return () => {
      clearSlideshow(hero);
      clearSlideshow(ss2d);
      clearSlideshow(ss3d);
      clearSlideshow(ssPro);
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
    content="Browser-based 2D and 3D structural analysis with diagrams, stresses, deformed shapes, IFC import, and an interactive demo. No install required."
  />
  <meta name="theme-color" content="#f4efe6" />
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
    content="Professional-grade 2D and 3D structural analysis directly in the browser."
  />
  <meta name="twitter:image" content="/screenshots/3d-industrial.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Sora:wght@500;600;700;800&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="landing" bind:this={landingEl}>
  <div class="page-orb orb-a"></div>
  <div class="page-orb orb-b"></div>
  <div class="noise"></div>
  <div class="scroll-progress" style="width:{scrollPct}%"></div>

  <nav class="nav">
    <div class="nav-inner">
      <button class="nav-brand" onclick={() => scrollTo('top')} aria-label="Back to top">
        <span class="nav-logo">△</span>
        <span class="nav-name">Stabileo</span>
      </button>

      <div class="nav-links">
        <button onclick={() => scrollTo('features')}>{t('landing.features')}</button>
        <button onclick={() => scrollTo('demo')}>{t('landing.demo')}</button>
        <button onclick={() => scrollTo('roadmap')}>{t('landing.roadmap')}</button>
        <button onclick={() => scrollTo('pricing')}>{t('landing.pricing')}</button>
      </div>

      <div class="nav-actions">
        <a class="nav-ghost" href={repoUrl} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
        <select class="nav-lang" value={i18n.locale} onchange={(e) => setLocale((e.currentTarget as HTMLSelectElement).value)} aria-label="Select language">
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="pt">Português</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="it">Italiano</option>
          <option value="tr">Türkçe</option>
          <option value="hi">हिन्दी</option>
          <option value="zh">中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="ru">Русский</option>
          <option value="ar">العربية</option>
          <option value="id">Bahasa Indonesia</option>
        </select>
        <button class="btn-primary sm" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
      </div>
    </div>
  </nav>

  <section class="hero" id="top">
    <div class="section-inner hero-grid">
      <div class="hero-copy">
        <div class="eyebrow">{t('landing.metricBrowser')} · {t('landing.compNoInstall')}</div>
        <h1>{t('landing.heroTitle1')} <em>{t('landing.heroTitle2')}</em></h1>
        <p class="hero-sub">{t('landing.heroSub')}</p>

        <div class="hero-pills">
          <span>{t('landing.modeBasicBadge')}</span>
          <span>2D + 3D</span>
          <span>{t('landing.openSource')}</span>
        </div>

        <div class="hero-ctas">
          <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
          <button class="btn-secondary" onclick={() => scrollTo('demo')}>{t('landing.interactiveDemo')}</button>
          <a class="btn-tertiary" href={repoUrl} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
        </div>

        <p class="hero-status">{t('landing.statusNote')}</p>
      </div>

      <div class="hero-visual reveal">
        <div class="hero-stage">
          <div class="hero-frame main-frame">
            <div class="frame-topline">
              <span class="frame-chip">Live workspace</span>
              <span class="frame-chip muted">{t('landing.modeBasicBadge')}</span>
            </div>
            <div class="frame-image hero-shot">
              <img
                src={hero.images[hero.idx]}
                alt="Stabileo workspace"
                loading="eager"
                fetchpriority="high"
              />
            </div>
            <div class="slide-controls">
              {#each hero.images as _, i}
                <button
                  class="ss-dot"
                  class:active={i === hero.idx}
                  onclick={() => goToSlide(hero, i)}
                  aria-label="Hero slide {i + 1}"
                ></button>
              {/each}
            </div>
          </div>

          <div class="signal-grid">
            <a class="signal-card" href={repoUrl} target="_blank" rel="noreferrer">
              <span class="signal-label">{t('landing.openSource')}</span>
              <strong>{t('landing.viewOnGithub')}</strong>
              <p>{t('landing.openSourceDesc')}</p>
            </a>

            <button class="signal-card" onclick={() => scrollTo('demo')}>
              <span class="signal-label">{t('landing.interactiveDemo')}</span>
              <strong>{t('landing.tryDemo')}</strong>
              <p>{t('landing.interactiveDemoDesc')}</p>
            </button>

            <div class="signal-card">
              <span class="signal-label">{t('landing.metricLanguages')}</span>
              <strong>14</strong>
              <p>{t('landing.capGrid8Desc')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="today-section" id="features">
    <div class="section-inner">
      <div class="section-heading reveal">
        <div class="eyebrow">{t('landing.modeBasicBadge')}</div>
        <h2>{t('landing.todayTitle')}</h2>
        <p class="section-sub">{t('landing.todaySub')}</p>
      </div>

      <div class="today-bands">
        <article class="feature-band band-warm reveal">
          <div class="band-copy">
            <div class="eyebrow">{t('landing.tagAnalysis2D')}</div>
            <h3 class="band-title">{t('landing.basic2dTitle')}</h3>
            <p class="band-sub">{t('landing.basic2dDesc')}</p>
            <ul class="feature-list band-list">
              <li>{t('landing.basic2d1')}</li>
              <li>{t('landing.basic2d2')}</li>
              <li>{t('landing.basic2d3')}</li>
              <li>{t('landing.basic2d4')}</li>
              <li>{t('landing.basic2d5')}</li>
            </ul>
            <div class="band-actions">
              <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
            </div>
          </div>

          <div class="band-visual">
            <div class="band-canvas">
              <img src={ss2d.images[ss2d.idx]} alt={t('landing.basic2dTitle')} loading="lazy" />
            </div>
            <div class="band-float-card">
              <img src="/screenshots/2d-section-analysis.png" alt={t('landing.basic2dTitle')} loading="lazy" />
            </div>
            <div class="slide-controls band-dots">
              {#each ss2d.images as _, i}
                <button
                  class="ss-dot"
                  class:active={i === ss2d.idx}
                  onclick={() => goToSlide(ss2d, i)}
                  aria-label="2D slide {i + 1}"
                ></button>
              {/each}
            </div>
          </div>
        </article>

        <article class="feature-band band-flame reverse reveal">
          <div class="band-copy">
            <div class="eyebrow">{t('landing.tagAnalysis3D')}</div>
            <h3 class="band-title">{t('landing.basic3dTitle')}</h3>
            <p class="band-sub">{t('landing.basic3dDesc')}</p>
            <ul class="feature-list band-list">
              <li>{t('landing.basic3d1')}</li>
              <li>{t('landing.basic3d2')}</li>
              <li>{t('landing.basic3d3')}</li>
              <li>{t('landing.basic3d4')}</li>
            </ul>
            <div class="band-actions">
              <a class="btn-secondary" href="/demo">{t('landing.tryTour')}</a>
            </div>
          </div>

          <div class="band-visual">
            <div class="band-canvas dark-canvas">
              <img src={ss3d.images[ss3d.idx]} alt={t('landing.basic3dTitle')} loading="lazy" />
            </div>
            <div class="band-float-card dark-float">
              <img src="/screenshots/3d-section-analysis.png" alt={t('landing.basic3dTitle')} loading="lazy" />
            </div>
            <div class="slide-controls band-dots">
              {#each ss3d.images as _, i}
                <button
                  class="ss-dot"
                  class:active={i === ss3d.idx}
                  onclick={() => goToSlide(ss3d, i)}
                  aria-label="3D slide {i + 1}"
                ></button>
              {/each}
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section class="demo-section reveal" id="demo">
    <div class="section-inner demo-layout">
      <div class="demo-copy">
        <div class="eyebrow">{t('landing.interactiveDemo')}</div>
        <h2>{t('landing.demoCardTitle')}</h2>
        <p class="section-sub left">{t('landing.demoCardDesc')}</p>

        <ul class="feature-list compact">
          <li>{t('landing.interactiveDemoDesc')}</li>
          <li>{t('landing.openSourceDesc')}</li>
          <li>{t('landing.ctaSub')}</li>
        </ul>

        <div class="demo-copy-actions">
          <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
          <a class="btn-tertiary" href="/demo">{t('landing.tryTour')}</a>
        </div>
      </div>

      <div class="demo-browser-clean">
        <div class="demo-iframe-wrap">
          {#if demoLoaded}
            <iframe src="/demo?embed" title="Stabileo Demo" class="demo-iframe"></iframe>
          {:else}
            <button class="demo-placeholder" onclick={() => demoLoaded = true}>
              <img src="/screenshots/2d-moments.png" alt="Stabileo Demo" class="demo-thumb" loading="lazy" />
              <div class="demo-play">
                <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48"><path d="M8 5v14l11-7z"/></svg>
                <span>{t('landing.tryDemo')}</span>
              </div>
            </button>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <section class="roadmap-section reveal" id="roadmap">
    <div class="section-inner">
      <div class="section-heading">
        <div class="eyebrow">{t('landing.comingSoon')}</div>
        <h2>{t('landing.roadmapTitle')}</h2>
        <p class="section-sub">{t('landing.roadmapSub')}</p>
      </div>

      <div class="roadmap-grid">
        <article class="roadmap-card roadmap-edu">
          <div class="mode-badge mode-badge-edu">{t('landing.modeEduBadge')}</div>
          <h3>{t('landing.modeEduTitle')}</h3>
          <p>{t('landing.modeEduSub')}</p>

          <div class="roadmap-block">
            <span class="roadmap-label">{t('landing.eduNowTitle')}</span>
            <ul class="feature-list compact">
              <li>{t('landing.eduNow1')}</li>
              <li>{t('landing.eduNow2')}</li>
              <li>{t('landing.eduNow3')}</li>
            </ul>
          </div>

          <div class="roadmap-block muted-block">
            <span class="roadmap-label">{t('landing.eduSoonTitle')}</span>
            <ul class="feature-list compact">
              <li>{t('landing.eduSoon1')}</li>
              <li>{t('landing.eduSoon2')}</li>
              <li>{t('landing.eduSoon3')}</li>
            </ul>
          </div>
        </article>

        <article class="roadmap-card roadmap-pro">
          <div class="mode-badge mode-badge-pro">{t('landing.modeProBadge')}</div>
          <h3>{t('landing.modeProTitle')}</h3>
          <p>{t('landing.modeProSub')}</p>

          <div class="card-media small-pro-media">
            <div class="frame-topline">
              <span class="frame-chip plum">{t('landing.tagPro')}</span>
              <span class="frame-chip muted">{t('landing.comingSoon')}</span>
            </div>
            <div class="frame-image compact-image feature-shot">
              <img src={ssPro.images[ssPro.idx]} alt={t('landing.modeProTitle')} loading="lazy" />
            </div>
            <div class="slide-controls">
              {#each ssPro.images as _, i}
                <button
                  class="ss-dot"
                  class:active={i === ssPro.idx}
                  onclick={() => goToSlide(ssPro, i)}
                  aria-label="Pro slide {i + 1}"
                ></button>
              {/each}
            </div>
          </div>

          <ul class="feature-list compact">
            <li>{t('landing.pro1')}</li>
            <li>{t('landing.pro2')}</li>
            <li>{t('landing.pro3')}</li>
            <li>{t('landing.pro4')}</li>
            <li>{t('landing.pro5')}</li>
          </ul>

          <p class="roadmap-note">{t('landing.pricingPlanned')}</p>
        </article>
      </div>
    </div>
  </section>

  <section class="capabilities reveal">
    <div class="section-inner">
      <div class="section-heading">
        <div class="eyebrow">{t('landing.coreDepth')}</div>
        <h2>{t('landing.capabilitiesTitle')}</h2>
        <p class="section-sub">{t('landing.coreDepthSub')}</p>
      </div>

      <div class="depth-grid">
        <article class="depth-hero-panel">
          <div class="depth-hero-copy">
            <div class="eyebrow depth-proof">{t('landing.depthHeroEyebrow')}</div>
            <h3>{t('landing.depthHeroTitle')}</h3>
            <p>{t('landing.depthHeroDesc')}</p>
            <ul class="feature-list depth-bullets">
              <li>{t('landing.depthHero1')}</li>
              <li>{t('landing.depthHero2')}</li>
              <li>{t('landing.depthHero3')}</li>
              <li>{t('landing.depthHero4')}</li>
            </ul>
          </div>

          <div class="depth-hero-stage">
            <div class="depth-main-shot">
              <img src="/screenshots/3d-industrial.png" alt={t('landing.depthHeroTitle')} loading="lazy" />
            </div>
            <div class="depth-float depth-float-a">
              <img src="/screenshots/3d-section-analysis.png" alt={t('landing.capGrid3Title')} loading="lazy" />
            </div>
            <div class="depth-float depth-float-b">
              <img src="/screenshots/2d-moments.png" alt={t('landing.capGrid1Title')} loading="lazy" />
            </div>
          </div>
        </article>

        {#each depthTiles as tile}
          <article class="depth-tile" data-tone={tile.tone}>
            <div class="depth-tile-media">
              <img src={tile.image} alt={t(tile.titleKey)} loading="lazy" />
            </div>
            <div class="depth-tile-copy">
              <span class="cap-code">{tile.code}</span>
              <h4>{t(tile.titleKey)}</h4>
              <p>{t(tile.descKey)}</p>
            </div>
          </article>
        {/each}
      </div>
    </div>
  </section>

  <section class="pricing reveal" id="pricing">
    <div class="section-inner">
      <div class="section-heading access-heading">
        <div class="eyebrow">{t('landing.pricing')}</div>
        <h2>{t('landing.accessTitle')}</h2>
        <p class="section-sub">{t('landing.accessSub')}</p>
      </div>

      <div class="access-grid">
        <article class="price-card featured free-card access-main">
          <div class="access-topline">
            <div class="mode-badge mode-badge-basic">{t('landing.priceFreeTitle')}</div>
            <div class="price-amount">$0</div>
          </div>
          <h3>{t('landing.accessFreeTitle')}</h3>
          <p class="access-lead">{t('landing.accessFreeDesc')}</p>
          <ul class="access-list">
            <li>{t('landing.priceFree1')}</li>
            <li>{t('landing.priceFree2')}</li>
            <li>{t('landing.priceFree3')}</li>
            <li>{t('landing.priceFree4')}</li>
            <li>{t('landing.priceFree5')}</li>
            <li>{t('landing.priceFree6')}</li>
          </ul>
          <div class="access-stamps">
            <span>{t('landing.metricBrowser')}</span>
            <span>2D + 3D</span>
            <span>{t('landing.openSource')}</span>
          </div>
          <button class="btn-primary card-cta" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
        </article>

        <article class="price-card pilot-card access-side">
          <div class="price-ribbon">{t('landing.comingSoon')}</div>
          <div class="access-side-media">
            <img src={ssPro.images[ssPro.idx]} alt={t('landing.priceProTitle')} loading="lazy" />
          </div>
          <div class="mode-badge mode-badge-pro">{t('landing.priceProTitle')}</div>
          <h3>{t('landing.accessPilotTitle')}</h3>
          <p class="access-lead">{t('landing.accessPilotDesc')}</p>
          <ul>
            <li>{t('landing.pricePro1')}</li>
            <li>{t('landing.pricePro2')}</li>
            <li>{t('landing.pricePro3')}</li>
            <li>{t('landing.pricePro4')}</li>
            <li>{t('landing.pricePro5')}</li>
            <li class="ai-highlight">{t('landing.pricePro6')}</li>
            <li>{t('landing.priceProExtra')}</li>
          </ul>
          <a class="btn-secondary card-link" href={repoUrl} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
        </article>
      </div>
    </div>
  </section>

  <section class="changelog-section reveal">
    <div class="section-inner">
      <div class="section-heading">
        <div class="eyebrow">{t('landing.changelog')}</div>
        <h2>{t('landing.changelog')}</h2>
        <p class="section-sub">{t('landing.changelogDesc')}</p>
      </div>

      <div class="build-grid">
        <article class="build-feature">
          <div class="cl-date">Mar 2026</div>
          <h3>{t('landing.buildFeatureTitle')}</h3>
          <p class="build-feature-text">{t('landing.cl202603')}</p>
          <div class="build-actions">
            <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
            <a class="btn-tertiary" href={repoUrl} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
          </div>
        </article>

        <div class="build-stack">
          {#each releaseCards as item}
            <article class="build-card" data-tone={item.tone}>
              <div class="cl-date">{item.date}</div>
              <div class="cl-text">{t(item.key)}</div>
            </article>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="final-cta reveal">
    <div class="section-inner final-cta-inner">
      <div>
        <div class="eyebrow">{t('landing.tryItNow')}</div>
        <h2>{t('landing.ctaTitle')}</h2>
        <p>{t('landing.ctaSub')}</p>
      </div>
      <div class="final-actions">
        <button class="btn-primary large" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
        <a class="btn-tertiary" href={repoUrl} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
      </div>
    </div>
  </section>

  <footer class="lp-footer">
    <div class="section-inner footer-inner">
      <div class="footer-top">
        <div class="footer-brand">
          <span class="nav-logo">△</span>
          <span>Stabileo</span>
        </div>
        <div class="footer-links">
          <a href={repoUrl} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
          <a href="/demo">{t('landing.tryTour')}</a>
          <button onclick={() => enterApp()}>{t('landing.tryApp')}</button>
        </div>
      </div>
      <p class="footer-desc">{t('landing.openSourceDesc')}</p>
      <p class="footer-copy">&copy; {new Date().getFullYear()} Stabileo. {t('landing.footerRights')}</p>
    </div>
  </footer>

  <div class="mobile-sticky">
    <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
  </div>
</div>

<style>
  :global(:root) {
    --landing-bg: #f4efe6;
    --landing-paper: #fffaf2;
    --landing-ink: #11151d;
    --landing-muted: #677083;
    --landing-line: rgba(17, 21, 29, 0.12);
    --landing-orange: #c7642a;
    --landing-orange-soft: rgba(199, 100, 42, 0.12);
    --landing-steel: #1f4f79;
    --landing-steel-soft: rgba(31, 79, 121, 0.11);
    --landing-green: #2f7f61;
    --landing-green-soft: rgba(47, 127, 97, 0.12);
    --landing-plum: #6d4ea2;
    --landing-plum-soft: rgba(109, 78, 162, 0.11);
    --landing-shadow: 0 22px 70px rgba(17, 21, 29, 0.08);
  }

  .landing {
    position: fixed;
    inset: 0;
    z-index: 10000;
    overflow-y: auto;
    overflow-x: hidden;
    background:
      radial-gradient(circle at top left, rgba(199, 100, 42, 0.16), transparent 24%),
      radial-gradient(circle at top right, rgba(31, 79, 121, 0.1), transparent 28%),
      linear-gradient(180deg, #f4efe6 0%, #efe7db 100%);
    color: var(--landing-ink);
    font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .section-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 2rem;
  }

  .page-orb {
    position: fixed;
    border-radius: 999px;
    filter: blur(70px);
    pointer-events: none;
    opacity: 0.5;
  }

  .orb-a {
    width: 260px;
    height: 260px;
    top: 100px;
    left: -90px;
    background: rgba(199, 100, 42, 0.18);
  }

  .orb-b {
    width: 280px;
    height: 280px;
    top: 28%;
    right: -110px;
    background: rgba(31, 79, 121, 0.14);
  }

  .noise {
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.035;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 256px 256px;
  }

  .scroll-progress {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    z-index: 250;
    background: linear-gradient(90deg, var(--landing-orange), var(--landing-steel));
    transition: width 0.1s linear;
  }

  .reveal {
    opacity: 0;
    transform: translateY(24px);
    transition:
      opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .reveal:global(.visible) {
    opacity: 1;
    transform: translateY(0);
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.75rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.7);
    border: 1px solid var(--landing-line);
    color: var(--landing-steel);
    font-size: 0.76rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  h4,
  .nav-name,
  .price-amount {
    font-family: 'Sora', 'IBM Plex Sans', sans-serif;
  }

  .nav {
    position: sticky;
    top: 0;
    z-index: 200;
    background: rgba(16, 14, 29, 0.92);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(18px) saturate(1.15);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2);
  }

  .nav-inner {
    max-width: 1220px;
    margin: 0 auto;
    padding: 0 2rem;
    height: 72px;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .nav-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .nav-logo {
    color: #f4b14c;
    font-size: 1.4rem;
    font-weight: 800;
  }

  .nav-name {
    color: #fff7ef;
    font-size: 1.02rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .nav-links {
    margin-left: auto;
    display: flex;
    gap: 0.25rem;
  }

  .nav-links button {
    background: none;
    border: none;
    color: rgba(255, 247, 239, 0.68);
    cursor: pointer;
    font: inherit;
  }

  .nav-links button {
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .nav-links button:hover,
  .nav-links button:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    color: #fff7ef;
  }

  .footer-links button {
    background: none;
    border: none;
    color: var(--landing-steel);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
  }

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .nav-ghost,
  .btn-tertiary,
  .footer-links a {
    color: var(--landing-steel);
    text-decoration: none;
    font-weight: 600;
  }

  .nav-ghost {
    color: rgba(255, 247, 239, 0.82);
    font-size: 0.88rem;
  }

  .nav-lang {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 247, 239, 0.82);
    border-radius: 999px;
    padding: 0.45rem 0.9rem;
    font: inherit;
    min-width: 126px;
    cursor: pointer;
  }

  .btn-primary,
  .btn-secondary,
  .btn-tertiary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0.85rem 1.35rem;
    font-size: 0.92rem;
    font-weight: 700;
    text-decoration: none;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      background 0.2s ease,
      color 0.2s ease,
      border-color 0.2s ease;
  }

  .btn-primary {
    border: none;
    background: var(--landing-ink);
    color: #f7f1e8;
    cursor: pointer;
    box-shadow: 0 12px 30px rgba(17, 21, 29, 0.12);
  }

  .btn-primary:hover,
  .btn-secondary:hover,
  .btn-tertiary:hover {
    transform: translateY(-1px);
  }

  .btn-primary.sm {
    padding: 0.62rem 1rem;
    font-size: 0.84rem;
  }

  .nav-actions .btn-primary {
    background: #fff0cf;
    color: #12101f;
    box-shadow: none;
  }

  .btn-primary.large {
    padding-inline: 1.7rem;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.7);
    color: var(--landing-ink);
    border: 1px solid var(--landing-line);
  }

  .btn-tertiary {
    padding: 0;
    color: var(--landing-steel);
    font-weight: 700;
  }

  .hero {
    position: relative;
    padding: 4.8rem 0 4.2rem;
    overflow: clip;
    isolation: isolate;
  }

  .hero::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    background:
      radial-gradient(circle at top left, rgba(243, 170, 82, 0.18), transparent 22%),
      radial-gradient(circle at 78% 16%, rgba(31, 79, 121, 0.08), transparent 18%),
      linear-gradient(180deg, #f7f0de 0%, #f4ebd8 100%);
  }

  .hero::after {
    content: '';
    position: absolute;
    right: clamp(-120px, -8vw, -20px);
    top: 3rem;
    width: clamp(320px, 44vw, 680px);
    height: clamp(320px, 42vw, 620px);
    border-radius: 56px;
    background: linear-gradient(135deg, #1b172d 0%, #110f1d 100%);
    box-shadow: 0 30px 90px rgba(17, 21, 29, 0.16);
    z-index: -1;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.84fr) minmax(0, 1.16fr);
    gap: 2.8rem;
    align-items: start;
  }

  .hero-copy {
    position: relative;
    z-index: 1;
    padding-top: 2.2rem;
    max-width: 580px;
  }

  .hero-copy h1 {
    margin: 1.2rem 0 1rem;
    font-size: clamp(3rem, 6vw, 5.4rem);
    line-height: 0.98;
    letter-spacing: -0.05em;
    max-width: 560px;
  }

  .hero-copy h1 :global(em) {
    font-style: normal;
    color: var(--landing-orange);
  }

  .hero-sub {
    max-width: 520px;
    font-size: 1.12rem;
    line-height: 1.7;
    color: rgba(17, 21, 29, 0.68);
  }

  .hero-pills,
  .frame-topline,
  .band-actions,
  .demo-copy-actions,
  .final-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .hero-pills {
    margin: 1.5rem 0 1.7rem;
  }

  .hero-pills span,
  .frame-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.38rem 0.72rem;
    border-radius: 999px;
    border: 1px solid var(--landing-line);
    background: rgba(255, 255, 255, 0.72);
    color: var(--landing-ink);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .frame-chip.muted {
    color: var(--landing-muted);
  }

  .frame-chip.plum {
    color: var(--landing-plum);
    background: var(--landing-plum-soft);
    border-color: rgba(109, 78, 162, 0.18);
  }

  .hero-ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    align-items: center;
  }

  .hero-status {
    margin-top: 1.4rem;
    max-width: 520px;
    color: rgba(17, 21, 29, 0.72);
    font-size: 0.92rem;
    line-height: 1.65;
  }

  .hero-visual {
    position: relative;
    padding: 2rem 0 0 1rem;
  }

  .hero-visual::before {
    content: '';
    position: absolute;
    inset: 2.2rem 1rem 1.8rem 4rem;
    border-radius: 38px;
    background:
      linear-gradient(135deg, rgba(243, 90, 39, 0.9), rgba(241, 138, 44, 0.88));
    opacity: 0.96;
    z-index: 0;
  }

  .hero-visual::after {
    content: '';
    position: absolute;
    inset: 3.2rem 2.4rem 3.2rem 6rem;
    border-radius: 34px;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
    background-size: 44px 44px;
    opacity: 0.26;
    z-index: 0;
  }

  .hero-stage,
  .signal-card,
  .depth-hero-panel,
  .depth-tile,
  .price-card,
  .roadmap-card,
  .build-card,
  .build-feature,
  .demo-browser-clean {
    border: 1px solid var(--landing-line);
    background: rgba(255, 250, 242, 0.82);
    backdrop-filter: blur(8px);
    box-shadow: var(--landing-shadow);
  }

  .hero-stage {
    position: relative;
    z-index: 1;
    border-radius: 28px;
    padding: 1.25rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(18, 14, 31, 0.3)),
      linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(242, 90, 39, 0.08));
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 26px 84px rgba(10, 8, 22, 0.34);
  }

  .hero-frame,
  .card-media,
  .demo-browser-clean {
    border-radius: 20px;
    background: #fffdf8;
  }

  .hero-frame,
  .card-media {
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .main-frame {
    margin-bottom: 1rem;
  }

  .frame-topline {
    padding: 0.85rem 0.9rem 0;
    background: rgba(17, 21, 29, 0.06);
  }

  .frame-image {
    aspect-ratio: 2182 / 1292;
    padding: 0.7rem;
    background: linear-gradient(180deg, rgba(17, 21, 29, 0.02), rgba(17, 21, 29, 0.045));
  }

  .frame-image img,
  .demo-thumb {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 14px;
    object-fit: cover;
    object-position: center top;
    box-shadow: 0 12px 36px rgba(17, 21, 29, 0.12);
  }

  .compact-image {
    padding-top: 0.5rem;
  }

  .hero-shot {
    min-height: 400px;
  }

  .feature-shot {
    min-height: 310px;
  }

  .slide-controls {
    display: flex;
    gap: 0.55rem;
    justify-content: center;
    padding: 0.95rem 1rem 1rem;
  }

  .ss-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    border: none;
    background: rgba(17, 21, 29, 0.18);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .ss-dot.active {
    width: 30px;
    background: var(--landing-orange);
  }

  .signal-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  .signal-card {
    border-radius: 18px;
    padding: 1rem 1.05rem;
    text-align: left;
    color: inherit;
    text-decoration: none;
    background: rgba(255, 248, 240, 0.96);
    min-height: 126px;
  }

  .signal-card strong {
    display: block;
    margin: 0.35rem 0 0.5rem;
    font-family: 'Sora', sans-serif;
    font-size: 1rem;
  }

  .signal-card p {
    margin: 0;
    color: var(--landing-muted);
    font-size: 0.88rem;
    line-height: 1.6;
  }

  .signal-label {
    display: block;
    color: var(--landing-steel);
    font-size: 0.73rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .today-section,
  .demo-section,
  .roadmap-section,
  .capabilities,
  .pricing,
  .changelog-section,
  .final-cta {
    padding: 1.6rem 0 4.5rem;
  }

  .today-section {
    padding-top: 2.7rem;
  }

  .pricing {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(247, 237, 187, 0.42) 100%);
  }

  .changelog-section {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 250, 242, 0.5) 100%);
  }

  .section-heading {
    text-align: center;
    margin-bottom: 1.9rem;
  }

  .section-heading h2 {
    margin: 1rem 0 0.85rem;
    font-size: clamp(2.1rem, 4vw, 3.2rem);
    line-height: 1.02;
    letter-spacing: -0.04em;
  }

  .section-sub {
    max-width: 760px;
    margin: 0 auto;
    color: var(--landing-muted);
    font-size: 1rem;
    line-height: 1.75;
  }

  .section-sub.left {
    text-align: left;
    margin-left: 0;
  }

  .roadmap-grid,
  .access-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.35rem;
  }

  .roadmap-card,
  .price-card {
    border-radius: 24px;
    padding: 1.1rem;
  }

  .today-bands {
    display: flex;
    flex-direction: column;
    gap: 1.15rem;
  }

  .feature-band {
    display: grid;
    grid-template-columns: minmax(0, 0.46fr) minmax(0, 0.54fr);
    align-items: center;
    gap: 0;
    min-height: 540px;
    border-radius: 30px;
    overflow: hidden;
    border: 1px solid rgba(17, 21, 29, 0.08);
    box-shadow: 0 24px 64px rgba(17, 21, 29, 0.1);
    position: relative;
  }

  .feature-band.reverse {
    grid-template-columns: minmax(0, 0.54fr) minmax(0, 0.46fr);
  }

  .feature-band.reverse .band-copy {
    order: 2;
  }

  .feature-band.reverse .band-visual {
    order: 1;
  }

  .band-warm {
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.42), transparent 24%),
      linear-gradient(180deg, #f4e780 0%, #f7efb8 100%);
  }

  .band-flame {
    background:
      radial-gradient(circle at top left, rgba(255, 220, 185, 0.16), transparent 22%),
      linear-gradient(180deg, #eb7240 0%, #e66734 100%);
    color: #fff7ef;
  }

  .band-copy {
    padding: clamp(1.8rem, 3vw, 3rem);
  }

  .band-title {
    margin: 0.85rem 0 0.7rem;
    font-size: clamp(2.35rem, 4vw, 3.85rem);
    line-height: 0.92;
    letter-spacing: -0.05em;
  }

  .band-sub {
    max-width: 470px;
    margin-bottom: 1rem;
    font-size: 0.98rem;
    line-height: 1.65;
  }

  .band-list li {
    max-width: 470px;
    margin-bottom: 0.48rem;
    font-size: 0.92rem;
    line-height: 1.52;
  }

  .band-visual {
    position: relative;
    min-height: 420px;
    padding: 1.35rem 1.35rem 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .band-visual::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(17, 21, 29, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(17, 21, 29, 0.08) 1px, transparent 1px);
    background-size: 44px 44px;
    opacity: 0.38;
  }

  .band-visual::after {
    content: '';
    position: absolute;
    width: 38%;
    aspect-ratio: 1;
    border-radius: 28px;
    background: rgba(17, 21, 29, 0.08);
    right: -10%;
    top: -10%;
    transform: rotate(12deg);
  }

  .band-flame .band-visual::before {
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
    opacity: 0.3;
  }

  .band-flame .band-visual::after {
    width: 50%;
    border-radius: 32px;
    background: rgba(13, 10, 28, 0.42);
    right: -8%;
    top: -6%;
  }

  .band-canvas {
    width: 100%;
    min-height: 330px;
    border-radius: 22px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(17, 21, 29, 0.1);
    box-shadow: 0 22px 54px rgba(17, 21, 29, 0.14);
    position: relative;
    z-index: 2;
  }

  .band-canvas img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    object-position: center top;
  }

  .dark-canvas {
    background: rgba(14, 16, 30, 0.85);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .band-float-card {
    position: absolute;
    right: 0.85rem;
    bottom: 2.3rem;
    width: min(31%, 210px);
    border-radius: 16px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(17, 21, 29, 0.08);
    box-shadow: 0 14px 38px rgba(17, 21, 29, 0.15);
    z-index: 3;
  }

  .band-float-card img {
    width: 100%;
    display: block;
    aspect-ratio: 1.12;
    object-fit: cover;
    object-position: center top;
  }

  .dark-float {
    background: rgba(17, 21, 29, 0.9);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .band-dots {
    position: absolute;
    left: 1.35rem;
    bottom: 0.6rem;
    justify-content: flex-start;
    padding-inline: 0;
    z-index: 4;
  }

  .band-flame .eyebrow {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.14);
    color: #fff7ef;
  }

  .band-flame .band-sub,
  .band-flame .feature-list li {
    color: rgba(255, 247, 239, 0.86);
  }

  .band-flame .feature-list li::before {
    color: #fff4d4;
  }

  .band-flame .btn-secondary {
    background: rgba(255, 255, 255, 0.12);
    color: #fff7ef;
    border-color: rgba(255, 255, 255, 0.18);
  }

  .mode-badge,
  .roadmap-label,
  .cap-code,
  .price-ribbon {
    display: inline-flex;
    align-items: center;
    width: fit-content;
  }

  .mode-badge,
  .roadmap-label {
    border-radius: 999px;
    padding: 0.35rem 0.72rem;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .mode-badge-edu {
    background: var(--landing-green-soft);
    color: var(--landing-green);
  }

  .mode-badge-basic {
    background: var(--landing-orange-soft);
    color: var(--landing-orange);
  }

  .mode-badge-pro {
    background: var(--landing-plum-soft);
    color: var(--landing-plum);
  }

  .roadmap-card h3,
  .price-card h3 {
    margin: 0.8rem 0 0.6rem;
    font-size: 1.5rem;
    line-height: 1.2;
  }

  .roadmap-card p,
  .price-card p,
  .footer-desc,
  .cl-text,
  .depth-tile p,
  .depth-hero-panel p {
    color: var(--landing-muted);
    line-height: 1.7;
  }

  .feature-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .feature-list li,
  .price-card li {
    position: relative;
    padding-left: 1.15rem;
    margin-bottom: 0.55rem;
    line-height: 1.58;
  }

  .feature-list li::before,
  .price-card li::before {
    content: '•';
    position: absolute;
    left: 0;
    color: var(--landing-orange);
    font-weight: 700;
  }

  .feature-list.compact li,
  .price-card li {
    font-size: 0.92rem;
  }

  .demo-section {
    margin: 1rem 0;
    background:
      radial-gradient(circle at top right, rgba(199, 100, 42, 0.18), transparent 24%),
      linear-gradient(180deg, #121823 0%, #171f2d 100%);
    color: #f5efe7;
  }

  .demo-section .section-sub,
  .demo-section .feature-list li,
  .demo-section .demo-copy p {
    color: rgba(245, 239, 231, 0.78);
  }

  .demo-section .feature-list li::before {
    color: #f0a266;
  }

  .demo-section .eyebrow {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    color: #d8dfef;
  }

  .demo-section h2,
  .demo-section .btn-tertiary {
    color: #f7f2eb;
  }

  .demo-section .btn-primary {
    background: #f2ebe2;
    color: #121823;
  }

  .demo-layout {
    display: grid;
    grid-template-columns: minmax(0, 0.42fr) minmax(0, 0.58fr);
    gap: 1.5rem;
    align-items: stretch;
    position: relative;
    padding: 1.25rem;
    border-radius: 30px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
    overflow: hidden;
    box-shadow: 0 22px 60px rgba(0, 0, 0, 0.18);
  }

  .demo-layout::before {
    content: '';
    position: absolute;
    width: 34%;
    aspect-ratio: 1;
    right: -6%;
    top: -14%;
    border-radius: 28px;
    transform: rotate(12deg);
    background: rgba(240, 162, 102, 0.12);
  }

  .demo-copy {
    position: relative;
    z-index: 1;
    padding: 0.8rem 0.4rem 0.8rem 0.5rem;
  }

  .demo-copy h2 {
    margin: 0.9rem 0 0.8rem;
    font-size: clamp(2rem, 3.2vw, 2.95rem);
    line-height: 0.98;
    letter-spacing: -0.05em;
  }

  .demo-copy .feature-list {
    max-width: 520px;
    margin-top: 1rem;
  }

  .demo-browser-clean {
    position: relative;
    z-index: 1;
    border-radius: 24px;
    overflow: hidden;
    background: rgba(8, 11, 18, 0.72);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
  }

  .demo-iframe-wrap {
    position: relative;
    aspect-ratio: 16 / 10;
    background: #0d121c;
  }

  .demo-iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: #0d121c;
  }

  .demo-placeholder {
    position: relative;
    width: 100%;
    height: 100%;
    border: none;
    padding: 0;
    background: none;
    cursor: pointer;
  }

  .demo-thumb {
    object-fit: cover;
    filter: saturate(0.9) contrast(0.96);
  }

  .demo-play {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    color: white;
    background: linear-gradient(180deg, rgba(17, 21, 29, 0.14), rgba(17, 21, 29, 0.38));
  }

  .demo-play svg {
    width: 70px;
    height: 70px;
    filter: drop-shadow(0 8px 22px rgba(0, 0, 0, 0.28));
  }

  .demo-play span {
    font-size: 1.02rem;
    font-weight: 700;
  }

  .roadmap-section {
    padding-top: 2.4rem;
    background:
      linear-gradient(180deg, #f5efe3 0%, #f3ecde 100%);
  }

  .roadmap-block {
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(17, 21, 29, 0.08);
  }

  .muted-block {
    opacity: 0.82;
  }

  .roadmap-label {
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid rgba(17, 21, 29, 0.09);
    color: var(--landing-ink);
    margin-bottom: 0.75rem;
  }

  .small-pro-media {
    margin: 1rem 0 1.1rem;
  }

  .roadmap-note {
    margin-top: 0.8rem;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--landing-steel);
  }

  .roadmap-card {
    min-height: 100%;
  }

  .roadmap-edu {
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.44), transparent 22%),
      linear-gradient(180deg, #f7e97c 0%, #f7f0b0 100%);
    border-top: 4px solid rgba(47, 127, 97, 0.45);
  }

  .roadmap-pro {
    background:
      radial-gradient(circle at top left, rgba(245, 174, 124, 0.14), transparent 20%),
      linear-gradient(180deg, #171326 0%, #120f20 100%);
    border-color: rgba(255, 255, 255, 0.08);
    border-top: 4px solid rgba(109, 78, 162, 0.55);
    color: #f8f2ea;
  }

  .roadmap-pro p,
  .roadmap-pro .feature-list li,
  .roadmap-pro .roadmap-note {
    color: rgba(248, 242, 234, 0.78);
  }

  .roadmap-pro .feature-list li::before {
    color: #f0a266;
  }

  .roadmap-pro .frame-topline {
    background: rgba(255, 255, 255, 0.03);
  }

  .capabilities {
    padding: 2.5rem 0 4.6rem;
    background:
      linear-gradient(180deg, #13111f 0%, #171326 100%);
    color: #f8f2ea;
    position: relative;
    overflow: clip;
  }

  .capabilities::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: 52px 52px;
    opacity: 0.26;
    pointer-events: none;
  }

  .capabilities .eyebrow {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    color: #f8f2ea;
  }

  .capabilities h2,
  .capabilities .section-sub {
    color: #f8f2ea;
  }

  .capabilities .section-sub {
    color: rgba(248, 242, 234, 0.74);
  }

  .depth-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr) minmax(0, 0.8fr);
    gap: 0.9rem;
    position: relative;
    z-index: 1;
  }

  .depth-hero-panel {
    grid-column: 1 / span 2;
    grid-row: 1 / span 2;
    min-height: 560px;
    display: grid;
    grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
    border-radius: 28px;
    overflow: hidden;
    position: relative;
    background: linear-gradient(135deg, #1a162b 0%, #0f0c1b 100%);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 22px 72px rgba(0, 0, 0, 0.28);
  }

  .depth-hero-panel::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
    background-size: 38px 38px;
    opacity: 0.34;
    pointer-events: none;
  }

  .depth-hero-copy {
    position: relative;
    z-index: 1;
    padding: clamp(1.7rem, 3vw, 2.4rem);
    color: #f8f2ea;
  }

  .depth-proof {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    color: #f8f2ea;
  }

  .depth-hero-copy h3 {
    max-width: 420px;
    margin: 0.85rem 0 0.8rem;
    font-size: clamp(2rem, 3.4vw, 3.15rem);
    line-height: 0.92;
    letter-spacing: -0.05em;
  }

  .depth-hero-copy p {
    max-width: 380px;
    font-size: 0.96rem;
    line-height: 1.65;
    color: rgba(248, 242, 234, 0.78);
  }

  .depth-bullets {
    margin-top: 1rem;
  }

  .depth-bullets li {
    max-width: 400px;
    margin-bottom: 0.5rem;
    font-size: 0.93rem;
    line-height: 1.52;
    color: rgba(248, 242, 234, 0.84);
  }

  .depth-bullets li::before {
    color: #f0a266;
  }

  .depth-hero-stage {
    position: relative;
    min-height: 100%;
    padding: 1.3rem 1.3rem 1.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .depth-main-shot {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    min-height: 360px;
    border-radius: 22px;
    overflow: hidden;
    background: rgba(14, 16, 30, 0.88);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 22px 72px rgba(0, 0, 0, 0.28);
  }

  .depth-main-shot img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    object-position: center top;
  }

  .depth-float {
    position: absolute;
    z-index: 2;
    width: min(32%, 200px);
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  }

  .depth-float img {
    width: 100%;
    display: block;
    aspect-ratio: 1.18;
    object-fit: cover;
    object-position: center top;
  }

  .depth-float-a {
    right: 0.6rem;
    top: 1.25rem;
  }

  .depth-float-b {
    left: 0;
    bottom: 1.2rem;
  }

  .cap-code {
    margin-bottom: 0.85rem;
    border-radius: 999px;
    padding: 0.3rem 0.62rem;
    background: rgba(17, 21, 29, 0.08);
    color: rgba(17, 21, 29, 0.68);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.06em;
  }

  .depth-tile {
    border-radius: 22px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 260px;
  }

  .depth-tile[data-tone='amber'] {
    background: linear-gradient(180deg, #f5df67 0%, #f6edab 100%);
  }

  .depth-tile[data-tone='plum'] {
    background: linear-gradient(180deg, #231c38 0%, #171126 100%);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .depth-tile[data-tone='ink'] {
    background: linear-gradient(180deg, #111728 0%, #0d1220 100%);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .depth-tile[data-tone='paper'] {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 250, 242, 0.92));
  }

  .depth-tile-media {
    aspect-ratio: 16 / 10;
    padding: 0.72rem 0.72rem 0;
  }

  .depth-tile-media img {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 18px;
    object-fit: cover;
    object-position: center top;
  }

  .depth-tile-copy {
    padding: 0.9rem 1rem 1.05rem;
  }

  .depth-tile h4 {
    margin: 0 0 0.4rem;
    font-size: 1rem;
    line-height: 1.25;
  }

  .depth-tile[data-tone='plum'] h4,
  .depth-tile[data-tone='ink'] h4 {
    color: #f8f2ea;
  }

  .depth-tile[data-tone='plum'] p,
  .depth-tile[data-tone='ink'] p {
    color: rgba(248, 242, 234, 0.74);
  }

  .depth-tile[data-tone='plum'] .cap-code,
  .depth-tile[data-tone='ink'] .cap-code {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(248, 242, 234, 0.72);
  }

  .access-heading {
    max-width: 760px;
    margin-inline: auto;
  }

  .access-grid {
    align-items: stretch;
  }

  .price-card {
    display: flex;
    flex-direction: column;
  }

  .price-card.featured {
    background: linear-gradient(180deg, #171326 0%, #120f20 100%);
    border-color: rgba(255, 255, 255, 0.08);
    color: #f8f2ea;
  }

  .price-card:not(.featured) {
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.52), transparent 24%),
      linear-gradient(180deg, #f5e36f 0%, #f6edaa 100%);
    border-color: rgba(17, 21, 29, 0.08);
  }

  .free-card li,
  .free-card p {
    color: rgba(248, 242, 234, 0.76);
  }

  .free-card li::before {
    color: #f0a266;
  }

  .free-card .btn-primary {
    background: #f4efe6;
    color: #171326;
    box-shadow: none;
  }

  .access-main,
  .access-side {
    min-height: 520px;
  }

  .access-main {
    padding: 1.5rem;
    justify-content: space-between;
  }

  .access-topline {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 1rem;
  }

  .access-main h3,
  .access-side h3 {
    margin-top: 1rem;
    font-size: clamp(2rem, 3vw, 2.9rem);
    line-height: 0.96;
    letter-spacing: -0.05em;
  }

  .access-lead {
    max-width: 560px;
    margin-bottom: 1.2rem;
    font-size: 1rem;
    line-height: 1.75;
  }

  .access-list {
    columns: 2;
    column-gap: 1.4rem;
    margin-bottom: 1.25rem;
  }

  .access-list li {
    break-inside: avoid;
  }

  .access-stamps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-bottom: 1rem;
  }

  .access-stamps span {
    display: inline-flex;
    align-items: center;
    padding: 0.42rem 0.78rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(248, 242, 234, 0.78);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .access-side {
    position: relative;
    padding: 1rem;
    justify-content: flex-start;
  }

  .access-side-media {
    margin-bottom: 1rem;
    border-radius: 20px;
    overflow: hidden;
    background: rgba(17, 21, 29, 0.18);
    border: 1px solid rgba(17, 21, 29, 0.08);
    box-shadow: 0 16px 40px rgba(17, 21, 29, 0.12);
  }

  .access-side-media img {
    width: 100%;
    display: block;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    object-position: center top;
  }

  .price-ribbon {
    position: absolute;
    top: 1rem;
    right: 1rem;
    border-radius: 999px;
    padding: 0.3rem 0.62rem;
    background: var(--landing-plum-soft);
    color: var(--landing-plum);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .price-amount {
    margin-top: 0.35rem;
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: -0.05em;
  }

  .price-card ul {
    list-style: none;
    padding: 0;
    margin: 0 0 1.2rem;
  }

  .price-card li.ai-highlight {
    color: var(--landing-ink);
    font-weight: 600;
  }

  .pilot-card li.ai-highlight {
    color: #171326;
  }

  .card-cta,
  .card-link {
    margin-top: auto;
  }

  .build-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
    gap: 1rem;
  }

  .build-feature {
    border-radius: 28px;
    padding: 1.6rem;
    min-height: 340px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background:
      radial-gradient(circle at top right, rgba(243, 90, 39, 0.24), transparent 24%),
      linear-gradient(135deg, #131922 0%, #171f2a 100%);
    border-color: rgba(255, 255, 255, 0.08);
    color: #f5efe7;
  }

  .build-feature h3 {
    margin: 0.7rem 0 0.8rem;
    font-size: clamp(2rem, 3vw, 2.9rem);
    line-height: 0.98;
    letter-spacing: -0.05em;
  }

  .build-feature-text {
    max-width: 560px;
    color: rgba(245, 239, 231, 0.78);
    line-height: 1.72;
  }

  .build-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1.1rem;
  }

  .build-feature .cl-date {
    color: rgba(240, 225, 204, 0.72);
  }

  .build-feature .btn-primary {
    background: #f3eadf;
    color: #131922;
    box-shadow: none;
  }

  .build-feature .btn-tertiary {
    color: #f3eadf;
  }

  .build-stack {
    display: grid;
    gap: 1rem;
  }

  .build-card {
    border-radius: 22px;
    padding: 1.2rem;
    min-height: 104px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 250, 242, 0.88)),
      linear-gradient(135deg, rgba(199, 100, 42, 0.03), rgba(31, 79, 121, 0.03));
  }

  .build-card[data-tone='amber'] {
    background: linear-gradient(180deg, #f5df67 0%, #f6edab 100%);
  }

  .build-card[data-tone='plum'] {
    background: linear-gradient(180deg, #231c38 0%, #171126 100%);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .build-card[data-tone='ink'] {
    background: linear-gradient(180deg, #111728 0%, #0d1220 100%);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .build-card[data-tone='plum'] .cl-date,
  .build-card[data-tone='ink'] .cl-date {
    color: rgba(248, 242, 234, 0.64);
  }

  .build-card[data-tone='plum'] .cl-text,
  .build-card[data-tone='ink'] .cl-text {
    color: rgba(248, 242, 234, 0.78);
  }

  .cl-date {
    color: var(--landing-steel);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .cl-text {
    margin-top: 0.55rem;
    font-size: 0.94rem;
  }

  .final-cta-inner {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) auto;
    gap: 2rem;
    align-items: center;
    padding: 2.6rem;
    border-radius: 34px;
    border: 1px solid rgba(17, 21, 29, 0.08);
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.44), transparent 24%),
      linear-gradient(135deg, #f25a27 0%, #f39a2f 100%);
    box-shadow: 0 26px 80px rgba(17, 21, 29, 0.14);
  }

  .final-cta h2 {
    margin: 1rem 0 0.75rem;
    font-size: clamp(2rem, 3.8vw, 3rem);
    line-height: 1.05;
    letter-spacing: -0.04em;
  }

  .final-cta p {
    max-width: 560px;
    color: rgba(17, 21, 29, 0.72);
    line-height: 1.75;
  }

  .final-cta h2,
  .final-cta .btn-tertiary {
    color: #11151d;
  }

  .final-cta .eyebrow {
    background: rgba(255, 255, 255, 0.42);
    border-color: rgba(17, 21, 29, 0.08);
    color: #11151d;
  }

  .final-cta .btn-primary {
    background: #11151d;
    color: #f6eee5;
    box-shadow: none;
  }

  .lp-footer {
    padding: 0 0 5.2rem;
    background: #11101d;
  }

  .footer-inner {
    padding-top: 1.4rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .footer-top {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    margin-bottom: 0.7rem;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-family: 'Sora', sans-serif;
    font-weight: 700;
    color: #f4efe6;
  }

  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
  }

  .footer-desc {
    max-width: 620px;
    margin: 0 0 0.9rem;
    color: rgba(244, 239, 230, 0.72);
  }

  .footer-copy {
    color: rgba(244, 239, 230, 0.52);
    font-size: 0.85rem;
  }

  .lp-footer .footer-links a,
  .lp-footer .footer-links button {
    color: rgba(244, 239, 230, 0.84);
  }

  .mobile-sticky {
    display: none;
  }

  @media (max-width: 1100px) {
    .hero-grid,
    .demo-layout,
    .roadmap-grid,
    .access-grid,
    .build-grid,
    .depth-grid {
      grid-template-columns: 1fr;
    }

    .hero {
      padding-top: 4rem;
    }

    .hero::after {
      right: 2rem;
      left: 2rem;
      width: auto;
      height: 56%;
      top: auto;
      bottom: 2rem;
    }

    .hero-copy {
      padding-top: 0;
      max-width: none;
    }

    .hero-visual {
      padding: 1rem 0 0;
    }

    .hero-visual::before {
      inset: 1.2rem 0.4rem 1rem 2rem;
    }

    .hero-visual::after {
      inset: 2rem 1.2rem 2rem 3rem;
    }

    .depth-hero-panel {
      grid-column: auto;
      grid-row: auto;
      grid-template-columns: 1fr;
      min-height: auto;
    }

    .feature-band,
    .feature-band.reverse {
      grid-template-columns: 1fr;
      min-height: auto;
    }

    .feature-band.reverse .band-copy,
    .feature-band.reverse .band-visual {
      order: initial;
    }

    .signal-grid {
      grid-template-columns: 1fr;
    }

    .final-cta-inner {
      grid-template-columns: 1fr;
    }

    .access-list {
      columns: 1;
    }
  }

  @media (max-width: 760px) {
    .section-inner,
    .nav-inner {
      padding-inline: 1rem;
    }

    .nav-inner {
      height: 64px;
    }

    .nav-links,
    .nav-ghost {
      display: none;
    }

    .hero {
      padding-top: 2.5rem;
    }

    .hero-copy h1 {
      font-size: clamp(2.35rem, 13vw, 3.4rem);
    }

    .band-title {
      font-size: clamp(2.2rem, 12vw, 3.4rem);
    }

    .band-visual {
      min-height: 380px;
      padding: 1rem;
    }

    .band-canvas {
      min-height: 300px;
    }

    .band-float-card {
      width: 42%;
      right: 0.4rem;
      bottom: 2.8rem;
    }

    .band-dots {
      left: 1rem;
    }

    .depth-hero-stage {
      padding: 1rem;
      min-height: 360px;
    }

    .depth-main-shot {
      min-height: 280px;
    }

    .depth-float {
      width: 42%;
    }

    .roadmap-card,
    .price-card,
    .hero-stage,
    .demo-browser-clean,
    .depth-hero-panel,
    .depth-tile,
    .build-feature,
    .build-card {
      border-radius: 20px;
    }

    .footer-top {
      flex-direction: column;
      align-items: flex-start;
    }

    .mobile-sticky {
      display: flex;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 220;
      padding: 0.75rem 1rem;
      border-top: 1px solid rgba(17, 21, 29, 0.08);
      background: rgba(244, 239, 230, 0.92);
      backdrop-filter: blur(18px);
    }

    .mobile-sticky .btn-primary {
      width: 100%;
    }

    .lp-footer {
      padding-bottom: 6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reveal,
    .scroll-progress,
    .btn-primary,
    .btn-secondary,
    .btn-tertiary,
    .ss-dot,
    .nav-links button {
      transition: none !important;
    }

    .reveal {
      opacity: 1;
      transform: none;
    }
  }
</style>
