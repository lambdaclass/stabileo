// The updater manifest for one desktop prerelease: node latest-json.mjs <version> <notes> <dir>.
// <dir> holds the release's files; each updatable bundle has its .sig beside it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [version, notes, dir] = process.argv.slice(2);
const base = `https://github.com/lambdaclass/stabileo/releases/download/desktop-v${version}`;
const files = readdirSync(dir);

function entry(pattern) {
  const file = files.find((f) => pattern.test(f) && files.includes(`${f}.sig`));
  if (!file) throw new Error(`no signed bundle matching ${pattern}`);
  return { signature: readFileSync(join(dir, `${file}.sig`), 'utf8').trim(), url: `${base}/${encodeURIComponent(file)}` };
}

const mac = entry(/_universal\.app\.tar\.gz$/);
const manifest = {
  version,
  notes: notes || `Stabileo desktop ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': mac,
    'darwin-x86_64': mac,
    'linux-x86_64': entry(/\.AppImage$/),
    'windows-x86_64': entry(/-setup\.exe$/),
  },
};
console.log(JSON.stringify(manifest, null, 2));
