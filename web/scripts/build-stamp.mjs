import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(WEB_ROOT, '..');
const IGNORED_INPUTS = ['web/src/lib/wasm', 'web/public/research-wasm'];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [relative(REPO_ROOT, path)];
  });
}

export function envStamp(env = process.env) {
  const hash = createHash('sha256');
  for (const name of Object.keys(env).filter((key) => key.startsWith('VITE_') || ['BASE_PATH', 'GITHUB_SHA', 'NODE_ENV'].includes(key)).sort()) {
    hash.update(`${name}=${env[name]}\0`);
  }
  return hash.digest('hex');
}

export function sourceStamp() {
  const git = (...args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const list = (...args) => git('ls-files', '-z', ...args).split('\0').filter(Boolean);
  const tracked = [...list('-c', '--', 'web', 'research'), ...list('-o', '--exclude-standard', '--', 'web', 'research')];
  const envFiles = readdirSync(WEB_ROOT).filter((name) => name.startsWith('.env')).map((name) => `web/${name}`);
  const files = [...new Set([...tracked, ...envFiles, ...IGNORED_INPUTS.flatMap((dir) => walk(join(REPO_ROOT, dir)))])].sort();
  const hash = createHash('sha256');
  hash.update(`HEAD ${git('rev-parse', 'HEAD').trim()}\0`);
  for (const file of files) {
    const path = join(REPO_ROOT, file);
    const content = existsSync(path) && statSync(path).isFile() ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'absent';
    hash.update(`${file}\0${content}\0`);
  }
  return hash.digest('hex');
}

// Vitest copies VITE_* values from web/.env files into process.env, so a test compares the environment
// make recorded before starting Vitest (STABILEO_BUILD_ENV_STAMP), never its own process.env.
export function buildStamp(env = process.env) {
  return `sources=${sourceStamp()} env=${env.STABILEO_BUILD_ENV_STAMP ?? envStamp(env)}`;
}

export function outputDigest(dir) {
  const hash = createHash('sha256');
  for (const path of walk(dir).map((file) => join(REPO_ROOT, file)).sort()) {
    hash.update(`${relative(dir, path)}\0${createHash('sha256').update(readFileSync(path)).digest('hex')}\0`);
  }
  return hash.digest('hex');
}

/** What a build directory's `.source-stamp` must hold: the sources it was built from and the files it holds now. */
export function sealOf(dir, stamp) {
  return `${stamp} output=${outputDigest(dir)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, dir, stamp] = process.argv.slice(2);
  if (mode === '--env') console.log(envStamp());
  else if (mode === '--seal') writeFileSync(`${resolve(dir)}.source-stamp`, `${sealOf(resolve(dir), stamp)}\n`);
  else console.log(buildStamp());
}
