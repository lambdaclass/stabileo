<script lang="ts">
  import { onMount } from 'svelte';
  import { t, i18n, setLocale } from '../lib/i18n';

  /** Called when the user clicks "Try Demo" — dispatches event for parent to handle */
  function enterApp() {
    window.dispatchEvent(new CustomEvent('stabileo-enter-app'));
  }

  let landingEl: HTMLDivElement;
  let demoLoaded = $state(false);

  // ─── Slideshow engine ───
  // Each slideshow has: images[], current index, interval handle, paused flag
  type Slideshow = { images: string[]; idx: number; paused: boolean; iv: ReturnType<typeof setInterval> | null };

  function createSlideshow(images: string[]): Slideshow {
    return { images, idx: 0, paused: false, iv: null };
  }

  function startSlideshow(ss: Slideshow, ms = 4000) {
    if (ss.iv) clearInterval(ss.iv);
    ss.iv = setInterval(() => {
      if (!ss.paused) ss.idx = (ss.idx + 1) % ss.images.length;
    }, ms);
  }

  function goToSlide(ss: Slideshow, i: number) {
    ss.idx = i;
    ss.paused = true;
    // Resume after 10s of inactivity
    if (ss.iv) clearInterval(ss.iv);
    ss.iv = setInterval(() => {
      if (ss.paused) { ss.paused = false; return; }
      ss.idx = (ss.idx + 1) % ss.images.length;
    }, 4000);
  }

  // Hero slideshow — best images from all sections
  let hero = $state(createSlideshow([
    '/screenshots/2d-loads.png',
    '/screenshots/2d-moments.png',
    '/screenshots/3d-industrial.png',
    '/screenshots/pro-verification.png',
  ]));

  // Feature mini-slideshows
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
  // Education: portrait images, displayed side by side (no slideshow)
  let ssPro = $state(createSlideshow([
    '/screenshots/pro-features.png',
    '/screenshots/pro-verification.png',
  ]));

  // Scroll progress
  let scrollPct = $state(0);

  // Animated counters
  let countTests = $state(0);
  let countLanguages = $state(0);
  let countersStarted = false;

  function animateCounters() {
    if (countersStarted) return;
    countersStarted = true;
    const dur = 1400, steps = 40, dt = dur / steps;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      const ease = 1 - Math.pow(1 - step / steps, 3);
      countTests = Math.round(1117 * ease);
      countLanguages = Math.round(14 * ease);
      if (step >= steps) clearInterval(iv);
    }, dt);
  }

  onMount(() => {
    startSlideshow(hero, 4000);
    startSlideshow(ss2d, 5000);
    startSlideshow(ss3d, 5000);
    startSlideshow(ssPro, 5000);

    // Scroll progress
    const onScroll = () => {
      const el = landingEl;
      if (!el) return;
      scrollPct = el.scrollTop / (el.scrollHeight - el.clientHeight) * 100;
    };
    landingEl?.addEventListener('scroll', onScroll, { passive: true });

    // Reveal observer
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          if (entry.target.classList.contains('metrics')) animateCounters();
        }
      }
    }, { threshold: 0.1, root: landingEl });
    for (const el of landingEl.querySelectorAll('.reveal')) observer.observe(el);

    // Listen for demo iframe tour completion → enter full app
    const onMessage = (e: MessageEvent) => {
      if (e.data === 'stabileo-enter-app') enterApp();
    };
    window.addEventListener('message', onMessage);

    return () => {
      observer.disconnect();
      if (hero.iv) clearInterval(hero.iv);
      if (ss2d.iv) clearInterval(ss2d.iv);
      if (ss3d.iv) clearInterval(ss3d.iv);
      if (ssPro.iv) clearInterval(ssPro.iv);
      landingEl?.removeEventListener('scroll', onScroll);
      window.removeEventListener('message', onMessage);
    };
  });

  function scrollTo(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }
</script>

<!-- Google Fonts -->
<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
</svelte:head>

