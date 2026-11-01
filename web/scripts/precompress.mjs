/** Writes <file>.br beside every compressible file in dist/ for Caddy's `precompressed br` (infra/caddy/Caddyfile). Run after the prerender, which writes the HTML. */
process.env.UV_THREADPOOL_SIZE ??= '8';
const { readdir, readFile, writeFile, stat, rm } = await import('node:fs/promises');
const { join, resolve } = await import('node:path');
const { brotliCompress, constants } = await import('node:zlib');
const { promisify } = await import('node:util');

const COMPRESSIBLE = /\.(?:html|js|mjs|css|json|svg|wasm|xml|txt|csv|map|webmanifest)$/;
const MIN_BYTES = 1024;
const compress = promisify(brotliCompress);

export async function precompress(dir) {
  const files = [];
  async function walk(d) {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (COMPRESSIBLE.test(entry.name) && (await stat(path)).size >= MIN_BYTES) files.push(path);
    }
  }
  await walk(dir);
  let before = 0, after = 0;
  await Promise.all(files.map(async (path) => {
    const body = await readFile(path);
    const out = await compress(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 24, [constants.BROTLI_PARAM_SIZE_HINT]: body.length } });
    before += body.length;
    if (out.length >= body.length) {
      after += body.length;
      await rm(`${path}.br`, { force: true });
      return;
    }
    after += out.length;
    await writeFile(`${path}.br`, out);
  }));
  return { files: files.length, before, after };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = resolve(process.argv[2] ?? 'dist');
  const started = Date.now();
  const { files, before, after } = await precompress(dir);
  console.log(`precompressed ${files} files in ${dir}: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB brotli, ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
