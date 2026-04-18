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
    content="Professional-grade 2D and 3D structural analysis directly in the browser."
  />
  <meta name="twitter:image" content="/screenshots/3d-industrial.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Instrument+Serif:ital@0;1&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="landing" bind:this={landingEl}>
  <div class="scroll-progress" style="width:{scrollPct}%"></div>

  <!-- ─── NAV ─── -->
  <nav class="nav">
    <div class="nav-inner">
      <button class="nav-brand" onclick={() => scrollTo('top')} aria-label="Back to top">
        <span class="nav-logo">S</span>
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

  <!-- ─── HERO ─── -->
  <section class="hero" id="top">
    <div class="hero-glow"></div>
    <div class="section-inner hero-layout">
      <div class="hero-copy">
        <div class="hero-badge">{t('landing.metricBrowser')} &middot; {t('landing.compNoInstall')}</div>
        <h1><span class="hero-line1">{t('landing.heroTitle1')}</span> <em>{t('landing.heroTitle2')}</em></h1>
        <p class="hero-sub">{t('landing.heroSub')}</p>

        <div class="hero-ctas">
          <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
          <button class="btn-ghost" onclick={() => scrollTo('demo')}>{t('landing.interactiveDemo')}</button>
        </div>

        <div class="hero-meta">
          <span class="meta-pill">{t('landing.openSource')}</span>
          <span class="meta-pill">2D + 3D</span>
          <span class="meta-pill">14 {t('landing.metricLanguages').toLowerCase()}</span>
        </div>
      </div>

      <div class="hero-visual reveal">
        <div class="hero-browser-wrap">
          <div class="hero-browser">
            <div class="browser-bar">
              <div class="browser-dots"><span></span><span></span><span></span></div>
              <div class="browser-url">stabileo.com</div>
            </div>
            <div class="browser-viewport">
              <img
                src={hero.images[hero.idx]}
                alt="Stabileo workspace"
                loading="eager"
                fetchpriority="high"
              />
            </div>
            <div class="slide-dots">
              {#each hero.images as _, i}
                <button
                  class="dot"
                  class:active={i === hero.idx}
                  onclick={() => goToSlide(hero, i)}
                  aria-label="Hero slide {i + 1}"
                ></button>
              {/each}
            </div>
          </div>

          <div class="hero-callout hero-callout-a">
            <span class="hero-callout-label">{t('landing.tagAnalysis3D')}</span>
            <strong>My · Mz · Vy · Vz</strong>
          </div>

          <div class="hero-callout hero-callout-b">
            <span class="hero-callout-label">{t('landing.tagPro')}</span>
            <strong>CIRSOC · IFC · PDF</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="section-inner hero-signals">
      <a class="signal" href={repoUrl} target="_blank" rel="noreferrer">
        <div class="signal-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg></div>
        <div class="signal-text">
          <strong>{t('landing.openSource')}</strong>
          <span>{t('landing.openSourceDesc')}</span>
        </div>
      </a>
      <button class="signal" onclick={() => scrollTo('demo')}>
        <div class="signal-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
        <div class="signal-text">
          <strong>{t('landing.interactiveDemo')}</strong>
          <span>{t('landing.interactiveDemoDesc')}</span>
        </div>
      </button>
      <div class="signal">
        <div class="signal-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
        <div class="signal-text">
          <strong>14 {t('landing.metricLanguages')}</strong>
          <span>{t('landing.capGrid8Desc')}</span>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── FEATURES: 2D + 3D ─── -->
  <section class="features-section" id="features">
    <div class="section-inner">
      <div class="section-head reveal">
        <span class="tag">{t('landing.modeBasicBadge')}</span>
        <h2>{t('landing.todayTitle')}</h2>
        <p class="section-sub">{t('landing.todaySub')}</p>
      </div>

      <div class="feature-cards">
        <!-- 2D card -->
        <article class="fcard fcard-light reveal">
          <div class="fcard-body">
            <span class="tag tag-sm">{t('landing.tagAnalysis2D')}</span>
            <h3>{t('landing.basic2dTitle')}</h3>
            <p>{t('landing.basic2dDesc')}</p>
            <ul>
              <li>{t('landing.basic2d1')}</li>
              <li>{t('landing.basic2d2')}</li>
              <li>{t('landing.basic2d3')}</li>
              <li>{t('landing.basic2d4')}</li>
              <li>{t('landing.basic2d5')}</li>
            </ul>
            <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
          </div>
          <div class="fcard-media">
            <div class="fcard-screen">
              <img src={ss2d.images[ss2d.idx]} alt={t('landing.basic2dTitle')} loading="lazy" />
            </div>
            <div class="fcard-float">
              <img src="/screenshots/2d-section-analysis.png" alt={t('landing.basic2dTitle')} loading="lazy" />
            </div>
            <div class="slide-dots">
              {#each ss2d.images as _, i}
                <button
                  class="dot"
                  class:active={i === ss2d.idx}
                  onclick={() => goToSlide(ss2d, i)}
                  aria-label="2D slide {i + 1}"
                ></button>
              {/each}
            </div>
          </div>
        </article>

        <!-- 3D card -->
        <article class="fcard fcard-dark reveal">
          <div class="fcard-media">
            <div class="fcard-screen">
              <img src={ss3d.images[ss3d.idx]} alt={t('landing.basic3dTitle')} loading="lazy" />
            </div>
            <div class="fcard-float fcard-float-left">
              <img src="/screenshots/3d-section-analysis.png" alt={t('landing.basic3dTitle')} loading="lazy" />
            </div>
            <div class="slide-dots">
              {#each ss3d.images as _, i}
                <button
                  class="dot"
                  class:active={i === ss3d.idx}
                  onclick={() => goToSlide(ss3d, i)}
                  aria-label="3D slide {i + 1}"
                ></button>
              {/each}
            </div>
          </div>
          <div class="fcard-body">
            <span class="tag tag-sm">{t('landing.tagAnalysis3D')}</span>
            <h3>{t('landing.basic3dTitle')}</h3>
            <p>{t('landing.basic3dDesc')}</p>
            <ul>
              <li>{t('landing.basic3d1')}</li>
              <li>{t('landing.basic3d2')}</li>
              <li>{t('landing.basic3d3')}</li>
              <li>{t('landing.basic3d4')}</li>
            </ul>
            <a class="btn-ghost" href="/demo">{t('landing.tryTour')}</a>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- ─── DEMO ─── -->
  <section class="demo-section reveal" id="demo">
    <div class="section-inner">
      <div class="demo-panel">
        <div class="demo-copy">
          <span class="tag">{t('landing.interactiveDemo')}</span>
          <h2>{t('landing.demoCardTitle')}</h2>
          <p>{t('landing.demoCardDesc')}</p>
          <ul>
            <li>{t('landing.interactiveDemoDesc')}</li>
            <li>{t('landing.openSourceDesc')}</li>
            <li>{t('landing.ctaSub')}</li>
          </ul>
          <div class="demo-actions">
            <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
            <a class="btn-link" href="/demo">{t('landing.tryTour')}</a>
          </div>
        </div>
        <div class="demo-viewport">
          <div class="demo-browser">
            {#if demoLoaded}
              <iframe src="/demo?embed" title="Stabileo Demo" class="demo-iframe"></iframe>
            {:else}
              <button class="demo-placeholder" onclick={() => demoLoaded = true}>
                <img src="/screenshots/2d-moments.png" alt="Stabileo Demo" class="demo-thumb" loading="lazy" />
                <div class="demo-overlay">
                  <div class="play-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                  <span>{t('landing.tryDemo')}</span>
                </div>
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── ROADMAP ─── -->
  <section class="roadmap-section reveal" id="roadmap">
    <div class="section-inner">
      <div class="section-head">
        <span class="tag">{t('landing.comingSoon')}</span>
        <h2>{t('landing.roadmapTitle')}</h2>
        <p class="section-sub">{t('landing.roadmapSub')}</p>
      </div>

      <div class="roadmap-grid">
        <article class="rm-card rm-edu">
          <div class="rm-badge rm-badge-edu">{t('landing.modeEduBadge')}</div>
          <h3>{t('landing.modeEduTitle')}</h3>
          <p>{t('landing.modeEduSub')}</p>

          <div class="rm-block">
            <span class="rm-label">{t('landing.eduNowTitle')}</span>
            <ul>
              <li>{t('landing.eduNow1')}</li>
              <li>{t('landing.eduNow2')}</li>
              <li>{t('landing.eduNow3')}</li>
            </ul>
          </div>

          <div class="rm-block rm-muted">
            <span class="rm-label">{t('landing.eduSoonTitle')}</span>
            <ul>
              <li>{t('landing.eduSoon1')}</li>
              <li>{t('landing.eduSoon2')}</li>
              <li>{t('landing.eduSoon3')}</li>
            </ul>
          </div>
        </article>

        <article class="rm-card rm-pro">
          <div class="rm-badge rm-badge-pro">{t('landing.modeProBadge')}</div>
          <h3>{t('landing.modeProTitle')}</h3>
          <p>{t('landing.modeProSub')}</p>

          <div class="rm-media">
            <img src={ssPro.images[ssPro.idx]} alt={t('landing.modeProTitle')} loading="lazy" />
            <div class="slide-dots">
              {#each ssPro.images as _, i}
                <button
                  class="dot"
                  class:active={i === ssPro.idx}
                  onclick={() => goToSlide(ssPro, i)}
                  aria-label="Pro slide {i + 1}"
                ></button>
              {/each}
            </div>
          </div>

          <ul>
            <li>{t('landing.pro1')}</li>
            <li>{t('landing.pro2')}</li>
            <li>{t('landing.pro3')}</li>
            <li>{t('landing.pro4')}</li>
            <li>{t('landing.pro5')}</li>
          </ul>

          <p class="rm-note">{t('landing.pricingPlanned')}</p>
        </article>
      </div>
    </div>
  </section>

  <!-- ─── CAPABILITIES ─── -->
  <section class="cap-section reveal">
    <div class="section-inner">
      <div class="section-head">
        <span class="tag">{t('landing.coreDepth')}</span>
        <h2>{t('landing.capabilitiesTitle')}</h2>
        <p class="section-sub">{t('landing.coreDepthSub')}</p>
      </div>

      <div class="cap-hero">
        <div class="cap-hero-copy">
          <span class="tag tag-sm">{t('landing.depthHeroEyebrow')}</span>
          <h3>{t('landing.depthHeroTitle')}</h3>
          <p>{t('landing.depthHeroDesc')}</p>
          <ul>
            <li>{t('landing.depthHero1')}</li>
            <li>{t('landing.depthHero2')}</li>
            <li>{t('landing.depthHero3')}</li>
            <li>{t('landing.depthHero4')}</li>
          </ul>
        </div>
        <div class="cap-hero-visual">
          <img class="cap-main-img" src="/screenshots/3d-industrial.png" alt={t('landing.depthHeroTitle')} loading="lazy" />
          <img class="cap-float cap-float-a" src="/screenshots/3d-section-analysis.png" alt={t('landing.capGrid3Title')} loading="lazy" />
          <img class="cap-float cap-float-b" src="/screenshots/2d-moments.png" alt={t('landing.capGrid1Title')} loading="lazy" />
        </div>
      </div>

      <div class="cap-grid">
        {#each depthTiles as tile}
          <article class="cap-tile" data-tone={tile.tone}>
            <div class="cap-tile-img">
              <img src={tile.image} alt={t(tile.titleKey)} loading="lazy" />
            </div>
            <div class="cap-tile-body">
              <span class="cap-num">{tile.code}</span>
              <h4>{t(tile.titleKey)}</h4>
              <p>{t(tile.descKey)}</p>
            </div>
          </article>
        {/each}
      </div>
    </div>
  </section>

  <!-- ─── PRICING ─── -->
  <section class="pricing-section reveal" id="pricing">
    <div class="section-inner">
      <div class="section-head">
        <span class="tag">{t('landing.pricing')}</span>
        <h2>{t('landing.accessTitle')}</h2>
        <p class="section-sub">{t('landing.accessSub')}</p>
      </div>

      <div class="price-grid">
        <article class="price-card price-free">
          <div class="price-top">
            <div class="rm-badge rm-badge-free">{t('landing.priceFreeTitle')}</div>
            <div class="price-amount">$0</div>
          </div>
          <h3>{t('landing.accessFreeTitle')}</h3>
          <p class="price-lead">{t('landing.accessFreeDesc')}</p>
          <ul class="price-features">
            <li>{t('landing.priceFree1')}</li>
            <li>{t('landing.priceFree2')}</li>
            <li>{t('landing.priceFree3')}</li>
            <li>{t('landing.priceFree4')}</li>
            <li>{t('landing.priceFree5')}</li>
            <li>{t('landing.priceFree6')}</li>
          </ul>
          <div class="price-pills">
            <span>{t('landing.metricBrowser')}</span>
            <span>2D + 3D</span>
            <span>{t('landing.openSource')}</span>
          </div>
          <button class="btn-primary price-cta" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
        </article>

        <article class="price-card price-pro">
          <div class="price-ribbon">{t('landing.comingSoon')}</div>
          <div class="price-pro-img">
            <img src={ssPro.images[ssPro.idx]} alt={t('landing.priceProTitle')} loading="lazy" />
          </div>
          <div class="rm-badge rm-badge-pro">{t('landing.priceProTitle')}</div>
          <h3>{t('landing.accessPilotTitle')}</h3>
          <p class="price-lead">{t('landing.accessPilotDesc')}</p>
          <ul>
            <li>{t('landing.pricePro1')}</li>
            <li>{t('landing.pricePro2')}</li>
            <li>{t('landing.pricePro3')}</li>
            <li>{t('landing.pricePro4')}</li>
            <li>{t('landing.pricePro5')}</li>
            <li class="ai-row">{t('landing.pricePro6')}</li>
            <li>{t('landing.priceProExtra')}</li>
          </ul>
          <a class="btn-ghost price-cta" href={repoUrl} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
        </article>
      </div>
    </div>
  </section>

  <!-- ─── CHANGELOG ─── -->
  <section class="changelog-section reveal">
    <div class="section-inner">
      <div class="section-head">
        <span class="tag">{t('landing.changelog')}</span>
        <h2>{t('landing.changelog')}</h2>
        <p class="section-sub">{t('landing.changelogDesc')}</p>
      </div>

      <div class="cl-grid">
        <article class="cl-featured">
          <span class="cl-date">Mar 2026</span>
          <h3>{t('landing.buildFeatureTitle')}</h3>
          <p>{t('landing.cl202603')}</p>
          <div class="cl-actions">
            <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
            <a class="btn-link" href={repoUrl} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
          </div>
        </article>

        <div class="cl-stack">
          {#each releaseCards as item}
            <article class="cl-card" data-tone={item.tone}>
              <span class="cl-date">{item.date}</span>
              <p>{t(item.key)}</p>
            </article>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <!-- ─── FINAL CTA ─── -->
  <section class="cta-section reveal">
    <div class="section-inner">
      <div class="cta-block">
        <div class="cta-copy">
          <span class="tag">{t('landing.tryItNow')}</span>
          <h2>{t('landing.ctaTitle')}</h2>
          <p>{t('landing.ctaSub')}</p>
        </div>
        <div class="cta-actions">
          <button class="btn-primary lg" onclick={() => enterApp()}>{t('landing.tryApp')}</button>
          <a class="btn-link" href={repoUrl} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── FOOTER ─── -->
  <footer class="lp-footer">
    <div class="section-inner footer-inner">
      <div class="footer-row">
        <div class="footer-brand">
          <span class="nav-logo">S</span>
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
  /* ─── FOUNDATIONS ─── */
  :global(:root) {
    --lp-bg: #0d0b10;
    --lp-surface: #151219;
    --lp-surface-2: #1d1821;
    --lp-border: rgba(243, 235, 225, 0.08);
    --lp-border-2: rgba(243, 235, 225, 0.13);
    --lp-text: #f3ede5;
    --lp-text-2: rgba(243, 237, 229, 0.7);
    --lp-text-3: rgba(243, 237, 229, 0.46);
    --lp-accent: #df8a49;
    --lp-accent-soft: rgba(223, 138, 73, 0.14);
    --lp-accent-mid: rgba(223, 138, 73, 0.28);
    --lp-green: #3daa7f;
    --lp-green-soft: rgba(61, 170, 127, 0.12);
    --lp-plum: #9b7ad8;
    --lp-plum-soft: rgba(155, 122, 216, 0.12);
    --lp-radius: 16px;
    --lp-radius-lg: 24px;
    --lp-radius-xl: 32px;
  }

  .landing {
    position: fixed;
    inset: 0;
    z-index: 10000;
    overflow-y: auto;
    overflow-x: hidden;
    background:
      radial-gradient(circle at 50% -6%, rgba(223, 138, 73, 0.12), transparent 24%),
      radial-gradient(circle at 0% 28%, rgba(88, 63, 39, 0.18), transparent 28%),
      radial-gradient(circle at 100% 38%, rgba(46, 57, 84, 0.14), transparent 24%),
      linear-gradient(180deg, #0f0c12 0%, #0c0b10 38%, #09090c 100%);
    color: var(--lp-text);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .section-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
  }

  /* ─── SCROLL PROGRESS ─── */
  .scroll-progress {
    position: fixed;
    top: 0;
    left: 0;
    height: 2px;
    z-index: 300;
    background: var(--lp-accent);
    transition: width 0.12s linear;
  }

  /* ─── REVEAL ─── */
  .reveal {
    opacity: 0;
    transform: translateY(32px);
    transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .reveal:global(.visible) {
    opacity: 1;
    transform: translateY(0);
  }

  /* ─── TYPOGRAPHY ─── */
  h1, h2, h3, h4, .nav-name, .price-amount {
    font-family: 'Instrument Serif', Georgia, serif;
    font-weight: 400;
    letter-spacing: -0.02em;
  }

  h2 {
    font-size: clamp(2.4rem, 5vw, 3.8rem);
    line-height: 1.05;
    letter-spacing: -0.03em;
  }

  h3 {
    font-size: clamp(1.5rem, 3vw, 2.2rem);
    line-height: 1.1;
  }

  /* ─── TAGS ─── */
  .tag {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--lp-border-2);
    background: var(--lp-surface);
    color: var(--lp-text-2);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .tag-sm {
    padding: 0.28rem 0.6rem;
    font-size: 0.68rem;
  }

  /* ─── BUTTONS ─── */
  .btn-primary, .btn-ghost, .btn-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    font-size: 0.88rem;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary {
    padding: 0.75rem 1.5rem;
    border: none;
    background: var(--lp-accent);
    color: #fff;
    box-shadow: 0 0 0 0 rgba(232, 133, 61, 0), 0 4px 16px rgba(232, 133, 61, 0.2);
  }

  .btn-primary:hover {
    box-shadow: 0 0 0 4px rgba(232, 133, 61, 0.15), 0 8px 24px rgba(232, 133, 61, 0.3);
    transform: translateY(-1px);
  }

  .btn-primary.sm {
    padding: 0.55rem 1rem;
    font-size: 0.82rem;
  }

  .btn-primary.lg {
    padding: 0.9rem 2rem;
    font-size: 0.95rem;
  }

  .btn-ghost {
    padding: 0.75rem 1.5rem;
    background: transparent;
    color: var(--lp-text);
    border: 1px solid var(--lp-border-2);
  }

  .btn-ghost:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .btn-link {
    padding: 0;
    background: none;
    border: none;
    color: var(--lp-text-2);
    font-weight: 600;
  }

  .btn-link:hover {
    color: var(--lp-text);
  }

  /* ─── SLIDE DOTS ─── */
  .slide-dots {
    display: flex;
    gap: 6px;
    justify-content: center;
    padding: 0.75rem 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: none;
    background: rgba(255, 255, 255, 0.2);
    cursor: pointer;
    transition: all 0.25s ease;
    padding: 0;
  }

  .dot.active {
    width: 24px;
    background: var(--lp-accent);
  }

  /* ─── NAV ─── */
  .nav {
    position: sticky;
    top: 0;
    z-index: 200;
    background: rgba(14, 11, 16, 0.82);
    border-bottom: 1px solid var(--lp-border);
    backdrop-filter: blur(20px) saturate(1.2);
  }

  .nav-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
    height: 64px;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .nav-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .nav-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--lp-accent);
    color: #fff;
    font-family: 'Instrument Serif', serif;
    font-size: 1rem;
    font-weight: 400;
  }

  .nav-name {
    color: var(--lp-text);
    font-size: 1.05rem;
  }

  .nav-links {
    margin-left: auto;
    display: flex;
    gap: 0.15rem;
  }

  .nav-links button {
    background: none;
    border: none;
    color: var(--lp-text-2);
    cursor: pointer;
    font: inherit;
    padding: 0.4rem 0.7rem;
    border-radius: 8px;
    font-size: 0.85rem;
    transition: color 0.15s, background 0.15s;
  }

  .nav-links button:hover {
    color: var(--lp-text);
    background: rgba(255, 255, 255, 0.04);
  }

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .nav-ghost {
    color: var(--lp-text-2);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 500;
    transition: color 0.15s;
  }

  .nav-ghost:hover {
    color: var(--lp-text);
  }

  .nav-lang {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    color: var(--lp-text-2);
    border-radius: 8px;
    padding: 0.4rem 0.7rem;
    font: inherit;
    font-size: 0.82rem;
    min-width: 118px;
    cursor: pointer;
  }

  /* ─── HERO ─── */
  .hero {
    position: relative;
    padding: 5rem 0 1.7rem;
    overflow: hidden;
  }

  .hero-glow {
    position: absolute;
    width: 720px;
    height: 720px;
    top: -250px;
    left: 50%;
    transform: translateX(-50%);
    background: radial-gradient(circle, rgba(223, 138, 73, 0.16) 0%, transparent 68%);
    pointer-events: none;
  }

  .hero-layout {
    display: grid;
    grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
    gap: 3.4rem;
    align-items: center;
  }

  .hero-copy {
    position: relative;
    z-index: 1;
    max-width: 520px;
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.38rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--lp-border-2);
    background: var(--lp-surface);
    color: var(--lp-text-2);
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 1.5rem;
  }

  .hero-copy h1 {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: clamp(3.35rem, 6.2vw, 5.35rem);
    font-weight: 700;
    line-height: 0.92;
    letter-spacing: -0.065em;
    margin: 0 0 1.2rem;
  }

  .hero-line1 {
    display: block;
    max-width: 7ch;
  }

  .hero-copy h1 em {
    display: block;
    margin-top: 0.1rem;
    font-family: 'Instrument Serif', Georgia, serif;
    font-weight: 400;
    font-style: italic;
    color: var(--lp-accent);
    letter-spacing: -0.03em;
  }

  .hero-sub {
    max-width: 470px;
    font-size: 1.04rem;
    line-height: 1.72;
    color: rgba(240, 236, 228, 0.78);
    margin-bottom: 1.55rem;
  }

  .hero-ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1.15rem;
  }

  .hero-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .meta-pill {
    padding: 0.36rem 0.72rem;
    border-radius: 999px;
    border: 1px solid var(--lp-border-2);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(240, 236, 228, 0.58);
    font-size: 0.75rem;
    font-weight: 600;
  }

  /* Hero browser mockup */
  .hero-visual {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .hero-browser-wrap {
    position: relative;
    padding: 0.2rem 0 0;
  }

  .hero-browser-wrap::before {
    content: '';
    position: absolute;
    inset: 2rem 1rem -1rem 2.2rem;
    border-radius: 36px;
    background: linear-gradient(135deg, rgba(223, 138, 73, 0.22), rgba(98, 78, 146, 0.06));
    filter: blur(22px);
    opacity: 0.85;
    pointer-events: none;
  }

  .hero-browser {
    position: relative;
    z-index: 1;
    border-radius: var(--lp-radius-lg);
    overflow: hidden;
    border: 1px solid var(--lp-border-2);
    background: var(--lp-surface);
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03);
  }

  .browser-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 1rem;
    background: var(--lp-surface-2);
    border-bottom: 1px solid var(--lp-border);
  }

  .browser-dots {
    display: flex;
    gap: 5px;
  }

  .browser-dots span {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .browser-url {
    flex: 1;
    text-align: center;
    color: var(--lp-text-3);
    font-size: 0.78rem;
    font-weight: 500;
  }

  .browser-viewport {
    aspect-ratio: 16 / 10;
    overflow: hidden;
  }

  .browser-viewport img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    object-position: 55% top;
  }

  .hero-callout {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    min-width: 168px;
    padding: 0.72rem 0.82rem 0.8rem;
    border-radius: 16px;
    border: 1px solid rgba(243, 235, 225, 0.12);
    background: linear-gradient(180deg, rgba(19, 16, 22, 0.95), rgba(14, 12, 18, 0.95));
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.34);
    backdrop-filter: blur(12px);
  }

  .hero-callout-label {
    color: var(--lp-text-3);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .hero-callout strong {
    color: var(--lp-text);
    font-size: 0.86rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .hero-callout-a {
    right: -0.85rem;
    top: 1.7rem;
    border-color: rgba(223, 138, 73, 0.22);
  }

  .hero-callout-b {
    left: -1rem;
    bottom: 1.7rem;
    border-color: rgba(155, 122, 216, 0.22);
  }

  /* Hero signals bar */
  .hero-signals {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.95rem;
    margin-top: 1.05rem;
    padding-bottom: 0.2rem;
  }

  .signal {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
    padding: 0.95rem 1rem;
    border-radius: var(--lp-radius);
    border: 1px solid var(--lp-border);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.02));
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.18);
    color: inherit;
    text-decoration: none;
    text-align: left;
    cursor: default;
    transition: border-color 0.2s, background 0.2s, transform 0.2s;
  }

  a.signal, button.signal {
    cursor: pointer;
  }

  a.signal:hover, button.signal:hover {
    border-color: var(--lp-border-2);
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-1px);
  }

  button.signal {
    font: inherit;
  }

  .signal-icon {
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--lp-accent-soft);
    color: var(--lp-accent);
  }

  .signal-text {
    min-width: 0;
  }

  .signal-text strong {
    display: block;
    font-size: 0.86rem;
    font-weight: 700;
    margin-bottom: 0.2rem;
  }

  .signal-text span {
    display: block;
    font-size: 0.79rem;
    color: rgba(240, 236, 228, 0.68);
    line-height: 1.48;
  }

  /* ─── SECTION HEADS ─── */
  .section-head {
    text-align: center;
    margin-bottom: 1.6rem;
  }

  .section-head h2 {
    margin: 1rem 0 0.8rem;
  }

  .section-sub {
    max-width: 640px;
    margin: 0 auto;
    color: var(--lp-text-2);
    font-size: 0.98rem;
    line-height: 1.68;
  }

  /* ─── FEATURES SECTION ─── */
  .features-section {
    padding: 2.5rem 0 3.9rem;
  }

  .feature-cards {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .fcard {
    display: grid;
    grid-template-columns: minmax(0, 0.45fr) minmax(0, 0.55fr);
    border-radius: var(--lp-radius-xl);
    overflow: hidden;
    min-height: 424px;
    border: 1px solid var(--lp-border);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
  }

  .fcard-light {
    background:
      radial-gradient(circle at top left, rgba(223, 138, 73, 0.16), transparent 24%),
      linear-gradient(135deg, #181412 0%, #131014 100%);
  }

  .fcard-dark {
    background:
      radial-gradient(circle at top right, rgba(91, 109, 164, 0.14), transparent 24%),
      linear-gradient(135deg, #10131a 0%, #0c0f15 100%);
  }

  .fcard-body {
    padding: clamp(1.35rem, 2.35vw, 2rem);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .fcard-body h3 {
    margin: 0.55rem 0 0.55rem;
    font-size: clamp(1.8rem, 2.45vw, 2.5rem);
    line-height: 1;
  }

  .fcard-body > p {
    color: var(--lp-text-2);
    max-width: 440px;
    font-size: 0.9rem;
    line-height: 1.58;
    margin-bottom: 0.8rem;
  }

  .fcard-body ul {
    list-style: none;
    padding: 0;
    margin: 0 0 0.85rem;
  }

  .fcard-body li {
    position: relative;
    padding-left: 1.1rem;
    margin-bottom: 0.32rem;
    font-size: 0.83rem;
    color: var(--lp-text-2);
    line-height: 1.46;
  }

  .fcard-body li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--lp-accent);
  }

  .fcard-media {
    position: relative;
    padding: 1rem 1rem 0.82rem;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .fcard-screen {
    position: relative;
    z-index: 1;
    width: 100%;
    border-radius: var(--lp-radius);
    overflow: hidden;
    border: 1px solid var(--lp-border-2);
    box-shadow: 0 18px 52px rgba(0, 0, 0, 0.34);
  }

  .fcard-screen img {
    width: 100%;
    display: block;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    object-position: center top;
  }

  .fcard-float {
    position: absolute;
    z-index: 2;
    right: 0.8rem;
    bottom: 1.55rem;
    width: min(27%, 156px);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--lp-border-2);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  }

  .fcard-float-left {
    right: auto;
    left: 0.8rem;
  }

  .fcard-float img {
    width: 100%;
    display: block;
    aspect-ratio: 1.15;
    object-fit: cover;
    object-position: center top;
  }

  .fcard-media .slide-dots {
    position: absolute;
    bottom: 0.1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
  }

  .fcard-body .btn-primary,
  .fcard-body .btn-ghost {
    align-self: flex-start;
    min-width: 156px;
    padding: 0.7rem 1rem;
    box-shadow: none;
  }

  .fcard-body .btn-ghost {
    background: rgba(255, 255, 255, 0.03);
  }

  .fcard-light .fcard-body .tag-sm {
    background: var(--lp-accent-soft);
    border-color: rgba(232, 133, 61, 0.2);
    color: var(--lp-accent);
  }

  /* ─── DEMO SECTION ─── */
  .demo-section {
    padding: 3rem 0 5rem;
  }

  .demo-panel {
    display: grid;
    grid-template-columns: minmax(0, 0.42fr) minmax(0, 0.58fr);
    gap: 2rem;
    border-radius: var(--lp-radius-xl);
    border: 1px solid var(--lp-border);
    background: var(--lp-surface);
    padding: 1.5rem;
    align-items: center;
  }

  .demo-copy {
    padding: 0.5rem;
  }

  .demo-copy h2 {
    margin: 0.8rem 0 0.7rem;
    font-size: clamp(1.8rem, 3vw, 2.6rem);
  }

  .demo-copy > p {
    color: var(--lp-text-2);
    font-size: 0.95rem;
    line-height: 1.7;
    margin-bottom: 1rem;
  }

  .demo-copy ul {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
  }

  .demo-copy li {
    position: relative;
    padding-left: 1.1rem;
    margin-bottom: 0.4rem;
    font-size: 0.88rem;
    color: var(--lp-text-2);
    line-height: 1.55;
  }

  .demo-copy li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--lp-accent);
  }

  .demo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
  }

  .demo-browser {
    border-radius: var(--lp-radius-lg);
    overflow: hidden;
    background: #000;
    border: 1px solid var(--lp-border);
    aspect-ratio: 16 / 10;
  }

  .demo-iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  .demo-placeholder {
    position: relative;
    width: 100%;
    height: 100%;
    border: none;
    padding: 0;
    background: none;
    cursor: pointer;
    display: block;
  }

  .demo-thumb {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    filter: brightness(0.7);
  }

  .demo-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: #fff;
  }

  .play-btn {
    width: 64px;
    height: 64px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .demo-placeholder:hover .play-btn {
    background: rgba(255, 255, 255, 0.2);
  }

  .demo-overlay span {
    font-size: 0.88rem;
    font-weight: 600;
    opacity: 0.9;
  }

  /* ─── ROADMAP ─── */
  .roadmap-section {
    padding: 5rem 0;
  }

  .roadmap-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.25rem;
  }

  .rm-card {
    border-radius: var(--lp-radius-lg);
    padding: 1.5rem;
    border: 1px solid var(--lp-border);
  }

  .rm-edu {
    background: linear-gradient(180deg, #111712 0%, var(--lp-surface) 100%);
    border-top: 2px solid var(--lp-green);
  }

  .rm-pro {
    background: linear-gradient(180deg, #14111e 0%, var(--lp-surface) 100%);
    border-top: 2px solid var(--lp-plum);
  }

  .rm-badge {
    display: inline-flex;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .rm-badge-edu {
    background: var(--lp-green-soft);
    color: var(--lp-green);
  }

  .rm-badge-pro {
    background: var(--lp-plum-soft);
    color: var(--lp-plum);
  }

  .rm-badge-free {
    background: var(--lp-accent-soft);
    color: var(--lp-accent);
  }

  .rm-card h3 {
    margin: 0.8rem 0 0.5rem;
  }

  .rm-card > p {
    color: var(--lp-text-2);
    font-size: 0.92rem;
    line-height: 1.65;
  }

  .rm-card ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .rm-card li {
    position: relative;
    padding-left: 1.1rem;
    margin-bottom: 0.4rem;
    font-size: 0.88rem;
    color: var(--lp-text-2);
    line-height: 1.55;
  }

  .rm-card li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--lp-accent);
  }

  .rm-block {
    margin-top: 1.2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--lp-border);
  }

  .rm-muted {
    opacity: 0.7;
  }

  .rm-label {
    display: inline-flex;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--lp-border);
    background: var(--lp-surface-2);
    color: var(--lp-text-2);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 0.7rem;
  }

  .rm-media {
    margin: 1.2rem 0;
    border-radius: var(--lp-radius);
    overflow: hidden;
    border: 1px solid var(--lp-border);
    background: var(--lp-surface-2);
  }

  .rm-media img {
    width: 100%;
    display: block;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    object-position: center top;
  }

  .rm-note {
    margin-top: 0.8rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--lp-plum);
  }

  /* ─── CAPABILITIES ─── */
  .cap-section {
    padding: 5rem 0;
    background: var(--lp-surface);
  }

  .cap-hero {
    display: grid;
    grid-template-columns: minmax(0, 0.45fr) minmax(0, 0.55fr);
    gap: 2rem;
    border-radius: var(--lp-radius-xl);
    border: 1px solid var(--lp-border);
    background: linear-gradient(135deg, #12101e 0%, #0c0a14 100%);
    overflow: hidden;
    margin-bottom: 1.5rem;
    min-height: 480px;
  }

  .cap-hero-copy {
    padding: clamp(1.8rem, 3vw, 2.5rem);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .cap-hero-copy h3 {
    margin: 0.8rem 0 0.7rem;
    font-size: clamp(1.8rem, 3vw, 2.6rem);
  }

  .cap-hero-copy > p {
    color: var(--lp-text-2);
    font-size: 0.95rem;
    line-height: 1.7;
    margin-bottom: 1rem;
  }

  .cap-hero-copy ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .cap-hero-copy li {
    position: relative;
    padding-left: 1.1rem;
    margin-bottom: 0.45rem;
    font-size: 0.88rem;
    color: var(--lp-text-2);
    line-height: 1.55;
  }

  .cap-hero-copy li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--lp-accent);
  }

  .cap-hero-visual {
    position: relative;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cap-main-img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    object-position: center top;
    border-radius: var(--lp-radius);
    border: 1px solid var(--lp-border);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
  }

  .cap-float {
    position: absolute;
    z-index: 2;
    width: min(35%, 180px);
    border-radius: 12px;
    border: 1px solid var(--lp-border-2);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    object-fit: cover;
    object-position: center top;
    aspect-ratio: 1.15;
  }

  .cap-float-a {
    right: 0.6rem;
    top: 1rem;
  }

  .cap-float-b {
    left: 0.5rem;
    bottom: 1rem;
  }

  .cap-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
  }

  .cap-tile {
    border-radius: var(--lp-radius);
    overflow: hidden;
    border: 1px solid var(--lp-border);
    background: var(--lp-bg);
    transition: border-color 0.2s;
  }

  .cap-tile:hover {
    border-color: var(--lp-border-2);
  }

  .cap-tile-img {
    aspect-ratio: 16 / 10;
    overflow: hidden;
  }

  .cap-tile-img img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    object-position: center top;
  }

  .cap-tile-body {
    padding: 0.9rem 1rem;
  }

  .cap-num {
    display: inline-flex;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    background: var(--lp-accent-soft);
    color: var(--lp-accent);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    margin-bottom: 0.5rem;
  }

  .cap-tile h4 {
    font-size: 0.95rem;
    margin: 0 0 0.35rem;
    font-family: 'DM Sans', sans-serif;
    font-weight: 600;
  }

  .cap-tile p {
    color: var(--lp-text-2);
    font-size: 0.82rem;
    line-height: 1.55;
  }

  /* ─── PRICING ─── */
  .pricing-section {
    padding: 5rem 0;
  }

  .price-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.25rem;
  }

  .price-card {
    border-radius: var(--lp-radius-lg);
    padding: 1.5rem;
    border: 1px solid var(--lp-border);
    display: flex;
    flex-direction: column;
  }

  .price-free {
    background: linear-gradient(180deg, #14120a 0%, var(--lp-surface) 100%);
    border-top: 2px solid var(--lp-accent);
  }

  .price-pro {
    position: relative;
    background: linear-gradient(180deg, #14111e 0%, var(--lp-surface) 100%);
    border-top: 2px solid var(--lp-plum);
  }

  .price-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .price-amount {
    font-size: 3rem;
    letter-spacing: -0.04em;
    color: var(--lp-text);
  }

  .price-card h3 {
    margin: 0.8rem 0 0.5rem;
  }

  .price-lead {
    color: var(--lp-text-2);
    font-size: 0.92rem;
    line-height: 1.7;
    margin-bottom: 1rem;
  }

  .price-features {
    columns: 2;
    column-gap: 1rem;
    margin-bottom: 1rem;
  }

  .price-card ul {
    list-style: none;
    padding: 0;
    margin: 0 0 1.2rem;
  }

  .price-card li {
    position: relative;
    padding-left: 1.1rem;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: var(--lp-text-2);
    line-height: 1.55;
    break-inside: avoid;
  }

  .price-card li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--lp-accent);
  }

  .price-card li.ai-row {
    color: var(--lp-text);
    font-weight: 600;
  }

  .price-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.2rem;
  }

  .price-pills span {
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--lp-border);
    color: var(--lp-text-3);
    font-size: 0.74rem;
    font-weight: 500;
  }

  .price-ribbon {
    position: absolute;
    top: 1rem;
    right: 1rem;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: var(--lp-plum-soft);
    color: var(--lp-plum);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .price-pro-img {
    margin-bottom: 1rem;
    border-radius: var(--lp-radius);
    overflow: hidden;
    border: 1px solid var(--lp-border);
  }

  .price-pro-img img {
    width: 100%;
    display: block;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    object-position: center top;
  }

  .price-cta {
    margin-top: auto;
  }

  /* ─── CHANGELOG ─── */
  .changelog-section {
    padding: 5rem 0;
    background: var(--lp-surface);
  }

  .cl-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    gap: 1rem;
  }

  .cl-featured {
    border-radius: var(--lp-radius-lg);
    padding: 1.8rem;
    border: 1px solid var(--lp-border);
    background: linear-gradient(135deg, #12101e 0%, var(--lp-surface-2) 100%);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 320px;
  }

  .cl-featured h3 {
    margin: 0.7rem 0 0.6rem;
  }

  .cl-featured > p {
    color: var(--lp-text-2);
    line-height: 1.7;
  }

  .cl-date {
    color: var(--lp-text-3);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .cl-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    margin-top: 1rem;
  }

  .cl-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .cl-card {
    border-radius: var(--lp-radius);
    padding: 1.1rem 1.2rem;
    border: 1px solid var(--lp-border);
    background: var(--lp-bg);
  }

  .cl-card p {
    margin-top: 0.4rem;
    color: var(--lp-text-2);
    font-size: 0.88rem;
    line-height: 1.6;
  }

  .cl-card[data-tone='amber'] {
    border-left: 3px solid var(--lp-accent);
  }

  .cl-card[data-tone='plum'] {
    border-left: 3px solid var(--lp-plum);
  }

  .cl-card[data-tone='ink'] {
    border-left: 3px solid var(--lp-text-3);
  }

  /* ─── FINAL CTA ─── */
  .cta-section {
    padding: 3rem 0 5rem;
  }

  .cta-block {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    padding: 2.5rem;
    border-radius: var(--lp-radius-xl);
    border: 1px solid rgba(232, 133, 61, 0.2);
    background: linear-gradient(135deg, rgba(232, 133, 61, 0.06) 0%, rgba(232, 133, 61, 0.02) 100%);
  }

  .cta-copy h2 {
    margin: 0.8rem 0 0.5rem;
  }

  .cta-copy p {
    color: var(--lp-text-2);
    max-width: 520px;
    line-height: 1.7;
  }

  .cta-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    flex-shrink: 0;
  }

  /* ─── FOOTER ─── */
  .lp-footer {
    padding: 0 0 5rem;
    background: var(--lp-bg);
  }

  .footer-inner {
    padding-top: 1.5rem;
    border-top: 1px solid var(--lp-border);
  }

  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-family: 'Instrument Serif', serif;
    font-size: 1.05rem;
    color: var(--lp-text);
  }

  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1.2rem;
    align-items: center;
  }

  .footer-links a, .footer-links button {
    color: var(--lp-text-2);
    text-decoration: none;
    font-size: 0.88rem;
    font-weight: 500;
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    transition: color 0.15s;
  }

  .footer-links a:hover, .footer-links button:hover {
    color: var(--lp-text);
  }

  .footer-desc {
    color: var(--lp-text-3);
    font-size: 0.88rem;
    line-height: 1.6;
    margin-bottom: 0.5rem;
  }

  .footer-copy {
    color: var(--lp-text-3);
    font-size: 0.8rem;
  }

  /* ─── MOBILE STICKY ─── */
  .mobile-sticky {
    display: none;
  }

  /* ─── RESPONSIVE ─── */
  @media (max-width: 1100px) {
    .hero-layout,
    .demo-panel,
    .roadmap-grid,
    .price-grid,
    .cl-grid,
    .cap-hero {
      grid-template-columns: 1fr;
    }

    .hero {
      padding-top: 4rem;
    }

    .hero-signals {
      grid-template-columns: 1fr;
    }

    .hero-callout-a {
      right: 0.6rem;
      top: 1rem;
    }

    .hero-callout-b {
      left: 0.6rem;
      bottom: 1rem;
    }

    .cap-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .fcard, .fcard-dark {
      grid-template-columns: 1fr;
    }

    .cta-block {
      flex-direction: column;
      text-align: center;
      align-items: center;
    }

    .price-features {
      columns: 1;
    }
  }

  @media (max-width: 760px) {
    .section-inner, .nav-inner {
      padding-inline: 1rem;
    }

    .nav-inner {
      height: 56px;
    }

    .nav-links, .nav-ghost {
      display: none;
    }

    .hero {
      padding-top: 2.5rem;
    }

    .hero-copy h1 {
      font-size: clamp(2.6rem, 11vw, 3.6rem);
    }

    .hero-callout {
      display: none;
    }

    .hero-signals {
      gap: 0.7rem;
    }

    .cap-grid {
      grid-template-columns: 1fr;
    }

    .fcard-media {
      min-height: 300px;
    }

    .footer-row {
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
      border-top: 1px solid var(--lp-border);
      background: rgba(10, 10, 11, 0.92);
      backdrop-filter: blur(16px);
    }

    .mobile-sticky .btn-primary {
      width: 100%;
    }

    .lp-footer {
      padding-bottom: 6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reveal, .scroll-progress, .btn-primary, .btn-ghost, .dot, .nav-links button {
      transition: none !important;
    }

    .reveal {
      opacity: 1;
      transform: none;
    }
  }
</style>