<div class="landing" bind:this={landingEl}>
  <!-- Scroll progress bar -->
  <div class="scroll-progress" style="width:{scrollPct}%"></div>

  <!-- ═══ NAVBAR ═══ -->
  <nav class="nav">
    <div class="nav-inner">
      <div class="nav-brand">
        <span class="nav-logo">△</span>
        <span class="nav-name">Stabileo</span>
      </div>
      <div class="nav-links">
        <button onclick={() => scrollTo('features')}>{t('landing.features')}</button>
        <button onclick={() => scrollTo('demo')}>{t('landing.demo')}</button>
        <button onclick={() => scrollTo('pricing')}>{t('landing.pricing')}</button>
      </div>
      <div class="nav-actions">
        <select class="nav-lang" value={i18n.locale} onchange={(e) => setLocale((e.currentTarget as HTMLSelectElement).value)}>
          <option value="en">EN</option><option value="es">ES</option><option value="pt">PT</option>
          <option value="de">DE</option><option value="fr">FR</option><option value="it">IT</option>
          <option value="tr">TR</option><option value="hi">HI</option><option value="zh">ZH</option>
          <option value="ja">JA</option><option value="ko">KO</option><option value="ru">RU</option>
          <option value="ar">AR</option><option value="id">ID</option>
        </select>
        <button class="btn-primary sm" onclick={() => enterApp()}>{t('landing.tryDemo')}</button>
      </div>
    </div>
  </nav>

  <!-- ═══ HERO ═══ -->
  <section class="hero">
    <div class="hero-bg"></div>
    <div class="noise"></div>
    <div class="hero-content">
      <div class="hero-badge">{t('landing.metricBrowser')} — {t('landing.metricFree')}</div>
      <h1>{t('landing.heroTitle')}</h1>
      <p class="hero-sub">{t('landing.heroSub')}</p>
      <div class="hero-ctas">
        <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryDemo')}</button>
        <button class="btn-secondary" onclick={() => scrollTo('features')}>{t('landing.features')} ↓</button>
      </div>
      <p class="hero-status">{t('landing.statusNote')}</p>
    </div>

    <div class="hero-visual">
      <div class="img-frame hero-frame">
        <div class="img-content slideshow">
          {#each hero.images as src, i}
            <img {src} alt="Stabileo" class="slide" class:active={i === hero.idx} />
          {/each}
        </div>
        <div class="slideshow-dots">
          {#each hero.images as _, i}
            <button
              class="ss-dot"
              class:active={i === hero.idx}
              onclick={() => goToSlide(hero, i)}
              aria-label="Slide {i + 1}"
            ></button>
          {/each}
        </div>
      </div>
      <div class="hero-glow"></div>
    </div>
  </section>

  <!-- ═══ METRICS ═══ -->
  <section class="metrics reveal">
    <div class="metric"><span class="metric-num">{countTests}+</span><span class="metric-label">{t('landing.metricTests')}</span></div>
    <div class="metric"><span class="metric-num">2D + 3D</span><span class="metric-label">{t('landing.metricAnalysis')}</span></div>
    <div class="metric"><span class="metric-num">{countLanguages}</span><span class="metric-label">{t('landing.metricLanguages')}</span></div>
    <div class="metric"><span class="metric-num">$0</span><span class="metric-label">{t('landing.metricFree')}</span></div>
  </section>

  <!-- ═══ FEATURES ═══ -->
  <section class="features" id="features">
    <div class="section-inner">

      <!-- ── MODO BÁSICO ── -->
      <div class="mode-header reveal">
        <div class="mode-badge mode-badge-basic">{t('landing.modeBasicBadge')}</div>
        <h2>{t('landing.modeBasicTitle')}</h2>
        <p class="section-sub">{t('landing.modeBasicSub')}</p>
      </div>

      <!-- 2D Analysis -->
      <div class="feature-row reveal">
        <div class="feature-img-wrap">
          <div class="img-frame compact">
            <div class="img-content slideshow">
              {#each ss2d.images as src, i}
                <img {src} alt={t('landing.basic2dTitle')} class="slide" class:active={i === ss2d.idx} loading="lazy" />
              {/each}
            </div>
            <div class="slideshow-dots">
              {#each ss2d.images as _, i}
                <button class="ss-dot" class:active={i === ss2d.idx} onclick={() => goToSlide(ss2d, i)} aria-label="Slide {i + 1}"></button>
              {/each}
            </div>
          </div>
        </div>
        <div class="feature-text">
          <div class="feature-tag">{t('landing.tagAnalysis2D')}</div>
          <h3>{t('landing.basic2dTitle')}</h3>
          <p>{t('landing.basic2dDesc')}</p>
          <ul class="feature-list">
            <li>{t('landing.basic2d1')}</li>
            <li>{t('landing.basic2d2')}</li>
            <li>{t('landing.basic2d3')}</li>
            <li>{t('landing.basic2d4')}</li>
            <li>{t('landing.basic2d5')}</li>
          </ul>
        </div>
      </div>

      <!-- 3D Analysis -->
      <div class="feature-row reverse reveal">
        <div class="feature-img-wrap">
          <div class="img-frame compact">
            <div class="img-content slideshow">
              {#each ss3d.images as src, i}
                <img {src} alt={t('landing.basic3dTitle')} class="slide" class:active={i === ss3d.idx} loading="lazy" />
              {/each}
            </div>
            <div class="slideshow-dots">
              {#each ss3d.images as _, i}
                <button class="ss-dot" class:active={i === ss3d.idx} onclick={() => goToSlide(ss3d, i)} aria-label="Slide {i + 1}"></button>
              {/each}
            </div>
          </div>
        </div>
        <div class="feature-text">
          <div class="feature-tag teal">{t('landing.tagAnalysis3D')}</div>
          <h3>{t('landing.basic3dTitle')}</h3>
          <p>{t('landing.basic3dDesc')}</p>
          <ul class="feature-list">
            <li>{t('landing.basic3d1')}</li>
            <li>{t('landing.basic3d2')}</li>
            <li>{t('landing.basic3d3')}</li>
            <li>{t('landing.basic3d4')}</li>
          </ul>
        </div>
      </div>

      <!-- ── MODO EDUCATIVO ── -->
      <div class="mode-header reveal">
        <div class="mode-badge mode-badge-edu">{t('landing.modeEduBadge')}</div>
        <h2>{t('landing.modeEduTitle')}</h2>
        <p class="section-sub">{t('landing.modeEduSub')}</p>
      </div>

      <div class="feature-row-edu reveal">
        <div class="edu-pair">
          <div class="img-frame compact edu-frame">
            <div class="img-content edu-img"><img src="/screenshots/edu-panel.png" alt={t('landing.modeEduTitle')} loading="lazy" /></div>
          </div>
          <div class="img-frame compact edu-frame">
            <div class="img-content edu-img"><img src="/screenshots/edu-exercise-new.png" alt={t('landing.modeEduTitle')} loading="lazy" /></div>
          </div>
        </div>
        <div class="feature-text edu-text">
          <div class="feature-tag green">{t('landing.tagEdu')}</div>
          <h3>{t('landing.eduNowTitle')}</h3>
          <p>{t('landing.eduNowDesc')}</p>
          <ul class="feature-list">
            <li>{t('landing.eduNow1')}</li>
            <li>{t('landing.eduNow2')}</li>
            <li>{t('landing.eduNow3')}</li>
          </ul>
          <h3 class="coming-soon-h3">{t('landing.eduSoonTitle')}</h3>
          <ul class="feature-list coming-soon-list">
            <li>{t('landing.eduSoon1')}</li>
            <li>{t('landing.eduSoon2')}</li>
            <li>{t('landing.eduSoon3')}</li>
          </ul>
        </div>
      </div>

      <!-- ── MODO PRO ── -->
      <div class="mode-header reveal">
        <div class="mode-badge mode-badge-pro">{t('landing.modeProBadge')}</div>
        <h2>{t('landing.modeProTitle')}</h2>
        <p class="section-sub">{t('landing.modeProSub')}</p>
      </div>

      <div class="feature-row reverse reveal">
        <div class="feature-img-wrap">
          <div class="img-frame compact">
            <div class="img-content slideshow">
              {#each ssPro.images as src, i}
                <img {src} alt={t('landing.modeProTitle')} class="slide" class:active={i === ssPro.idx} loading="lazy" />
              {/each}
            </div>
            <div class="slideshow-dots">
              {#each ssPro.images as _, i}
                <button class="ss-dot" class:active={i === ssPro.idx} onclick={() => goToSlide(ssPro, i)} aria-label="Slide {i + 1}"></button>
              {/each}
            </div>
          </div>
        </div>
        <div class="feature-text">
          <div class="feature-tag pro-tag">{t('landing.tagPro')}</div>
          <h3>{t('landing.proTitle')}</h3>
          <p>{t('landing.proDesc')}</p>
          <ul class="feature-list">
            <li>{t('landing.pro1')}</li>
            <li>{t('landing.pro2')}</li>
            <li>{t('landing.pro3')}</li>
            <li>{t('landing.pro4')}</li>
            <li>{t('landing.pro5')}</li>
          </ul>
        </div>
      </div>

    </div>
  </section>

  <!-- ═══ INTERACTIVE DEMO ═══ -->
  <section class="demo-section reveal" id="demo">
    <div class="section-inner">
      <h2>{t('landing.interactiveDemo')}</h2>
      <p class="section-sub">{t('landing.interactiveDemoDesc')}</p>
      <!-- Desktop: embedded iframe demo -->
      <div class="demo-frame-wrap demo-desktop">
        <div class="demo-browser-clean">
          <div class="demo-iframe-wrap">
            {#if demoLoaded}
              <iframe src="/demo?embed" title="Stabileo Demo" class="demo-iframe"></iframe>
            {:else}
              <button class="demo-placeholder" onclick={() => demoLoaded = true}>
                <img src="/screenshots/2d-moments.png" alt="Stabileo Demo" class="demo-thumb" />
                <div class="demo-play">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48"><path d="M8 5v14l11-7z"/></svg>
                  <span>{t('landing.tryDemo')}</span>
                </div>
              </button>
            {/if}
          </div>
        </div>
      </div>
      <!-- Mobile: simple button linking to /demo -->

      <div class="demo-mobile-cta">
        <a href="/demo" class="btn-primary large">{t('landing.tryTour')}</a>
      </div>
    </div>
  </section>

  <!-- ═══ COMPARISON ═══ -->
  <section class="comparison reveal">
    <div class="section-inner">
      <h2>{t('landing.comparisonTitle')}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th></th><th class="hl">Stabileo</th><th>SkyCiv</th><th>Ftool</th><th>SAP2000</th><th>STAAD</th></tr></thead>
          <tbody>
            <tr><td>{t('landing.compBrowser')}</td><td class="hl yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
            <tr><td>{t('landing.compFree')}</td><td class="hl yes">✓</td><td class="no">{t('landing.trialOnly')}</td><td class="partial">~</td><td class="no">✗</td><td class="no">✗</td></tr>
            <tr><td>2D + 3D</td><td class="hl yes">✓</td><td class="yes">✓</td><td class="no">2D</td><td class="yes">✓</td><td class="yes">✓</td></tr>
            <tr><td>{t('landing.compEducational')}</td><td class="hl yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
            <tr><td>{t('landing.compNoInstall')}</td><td class="hl yes">✓</td><td class="yes">✓</td><td class="no">✗</td><td class="no">✗</td><td class="no">✗</td></tr>
            <tr><td>{t('landing.compMultilang')}</td><td class="hl yes">14</td><td class="partial">3</td><td class="partial">2</td><td class="partial">~</td><td class="partial">~</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- ═══ PRICING ═══ -->
  <section class="pricing reveal" id="pricing">
    <div class="section-inner">
      <h2>{t('landing.pricingTitle')}</h2>
      <div class="pricing-grid">
        <div class="price-card">
          <h3>{t('landing.priceFreeTitle')}</h3>
          <div class="price-amount">$0</div>
          <p class="price-period">{t('landing.priceForever')}</p>
          <ul><li>{t('landing.priceFree1')}</li><li>{t('landing.priceFree2')}</li><li>{t('landing.priceFree3')}</li><li>{t('landing.priceFree4')}</li><li>{t('landing.priceFree5')}</li><li>{t('landing.priceFree6')}</li></ul>
          <button class="btn-primary card-cta" onclick={() => enterApp()}>{t('landing.tryDemo')}</button>
        </div>
        <div class="price-card featured">
          <div class="price-ribbon">{t('landing.comingSoon')}</div>
          <h3>{t('landing.priceEduTitle')}</h3>
          <div class="price-amount">$10<span>{t('landing.perMonth')}</span></div>
          <p class="price-period">{t('landing.priceEduPeriod')}</p>
          <ul><li>{t('landing.priceEdu1')}</li><li>{t('landing.priceEdu2')}</li><li>{t('landing.priceEdu3')}</li><li>{t('landing.priceEdu4')}</li><li>{t('landing.priceEdu5')}</li><li>{t('landing.priceEdu6')}</li></ul>
        </div>
        <div class="price-card">
          <div class="price-ribbon">{t('landing.comingSoon')}</div>
          <h3>{t('landing.priceProTitle')}</h3>
          <div class="price-amount">$50<span>{t('landing.perMonth')}</span></div>
          <p class="price-period">{t('landing.priceProPeriod')}</p>
          <ul><li>{t('landing.pricePro1')}</li><li>{t('landing.pricePro2')}</li><li>{t('landing.pricePro3')}</li><li>{t('landing.pricePro4')}</li><li>{t('landing.pricePro5')}</li><li class="ai-highlight">{t('landing.pricePro6')}</li><li>{t('landing.priceProExtra')}</li></ul>
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ CHANGELOG ═══ -->
  <section class="changelog-section reveal">
    <div class="section-inner">
      <h2>{t('landing.changelog')}</h2>
      <p class="section-sub">{t('landing.changelogDesc')}</p>
      <div class="changelog-timeline">
        <div class="cl-item">
          <div class="cl-dot"></div>
          <div class="cl-date">Mar 2026</div>
          <div class="cl-text">{t('landing.cl202603')}</div>
        </div>
        <div class="cl-item">
          <div class="cl-dot"></div>
          <div class="cl-date">Feb 2026</div>
          <div class="cl-text">{t('landing.cl202602')}</div>
        </div>
        <div class="cl-item">
          <div class="cl-dot"></div>
          <div class="cl-date">Jan 2026</div>
          <div class="cl-text">{t('landing.cl202601')}</div>
        </div>
        <div class="cl-item">
          <div class="cl-dot"></div>
          <div class="cl-date">Dec 2025</div>
          <div class="cl-text">{t('landing.cl202512')}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ FINAL CTA ═══ -->
  <section class="final-cta reveal">
    <div class="section-inner">
      <h2>{t('landing.ctaTitle')}</h2>
      <p>{t('landing.ctaSub')}</p>
      <button class="btn-primary large" onclick={() => enterApp()}>{t('landing.tryDemo')}</button>
    </div>
  </section>

  <!-- ═══ FOOTER ═══ -->
  <footer class="lp-footer">
    <div class="footer-inner">
      <div class="footer-brand"><span class="nav-logo">△</span> Stabileo</div>
      <p class="footer-copy">&copy; {new Date().getFullYear()} Stabileo. {t('landing.footerRights')}</p>
    </div>
  </footer>

  <!-- Mobile sticky CTA -->
  <div class="mobile-sticky">
    <button class="btn-primary" onclick={() => enterApp()}>{t('landing.tryDemo')}</button>
  </div>
</div>

<style>
  /* ═══ BASE — Warm slate dark ═══
   * Palette: deep blue-slate base (#151923) with warm elevated surfaces (#1c2133).
   * Text: warm off-white (#d4d8e3) body, bright (#eef0f6) headings.
   * Accents: coral-red (#e94560) primary, soft teal (#5eeadb) secondary.
   * Personality: subtle warm undertones, generous glow effects, soft purple hints.
   */
  .landing {
    position: fixed; inset: 0; z-index: 10000;
    overflow-y: auto; overflow-x: hidden;
    overflow-anchor: none;
    background: #151923; color: #b0b8ca;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .section-inner { max-width: 1320px; margin: 0 auto; padding: 0 1.5rem; }
  .section-sub { text-align: center; color: #8891a5; margin-bottom: 2.5rem; font-size: 0.95rem; line-height: 1.6; }

  /* Noise overlay */
  .noise {
    position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.025;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 256px 256px;
  }

  /* Scroll progress */
  .scroll-progress {
    position: fixed; top: 0; left: 0; height: 2px; z-index: 200;
    background: linear-gradient(90deg, #e94560, #5eeadb); transition: width 0.1s linear;
  }

  /* ═══ ANIMATIONS ═══ */
  .reveal { opacity: 0; transform: translateY(16px); transition: opacity 0.6s ease, transform 0.6s ease; }
  .reveal:global(.visible) { opacity: 1; transform: translateY(0); }

  /* ═══ NAVBAR ═══ */
  .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: rgba(21,25,35,0.8); backdrop-filter: blur(20px) saturate(1.5); border-bottom: 1px solid rgba(255,255,255,0.06); }
  .nav-inner { max-width: 1320px; margin: 0 auto; padding: 0 1.5rem; height: 56px; display: flex; align-items: center; gap: 1.5rem; }
  .nav-brand { display: flex; align-items: center; gap: 0.5rem; }
  .nav-logo { color: #e94560; font-size: 1.4rem; font-weight: 700; }
  .nav-name { color: #eef0f6; font-weight: 700; font-size: 1.05rem; letter-spacing: 0.02em; }
  .nav-links { display: flex; gap: 0.25rem; margin-left: auto; }
  .nav-links button { background: none; border: none; color: #8891a5; font-size: 0.82rem; cursor: pointer; padding: 0.4rem 0.7rem; border-radius: 6px; transition: color 0.2s, background 0.2s; font-family: inherit; }
  .nav-links button:hover { color: #d4d8e3; background: rgba(255,255,255,0.05); }
  .nav-actions { display: flex; align-items: center; gap: 0.75rem; }
  .nav-lang { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #8891a5; font-size: 0.72rem; padding: 0.25rem 0.35rem; border-radius: 4px; cursor: pointer; font-family: inherit; }

  /* ═══ BUTTONS ═══ */
  .btn-primary { background: #e94560; color: white; border: none; padding: 0.65rem 1.6rem; font-size: 0.9rem; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s; letter-spacing: 0.01em; font-family: inherit; }
  .btn-primary:hover { background: #f25a73; transform: translateY(-1px); box-shadow: 0 6px 28px rgba(233,69,96,0.3); }
  .btn-primary.sm { padding: 0.35rem 0.9rem; font-size: 0.78rem; }
  .btn-primary.large { padding: 0.85rem 2.8rem; font-size: 1rem; }
  .btn-primary.card-cta { width: 100%; margin-top: auto; padding-top: 0.6rem; padding-bottom: 0.6rem; }
  .btn-secondary { background: none; border: 1px solid #333a4f; color: #b0b8ca; padding: 0.65rem 1.6rem; font-size: 0.9rem; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-family: inherit; }
  .btn-secondary:hover { border-color: #5eeadb; color: #5eeadb; }

  /* ═══ HERO ═══ */
  .hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6rem 1.5rem 3rem; position: relative; overflow: hidden; }
  .hero-bg { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 55% at 50% 0%, rgba(233,69,96,0.08) 0%, transparent 65%), radial-gradient(ellipse 45% 45% at 80% 60%, rgba(94,234,219,0.05) 0%, transparent 65%), radial-gradient(ellipse 40% 40% at 20% 70%, rgba(139,92,246,0.04) 0%, transparent 60%); }
  .hero-content { position: relative; text-align: center; max-width: 680px; margin-bottom: 3rem; z-index: 1; }
  .hero-badge { display: inline-block; font-size: 0.68rem; color: #5eeadb; background: rgba(94,234,219,0.07); border: 1px solid rgba(94,234,219,0.15); padding: 0.3rem 0.85rem; border-radius: 20px; margin-bottom: 1.5rem; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 500; }
  .hero h1 { font-size: clamp(2.4rem,5vw,3.6rem); font-weight: 800; line-height: 1.1; margin: 0 0 1.1rem; background: linear-gradient(135deg, #ffffff 0%, #c0c6d4 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .hero-sub { font-size: clamp(0.95rem,2vw,1.1rem); color: #8891a5; line-height: 1.65; margin: 0 0 2rem; }
  .hero-ctas { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
  .hero-status { color: #5c6480; font-size: 0.78rem; margin-top: 1.2rem; line-height: 1.5; }

  /* ═══ IMAGE FRAMES ═══ */
  .hero-visual { position: relative; width: 100%; max-width: 1200px; z-index: 1; }
  .img-frame { background: #1c2133; border: 1px solid #2a3048; border-radius: 0; overflow: hidden; box-shadow: 0 32px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03); transition: transform 0.3s ease, box-shadow 0.3s ease; }
  .img-frame.compact { border-radius: 0; }
  .img-frame.compact:hover { transform: scale(1.012); box-shadow: 0 32px 80px -12px rgba(0,0,0,0.55), 0 0 48px rgba(94,234,219,0.04); }
  .img-content { position: relative; aspect-ratio: 2182/1292; background: #151923; }
  .img-content img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .hero-glow { position: absolute; bottom: -50px; left: 5%; right: 5%; height: 140px; background: radial-gradient(ellipse at center, rgba(233,69,96,0.1) 0%, rgba(94,234,219,0.04) 50%, transparent 70%); filter: blur(50px); pointer-events: none; }

  /* Browser frame (legacy, kept for reference) */
  .browser-frame { background: #1c2133; border: 1px solid #2a3048; border-radius: 12px; overflow: hidden; box-shadow: 0 32px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03); }
  /* Clean demo frame — no browser chrome */
  .demo-browser-clean { background: #151923; border: 1px solid #2a3048; border-radius: 0; overflow: hidden; box-shadow: 0 32px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03); }
  .browser-bar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #1a1f30; border-bottom: 1px solid #2a3048; }
  .browser-dots { display: flex; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .dot.r { background: #ef4444; } .dot.y { background: #eab308; } .dot.g { background: #22c55e; }
  .browser-url { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.04); border-radius: 6px; padding: 4px 12px; flex: 1; max-width: 300px; margin: 0 auto; }
  .browser-url span { color: #5c6480; font-size: 0.72rem; }

  /* Slideshow */
  .slideshow { position: relative; aspect-ratio: 2182/1292; background: #151923; }
  .slide { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity 0.8s ease; will-change: opacity; }
  .slide.active { opacity: 1; }

  /* Slideshow dots */
  .slideshow-dots {
    display: flex; justify-content: center; gap: 8px;
    padding: 8px 0; background: rgba(21, 25, 35, 0.7);
  }
  .ss-dot {
    width: 8px; height: 8px; border-radius: 50%; border: none; padding: 0;
    background: rgba(255,255,255,0.25); cursor: pointer;
    transition: all 0.25s ease;
  }
  .ss-dot:hover { background: rgba(255,255,255,0.5); }
  .ss-dot.active { width: 24px; border-radius: 4px; background: #5eeadb; }

  /* ═══ METRICS ═══ */
  .metrics { display: flex; justify-content: center; gap: 3.5rem; padding: 3rem 1.5rem; border-top: 1px solid rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.04); flex-wrap: wrap; background: rgba(28,33,51,0.5); }
  .metric { text-align: center; min-width: 90px; }
  .metric-num { display: block; font-size: 1.8rem; font-weight: 800; color: #eef0f6; line-height: 1.3; }
  .metric-label { font-size: 0.7rem; color: #5c6480; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 500; }

  /* ═══ FEATURES ═══ */
  .features { padding: 6rem 0; }
  .section-header { text-align: center; margin-bottom: 4rem; }
  h2 { font-size: clamp(1.6rem,3vw,2.1rem); color: #eef0f6; font-weight: 700; margin: 0 0 0.5rem; text-align: center; }
  .feature-row { display: grid; grid-template-columns: 3fr 2fr; gap: 3rem; align-items: center; margin-bottom: 5rem; }
  .feature-row.reverse { grid-template-columns: 3fr 2fr; direction: rtl; }
  .feature-row.reverse > * { direction: ltr; }
  .feature-text { max-width: 480px; }

  /* Education: portrait images side by side + text below */
  .feature-row-edu { display: flex; flex-direction: column; align-items: center; gap: 2.5rem; margin-bottom: 5rem; }
  .edu-pair { display: flex; gap: 1.5rem; justify-content: center; width: 100%; max-width: 720px; }
  .edu-frame { flex: 1; min-width: 0; }
  .edu-img { aspect-ratio: 826/1292; background: #151923; }
  .edu-img img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .edu-text { max-width: 600px; text-align: center; }
  .edu-text .feature-list { text-align: left; display: inline-block; }
  .feature-tag { display: inline-block; font-size: 0.65rem; font-weight: 600; color: #e94560; background: rgba(233,69,96,0.08); border: 1px solid rgba(233,69,96,0.15); padding: 0.2rem 0.6rem; border-radius: 4px; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }
  .feature-tag.teal { color: #5eeadb; background: rgba(94,234,219,0.07); border-color: rgba(94,234,219,0.15); }
  .feature-tag.yellow { color: #fbbf24; background: rgba(251,191,36,0.07); border-color: rgba(251,191,36,0.12); }
  .feature-tag.green { color: #34d399; background: rgba(52,211,153,0.07); border-color: rgba(52,211,153,0.15); }
  .feature-tag.pro-tag { color: #f0a500; background: rgba(240,165,0,0.08); border-color: rgba(240,165,0,0.15); }
  .mode-header { text-align: center; margin-bottom: 2.5rem; margin-top: 2rem; }
  .mode-badge { display: inline-block; font-size: 0.62rem; font-weight: 700; padding: 0.25rem 0.8rem; border-radius: 20px; margin-bottom: 1rem; letter-spacing: 0.07em; text-transform: uppercase; }
  .mode-badge-basic { color: #e94560; background: rgba(233,69,96,0.08); border: 1px solid rgba(233,69,96,0.2); }
  .mode-badge-edu { color: #34d399; background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2); }
  .mode-badge-pro { color: #f0a500; background: rgba(240,165,0,0.08); border: 1px solid rgba(240,165,0,0.2); }
  .coming-soon-h3 { margin-top: 1.2rem !important; color: #8891a5 !important; font-size: 1rem !important; }
  .coming-soon-list li { color: #5c6480; }
  .coming-soon-list li::before { color: #5c6480; content: '◇'; }
  .dev-note { display: inline-block; font-size: 0.65rem; color: #5c6480; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 0.2rem 0.6rem; border-radius: 4px; margin-top: 0.5rem; }
  .feature-text h3 { color: #eef0f6; font-size: 1.4rem; font-weight: 700; margin: 0 0 0.6rem; line-height: 1.25; }
  .feature-text p { color: #8891a5; font-size: 0.88rem; line-height: 1.6; margin: 0 0 1rem; }
  .feature-list { list-style: none; padding: 0; margin: 0; }
  .feature-list li { color: #b0b8ca; font-size: 0.82rem; padding: 0.3rem 0 0.3rem 1.2rem; position: relative; line-height: 1.5; }
  .feature-list li::before { content: '→'; position: absolute; left: 0; color: #5eeadb; font-size: 0.78rem; }

  /* ═══ CARDS ═══ */
  .cards-section { padding: 2rem 0 6rem; }
  .cards-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; }
  .card { background: #1c2133; border: 1px solid #2a3048; border-radius: 10px; padding: 1.5rem; transition: all 0.25s ease; }
  .card:hover { border-color: #3a4260; transform: translateY(-2px); box-shadow: 0 12px 36px rgba(0,0,0,0.25); }
  .card-icon { width: 36px; height: 36px; margin-bottom: 0.75rem; }
  .card-icon svg { width: 100%; height: 100%; }
  .ci-teal { color: #5eeadb; } .ci-red { color: #e94560; } .ci-yellow { color: #fbbf24; }
  .ci-green { color: #34d399; } .ci-purple { color: #a78bfa; } .ci-white { color: #8891a5; }
  .card h4 { color: #eef0f6; font-size: 0.95rem; font-weight: 600; margin: 0 0 0.4rem; }
  .card p { color: #8891a5; font-size: 0.78rem; line-height: 1.55; margin: 0; }
  .oss-card { border-color: rgba(167,139,250,0.15); }
  .card-link { display: inline-block; margin-top: 0.6rem; color: #8891a5; font-size: 0.78rem; text-decoration: none; transition: color 0.2s; }
  .card-link:hover { color: #eef0f6; }
  .card-badge { display: inline-block; font-size: 0.55rem; font-weight: 600; color: #fbbf24; background: rgba(251,191,36,0.08); padding: 0.1rem 0.4rem; border-radius: 3px; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.04em; }

  /* ═══ INTERACTIVE DEMO ═══ */
  .demo-section { padding: 5rem 0; }
  .demo-frame-wrap { max-width: 1200px; margin: 0 auto; }
  .demo-mobile-cta { display: none; text-align: center; }
  .demo-browser { box-shadow: 0 32px 80px -12px rgba(0,0,0,0.5); }
  .demo-iframe-wrap { position: relative; width: 100%; aspect-ratio: 16/9; }
  .demo-iframe { width: 100%; height: 100%; border: none; background: #151923; }
  .demo-placeholder { position: relative; width: 100%; height: 100%; border: none; background: none; cursor: pointer; padding: 0; display: block; }
  .demo-thumb { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.5); transition: filter 0.3s; }
  .demo-placeholder:hover .demo-thumb { filter: brightness(0.35); }
  .demo-play { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; color: white; }
  .demo-play svg { width: 64px; height: 64px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5)); transition: transform 0.2s; }
  .demo-placeholder:hover .demo-play svg { transform: scale(1.15); }
  .demo-play span { font-size: 1rem; font-weight: 600; letter-spacing: 0.03em; text-shadow: 0 2px 8px rgba(0,0,0,0.5); }

  /* ═══ COMPARISON ═══ */
  .comparison { padding: 5rem 0; }
  .table-wrap { overflow-x: auto; margin-top: 2.5rem; background: #1c2133; border-radius: 10px; border: 1px solid #2a3048; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  th, td { padding: 0.75rem 1rem; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.04); }
  th { color: #5c6480; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; }
  th.hl { color: #5eeadb; }
  td:first-child { text-align: left; color: #b0b8ca; font-weight: 500; }
  td.hl { background: rgba(94,234,219,0.03); }
  td.yes { color: #34d399; font-weight: 600; }
  td.no { color: #3a4260; }
  td.partial { color: #fbbf24; }
  tbody tr:last-child td { border-bottom: none; }

  /* ═══ PRICING ═══ */
  .pricing { padding: 5rem 0; }
  .pricing-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; margin-top: 3rem; }
  .price-card { background: #1c2133; border: 1px solid #2a3048; border-radius: 10px; padding: 2rem 1.5rem; text-align: center; position: relative; transition: all 0.25s; display: flex; flex-direction: column; }
  .price-card:hover { border-color: #3a4260; box-shadow: 0 12px 36px rgba(0,0,0,0.2); }
  .price-card.featured { border-color: rgba(233,69,96,0.4); background: linear-gradient(180deg, rgba(233,69,96,0.06) 0%, #1c2133 50%); box-shadow: 0 0 40px rgba(233,69,96,0.06); }
  .price-ribbon { position: absolute; top: -1px; right: 1.5rem; background: #e94560; color: white; font-size: 0.58rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 0 0 5px 5px; letter-spacing: 0.04em; }
  .price-card h3 { color: #eef0f6; font-size: 1.1rem; margin: 0 0 0.5rem; }
  .price-amount { font-size: 2.5rem; font-weight: 800; color: #eef0f6; line-height: 1.2; }
  .price-amount span { font-size: 0.9rem; color: #5c6480; font-weight: 400; }
  .price-period { color: #5c6480; font-size: 0.78rem; margin: 0.25rem 0 1.5rem; }
  .price-card ul { list-style: none; padding: 0; text-align: left; margin-bottom: 1rem; }
  .price-card li { color: #8891a5; font-size: 0.8rem; padding: 0.3rem 0 0.3rem 1.2rem; position: relative; }
  .price-card li::before { content: '✓'; position: absolute; left: 0; color: #5eeadb; font-size: 0.75rem; }
  .price-card li.ai-highlight { color: #eef0f6; font-weight: 600; background: linear-gradient(90deg, rgba(167,139,250,0.1), transparent); border-radius: 4px; padding-top: 0.4rem; padding-bottom: 0.4rem; margin: 0.2rem 0; }
  .price-card li.ai-highlight::before { content: '✦'; color: #a78bfa; }

  /* ═══ CHANGELOG ═══ */
  .changelog-section { padding: 5rem 0; }
  .changelog-timeline { max-width: 560px; margin: 0 auto; position: relative; padding-left: 2rem; }
  .changelog-timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: #2a3048; }
  .cl-item { position: relative; margin-bottom: 1.5rem; }
  .cl-dot { position: absolute; left: -2rem; top: 3px; width: 12px; height: 12px; border-radius: 50%; background: #1c2133; border: 2px solid #5eeadb; }
  .cl-item:first-child .cl-dot { background: #5eeadb; }
  .cl-date { font-size: 0.72rem; color: #5c6480; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.2rem; }
  .cl-text { color: #b0b8ca; font-size: 0.85rem; line-height: 1.5; }

  /* ═══ FINAL CTA ═══ */
  .final-cta { text-align: center; padding: 6rem 1.5rem; background: linear-gradient(180deg, transparent, rgba(233,69,96,0.04)); }
  .final-cta h2 { margin-bottom: 0.6rem; }
  .final-cta p { color: #8891a5; margin-bottom: 2rem; font-size: 0.95rem; }

  /* ═══ FOOTER ═══ */
  .lp-footer { border-top: 1px solid rgba(255,255,255,0.04); padding: 1.5rem; background: rgba(28,33,51,0.4); }
  .footer-inner { max-width: 1120px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
  .footer-brand { color: #eef0f6; font-weight: 700; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; }
  .footer-copy { color: #5c6480; font-size: 0.72rem; }

  /* ═══ MOBILE STICKY CTA ═══ */
  .mobile-sticky { display: none; }

  /* ═══ SECTION SEPARATORS ═══ */
  .features::before, .demo-section::before, .pricing::before {
    content: ''; display: block; height: 1px; max-width: 400px; margin: 0 auto 4rem;
    background: linear-gradient(90deg, transparent, rgba(94,234,219,0.12), transparent);
  }

  /* ═══ RESPONSIVE ═══ */
  @media (max-width: 900px) {
    .feature-row, .feature-row.reverse { grid-template-columns: 1fr; gap: 2rem; direction: ltr; }
    .feature-text { max-width: none; }
    .edu-pair { flex-direction: row; max-width: 500px; }
    .cards-grid { grid-template-columns: repeat(2,1fr); }
    .pricing-grid { grid-template-columns: 1fr; max-width: 400px; margin-left: auto; margin-right: auto; }
  }
  @media (max-width: 640px) {
    .nav-links { display: none; }
    .hero { padding: 5rem 1rem 2rem; }
    .hero-content { margin-bottom: 2rem; }
    .metrics { gap: 1.5rem; padding: 2rem 1rem; }
    .metric-num { font-size: 1.4rem; }
    .cards-grid { grid-template-columns: 1fr; }
    .features { padding: 4rem 0; }
    .feature-row { margin-bottom: 3.5rem; }
    .footer-inner { flex-direction: column; gap: 0.5rem; text-align: center; }
    .browser-bar { padding: 6px 10px; }
    .dot { width: 8px; height: 8px; }
    .browser-url { display: none; }
    .demo-desktop { display: none; }
    .demo-mobile-cta { display: block; }
    .mobile-sticky {
      display: flex; position: fixed; bottom: 0; left: 0; right: 0; z-index: 150;
      padding: 0.75rem 1rem; background: rgba(21,25,35,0.95); backdrop-filter: blur(12px);
      border-top: 1px solid rgba(255,255,255,0.05); justify-content: center;
    }
    .mobile-sticky .btn-primary { width: 100%; max-width: 400px; text-align: center; }
    .lp-footer { padding-bottom: 5rem; }
  }
</style>
