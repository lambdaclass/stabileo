/**
 * Generate the third-party notices that ship with the browser bundle.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * Stabileo is AGPL-3.0 and its production bundle embeds eighteen packages: eight MIT, nine
 * Apache-2.0 and one MPL-2.0. All three licences attach conditions to DISTRIBUTION, and a
 * browser app distributes to every visitor:
 *
 *   - **MIT** — "The above copyright notice and this permission notice shall be included in
 *     all copies or substantial portions of the Software."
 *   - **Apache-2.0 §4** — retain the copyright, patent, trademark and attribution notices, and
 *     give recipients a copy of the licence.
 *   - **MPL-2.0 §3.2** — recipients must be told how to obtain the source of the covered files.
 *
 * The bundle satisfies none of that on its own: `vite build` minifies, and a check of
 * `dist/assets/*.js` finds zero `Copyright (c)` strings. The notices therefore have to
 * accompany the distribution as a separate document, which is what this writes.
 *
 * ── What it reads, and what it deliberately does not ───────────────
 *
 * The RUNTIME closure only — `npm ls --omit=dev`. Build tools are not distributed and listing
 * them would pad the file with obligations nobody has, which makes the real ones easier to
 * miss. Vitest, Playwright, Svelte and TypeScript are absent for that reason, not by oversight.
 *
 * Licence TEXT is copied verbatim from each package's own file rather than from a table of
 * canonical texts, because the copyright line is part of the notice and it is per-package.
 *
 * ── Keeping it honest ──────────────────────────────────────────────
 *
 * `third-party-notices.test.ts` runs this and fails if the committed file differs. Adding a
 * runtime dependency without regenerating is therefore a test failure rather than a
 * compliance gap discovered by somebody else.
 *
 *   node scripts/third-party-notices.mjs          # check, exit 1 on drift
 *   node scripts/third-party-notices.mjs --write  # regenerate
 */

import { researchCargoNotices } from './research-cargo-notices.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');
const OUT_REPO = path.join(REPO, 'THIRD_PARTY_NOTICES.md');
/** Also shipped, so the deployed site carries its own notices at a stable URL. */
const OUT_PUBLIC = path.join(WEB, 'public', 'third-party-notices.txt');

/** Every package reachable from `dependencies`, flattened, name → version. */
function runtimeClosure() {
  const raw = execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
    cwd: WEB, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const tree = JSON.parse(raw);
  const found = new Map();
  (function walk(node) {
    for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
      if (!found.has(name)) found.set(name, dep.version ?? '?');
      walk(dep);
    }
  })(tree);
  return [...found.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function readPkg(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(WEB, 'node_modules', name, 'package.json'), 'utf8'));
  } catch { return {}; }
}

/** The package's own licence file, whatever it chose to call it. */
function readLicenceText(name) {
  const dir = path.join(WEB, 'node_modules', name);
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return null; }
  const file = entries.find((f) => /^(LICEN[CS]E|COPYING)([-.]|$)/i.test(f));
  if (file) return { file, text: fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trimEnd() };
  // Some packages (splaytree) ship their full licence in the README only.
  const readme = entries.find((f) => /^README\.md$/i.test(f));
  if (readme) {
    const text = fs.readFileSync(path.join(dir, readme), 'utf8').replace(/\r\n/g, '\n');
    const section = text.match(/^## Licen[cs]e[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/im);
    if (section?.[1].trim()) return { file: `${readme} (Licence section)`, text: section[1].trim() };
  }
  return null;
}

function licenceId(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses[0]?.type) return pkg.licenses[0].type;
  return 'UNKNOWN';
}

