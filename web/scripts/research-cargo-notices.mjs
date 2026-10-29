import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function cargoLicenceTexts(pkg) {
  const directory = path.dirname(pkg.manifest_path);
  const files = fs.readdirSync(directory).filter(name => /^(LICENSE|LICENCE|COPYING|UNLICENSE|NOTICE)([-.]|$)/i.test(name)).sort();
  const texts = files.map(file => ({ file, text: fs.readFileSync(path.join(directory, file), 'utf8').replace(/\r\n/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trimEnd() }));
  const supported = new Set(['MIT', 'Apache-2.0', 'MIT OR Apache-2.0', 'Apache-2.0 OR MIT', 'Unlicense OR MIT', 'Zlib', '(MIT OR Apache-2.0) AND Unicode-3.0']);
  if (!supported.has(pkg.license) || !texts.length || texts.some(({ text }) => !text.trim())) {
    throw new Error(`Unresolved Cargo licence: ${pkg.name} ${pkg.version} (${pkg.license})`);
  }
  const needed = pkg.license.includes('MIT') ? [/^LICENSE(?:-MIT)?$/i] : pkg.license === 'Apache-2.0' ? [/^LICENSE(?:-APACHE)?$/i] : [/^LICENSE$/i];
  if (pkg.license.includes('Unicode-3.0')) needed.push(/^LICENSE-UNICODE$/i);
  if (needed.some(pattern => !files.some(file => pattern.test(file)))) {
    throw new Error(`Unresolved Cargo licence text: ${pkg.name} (${pkg.license})`);
  }
  return texts;
}

export function researchCargoNotices(repo) {
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--filter-platform', 'wasm32-unknown-unknown', '--manifest-path', path.join(repo, 'research/fracture/shauer-2025/wasm/Cargo.toml')], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
  const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
  const reachable = new Set();
  function visit(id) {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const dep of nodes.get(id).deps) visit(dep.pkg);
  }
  visit(metadata.resolve.root);
  return metadata.packages.filter(pkg => reachable.has(pkg.id)).sort((a, b) => a.name.localeCompare(b.name)).flatMap(pkg => {
    if (pkg.source === null) {
      if (!['dedaliano-engine', 'phasefield-shauer-2025', 'phasefield-shauer-2025-wasm'].includes(pkg.name) || pkg.license !== 'AGPL-3.0-only') throw new Error(`Unresolved local Cargo licence: ${pkg.name}`);
      return [];
    }
    const texts = cargoLicenceTexts(pkg);
    return ['---', '', `## Cargo: ${pkg.name} ${pkg.version}`, '', `- **Licence:** ${pkg.license}`, `- **Source:** https://crates.io/crates/${pkg.name}/${pkg.version}`, '',
      ...texts.flatMap(({ file, text }) => [`<details><summary>${file}</summary>`, '', '```', text, '```', '', '</details>', ''])];
  });
}
