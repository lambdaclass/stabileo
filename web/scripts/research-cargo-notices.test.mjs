import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
