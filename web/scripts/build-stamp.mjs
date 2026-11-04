import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

export function buildStamp(env = process.env) {
  const git = (...args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const list = (...args) => git('ls-files', '-z', ...args).split('\0').filter(Boolean);
  const tracked = [...list('-c', '--', 'web', 'research'), ...list('-o', '--exclude-standard', '--', 'web/src', 'web/public', 'research')];
  const files = [...new Set([...tracked, ...IGNORED_INPUTS.flatMap((dir) => walk(join(REPO_ROOT, dir)))])].sort();
  const hash = createHash('sha256');
  hash.update(`HEAD ${git('rev-parse', 'HEAD').trim()}\0`);
  for (const name of Object.keys(env).filter((key) => key.startsWith('VITE_') || ['BASE_PATH', 'GITHUB_SHA'].includes(key)).sort()) {
    hash.update(`env ${name}=${env[name]}\0`);
  }
  for (const file of files) {
    const path = join(REPO_ROOT, file);
    const content = existsSync(path) && statSync(path).isFile() ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'absent';
    hash.update(`${file}\0${content}\0`);
  }
  return hash.digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(buildStamp());
