import { chromium } from '@playwright/test';

const base = process.argv[2];
const viewports = [[1440, 900], [390, 844]];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const s = { samples: [] };
    window.__nav = s;
    const read = () => {
      const hd = document.querySelector('#app .site-header') ?? document.querySelector('#app nav');
      const link = hd?.querySelector('[data-nav]');
      const name = hd?.querySelector('.nav-name');
      const l = document.querySelector('#app .landing');
      const st = link && getComputedStyle(link), sn = name && getComputedStyle(name);
      const all = hd ? [...hd.querySelectorAll('a,button,.nav-name')].map(e => { const c = getComputedStyle(e); return `${c.fontSize}/${c.lineHeight}/${c.fontFamily.split(',')[0].replace(/"/g, '')}`; }) : [];
      const sig = [...new Set(all)].join(' ');
      return [Math.round(performance.now()), hd ? `${Math.round(hd.getBoundingClientRect().height * 100) / 100}|${sig}` : 'NONE', Math.round(window.scrollY), l ? Math.round(l.scrollTop) : -1, l ? l.scrollHeight - l.clientHeight : -1];
    };
    s.read = read;
    setInterval(() => s.samples.push(read()), 50);
  });
  const dump = async (tag) => {
    const samples = await page.evaluate(() => { const s = window.__nav.samples; window.__nav.samples = []; return s; });
    const distinct = [...new Set(samples.map(s => s[1]))];
    const scroll = samples.map(s => `${s[2]}/${s[3]}/${s[4]}`);
    const uniqScroll = scroll.filter((v, i) => i === 0 || v !== scroll[i - 1]);
    console.log(`${w}x${h} ${tag}: header=${JSON.stringify(distinct)} scroll(winY/landingTop/max)=${uniqScroll.slice(0, 12).join(' ')}`);
  };
  const clickNav = async (id) => {
    if (w < 1141) await page.locator('#app nav .nav-toggle').first().click();
    await page.locator(`#app nav [data-nav="${id}"]`).first().click();
  };
  await page.goto(base + '/en/');
  await page.locator('#app .landing h1').first().waitFor();
  await page.waitForTimeout(1500);
  await dump('landing load');
  await page.locator('#app .landing').evaluate(el => el.scrollTo(0, 1500));
  await clickNav('research');
  await page.waitForTimeout(3000);
  await dump('landing(scrolled 1500)->research');
  const card = page.locator('#app .landing a[href*="/research/benchmarks/lee-frame-1968"]').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await dump('gallery scroll to lee card');
  await card.click();
  await page.waitForTimeout(5000);
  await dump('gallery->lee paper');
  await page.goBack();
  await page.waitForTimeout(2000);
  await dump('back to gallery');
  const card2 = page.locator('#app .landing a[href*="/research/optimization/andreassen-2011"]').first();
  await card2.scrollIntoViewIfNeeded();
  await card2.click();
  await page.waitForTimeout(5000);
  await dump('gallery->andreassen');
  await clickNav('tools');
  await page.waitForTimeout(3000);
  await dump('->tools');
  await clickNav('blog');
  await page.waitForTimeout(3000);
  await dump('->blog');
  await ctx.close();
}
await browser.close();
