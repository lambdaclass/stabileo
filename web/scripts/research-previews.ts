import { chromium } from 'playwright';
import { preview } from 'vite';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { configs, replayHash, frameSteps, captureUrl } from './research-preview-utils';

const web = resolve(import.meta.dirname, '..');
const server = await preview({ root: web, preview: { host: '127.0.0.1', port: 0 } });
const address = server.httpServer.address();
if (!address || typeof address === 'string') throw new Error('Preview server has no port');
const scratch = await mkdtemp(join(tmpdir(), 'research-previews-'));
const manifest: Record<string, { replay: string; sha256: string }> = {};
let browser;
try {
  browser = await chromium.launch();
  for (const config of configs) {
    const replay = await readFile(join(web, 'public', config.replay));
    const builtReplay = await readFile(join(web, 'dist', config.replay));
    if (replayHash(replay) !== replayHash(builtReplay)) throw new Error(`${config.paperId}: rebuild the site; dist replay is stale`);
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.goto(captureUrl(`http://127.0.0.1:${address.port}`, config));
    const state = page.locator(config.state);
    await page.waitForFunction(({ selector }) => Number(document.querySelector(selector)?.getAttribute('data-steps')) > 0, { selector: config.state });
    if (await state.getAttribute('data-source') !== 'replay') throw new Error('Capture requires replay');
    const count = Number(await state.getAttribute('data-steps'));
    if (config.step >= count) throw new Error(`${config.paperId}: preview step out of range`);
    const viewer = page.locator(config.viewer);
    await viewer.locator('canvas').waitFor();
    await page.addStyleTag({ content: `${config.viewer} { position: fixed !important; inset: 0 !important; width: 1200px !important; height: 630px !important; z-index: 9999 !important; background: #0c1620; }` });
    const settle = async () => {
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      await page.waitForTimeout(100);
    };
    const seek = async (step: number) => {
      await page.locator(config.slider).evaluate((el, value) => {
        (el as HTMLInputElement).value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, step);
      await settle();
    };
    const dir = join(scratch, config.paperId);
    await mkdir(dir);
    await seek(config.step);
    await viewer.screenshot({ path: join(dir, 'preview.png'), animations: 'disabled' });
    const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
    ffmpeg(['-i', join(dir, 'preview.png'), '-vf', 'scale=600:315', join(dir, 'thumb.png')]);
    for (const [i, step] of frameSteps(count, config.frames).entries()) {
      await seek(step);
      await viewer.screenshot({ path: join(dir, `frame-${String(i).padStart(3, '0')}.png`), animations: 'disabled' });
    }
    for (const [extension, codec] of [['webm', 'libvpx-vp9'], ['mp4', 'libx264']]) {
      ffmpeg(['-framerate', '15', '-i', join(dir, 'frame-%03d.png'), '-vf', 'scale=600:314', '-an', '-c:v', codec,
        '-b:v', '900k', '-pix_fmt', 'yuv420p', ...(extension === 'mp4' ? ['-movflags', '+faststart'] : []), join(dir, `preview.${extension}`)]);
      if ((await stat(join(dir, `preview.${extension}`))).size >= 1_000_000) throw new Error(`${config.paperId}: ${extension} exceeds 1 MB; lower the bitrate`);
    }
    const out = join(web, 'public', config.path);
    await mkdir(out, { recursive: true });
    for (const file of ['preview.png', 'thumb.png', 'preview.webm', 'preview.mp4']) await copyFile(join(dir, file), join(out, file));
    manifest[config.paperId] = { replay: config.replay, sha256: replayHash(replay) };
    await page.close();
  }
  await writeFile(join(web, 'public/research/previews.json'), JSON.stringify(manifest, null, 2) + '\n');
} finally {
  await browser?.close();
  await new Promise<void>((done, reject) => server.httpServer.close((error) => error ? reject(error) : done()));
  await rm(scratch, { recursive: true, force: true });
}
