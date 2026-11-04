import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

describe('the web-ifc.wasm the app serves', () => {
  it('is the one the installed web-ifc package ships', () => {
    const served = readFileSync(fileURLToPath(new URL('../../../../public/web-ifc.wasm', import.meta.url)));
    const shipped = readFileSync(createRequire(import.meta.url).resolve('web-ifc/web-ifc.wasm'));
    expect(served.equals(shipped), 'public/web-ifc.wasm is stale: copy node_modules/web-ifc/web-ifc.wasm over it').toBe(true);
  });
});
