import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargoLicenceTexts } from './research-cargo-notices.mjs';

test('unresolved Cargo licences and missing texts fail closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cargo-notices-'));
  const pkg = { name: 'example', version: '1.0', manifest_path: path.join(dir, 'Cargo.toml'), license: 'MIT' };
  try {
    assert.throws(() => cargoLicenceTexts(pkg), /Unresolved/);
    fs.writeFileSync(path.join(dir, 'LICENSE-MIT'), 'Copyright Example\nMIT permission text');
    assert.equal(cargoLicenceTexts(pkg)[0].text, 'Copyright Example\nMIT permission text');
    assert.throws(() => cargoLicenceTexts({ ...pkg, license: null }), /Unresolved/);
    assert.throws(() => cargoLicenceTexts({ ...pkg, license: 'LicenseRef-Unknown' }), /Unresolved/);
    assert.throws(() => cargoLicenceTexts({ ...pkg, license: '(MIT OR Apache-2.0) AND Unicode-3.0' }), /Unresolved/);
    fs.writeFileSync(path.join(dir, 'LICENSE-MIT'), '');
    assert.throws(() => cargoLicenceTexts(pkg), /Unresolved/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('#1886: notices include the versions locked by the Fehér browser runtime', () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const lock = fs.readFileSync(path.join(repo, 'research/stability/feher-sipos-varkonyi-2026/Cargo.lock'), 'utf8');
  const notices = fs.readFileSync(path.join(repo, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const packages = [...lock.matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"\nsource = "registry\+[^"\n]+"/g)];
  for (const name of ['serde_json', 'wasm-bindgen', 'web-sys']) {
    const pkg = packages.find(([, lockedName]) => lockedName === name);
    assert.ok(pkg, `${name} must be present in the Fehér lockfile`);
    assert.ok(notices.includes(`## Cargo: ${name} ${pkg[2]}`));
  }
});