function build() {
  const closure = runtimeClosure();
  const lines = [];

  lines.push('# Third-party notices');
  lines.push('');
  lines.push('Bundled fonts (IBM Plex Sans/Mono, Space Grotesk and Noto Sans Math) are under');
  lines.push('SIL OFL 1.1. Complete copyright notices, licences and subset provenance: /fonts/OFL.txt.');
  lines.push('');
  lines.push('Stabileo is licensed under the **GNU Affero General Public License v3.0**; see');
  lines.push('`LICENSE`. Its production bundle also contains the third-party packages listed');
  lines.push('below, each under its own licence, reproduced in full.');
  lines.push('');
  lines.push('This file is GENERATED by `web/scripts/third-party-notices.mjs` and checked by');
  lines.push('`third-party-notices.test.ts`. Edit the generator, not this file.');
  lines.push('');
  lines.push('JavaScript notices cover the runtime dependency closure, excluding build and test');
  lines.push('tooling such as Vite, Vitest, Playwright, Svelte and TypeScript. Research WASM');
  lines.push('notices conservatively cover its full resolved Cargo closure, including macro');
  lines.push('and build dependencies. Licence and copyright texts come from each package.');
  lines.push('');

  const byLicence = new Map();
  for (const [name, version] of closure) {
    const id = licenceId(readPkg(name));
    if (!byLicence.has(id)) byLicence.set(id, []);
    byLicence.get(id).push({ name, version });
  }

  lines.push('## Summary');
  lines.push('');
  lines.push('| Package | Version | Licence |');
  lines.push('|---|---|---|');
  lines.push('| `phasefield-jr-py` | 2025 (adapted research code) | MIT |');
  for (const [name, version] of closure) {
    lines.push(`| \`${name}\` | ${version} | ${licenceId(readPkg(name))} |`);
  }
  lines.push('');

  for (const [name, version] of closure) {
    const pkg = readPkg(name);
    const id = licenceId(pkg);
    const lic = readLicenceText(name);
    lines.push('---');
    lines.push('');
    lines.push(`## ${name} ${version}`);
    lines.push('');
    lines.push(`- **Licence:** ${id}`);
    if (pkg.homepage) lines.push(`- **Homepage:** ${pkg.homepage}`);
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    if (repo) lines.push(`- **Source:** ${repo.replace(/^git\+/, '').replace(/\.git$/, '')}`);
    if (id === 'MPL-2.0') {
      // MPL §3.2: recipients must be told where the source of the covered files is.
      lines.push('- **MPL-2.0 note:** the source of the covered files is available at the'
        + ' repository above. Stabileo does not modify them.');
    }
    lines.push('');
    if (lic) {
      lines.push(`<details><summary>${lic.file}</summary>`);
      lines.push('');
      lines.push('```');
      lines.push(lic.text);
      lines.push('```');
      lines.push('');
      lines.push('</details>');
    } else {
      // Loud rather than silent: a package with no licence file is a question, not a default.
      lines.push(`> **No licence file found in \`node_modules/${name}\`.** Declared \`${id}\`.`);
      lines.push('> Resolve before the next release.');
    }
    lines.push('');
  }

  lines.push('---', '', '## phasefield-jr-py (adapted research code)', '',
    '- **Licence:** MIT',
    '- **Source:** https://github.com/nathanshauer/phasefield-jr-py', '',
    '<details><summary>LICENSE</summary>', '', '```',
    fs.readFileSync(path.join(REPO, 'research/fracture/shauer-2025/LICENSE-phasefield-jr-py'), 'utf8').trimEnd(),
    '```', '', '</details>', '');
  lines.push(...researchCargoNotices(REPO));
  return lines.join('\n');
}

const content = build();
const write = process.argv.includes('--write');

if (write) {
  fs.writeFileSync(OUT_REPO, content);
  fs.mkdirSync(path.dirname(OUT_PUBLIC), { recursive: true });
  fs.writeFileSync(OUT_PUBLIC, content);
  console.log(`third-party notices: wrote ${OUT_REPO} and ${OUT_PUBLIC}`);
} else {
  const current = fs.existsSync(OUT_REPO) ? fs.readFileSync(OUT_REPO, 'utf8') : '';
  if (current !== content) {
    console.error('third-party notices are out of date — run '
      + '`node scripts/third-party-notices.mjs --write`');
    process.exit(1);
  }
  console.log('third-party notices: up to date');
}

export { build };
