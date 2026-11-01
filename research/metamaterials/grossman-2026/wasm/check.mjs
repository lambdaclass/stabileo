// Runs the built browser bundle in Node on cases with exact answers (same tolerances as
// tests/validation.rs), runs the paper's foam strip and checks that bad input is refused.
//   node check.mjs <bundle dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [dir] = process.argv.slice(2);
const glue = await import(pathToFileURL(join(dir, 'springs.js')).href);
glue.initSync({ module: readFileSync(join(dir, 'springs_bg.wasm')) });
const net = (lattice, extra = {}) => ({ lattice, eta: 0, keep: 1, seed: 0, spring_law: 'hookean', k: 1, prestress: 0, ...extra });
const periodic = (network, n = 8) => JSON.parse(glue.springs_periodic(JSON.stringify({ network, n1: n, n2: n, strain: [0, 0, 0] })));
const results = {};
let ok = true;
const check = (name, observed, tol) => {
  results[name] = observed;
  if (!(observed <= tol)) ok = false;
};
const tri = periodic(net({ kind: 'triangular', phi: 1, psi: 1 }));
check('triangular B', Math.abs(tri.isotropic.bulk - Math.sqrt(3) / 2), 1e-10);
check('triangular G', Math.abs(tri.isotropic.shear - Math.sqrt(3) / 4), 1e-10);
const l = 0.25;
const honey = periodic(net({ kind: 'honeycomb', l, k_radial: 1e-6 }), 4);
const eq23 = (-(2 - 4 * l) * (l + 0.5)) / (3 + 4 * l - 4 * l * l);
check('honeycomb Eq. (23)', Math.abs(honey.uniaxial_x[1] - eq23), 1e-5);
const t0 = Date.now();
const strip = JSON.parse(glue.springs_strip(JSON.stringify({ network: net({ kind: 'triangular', phi: 1, psi: 1 }, { eta: 0.3, seed: 11 }), width: 13, height: 52, theta: 0, clamp_band: 0.5, strain: 0.01 })));
results.stripMs = Date.now() - t0;
results.stripPoisson = strip.poisson;
check('strip is finite', Number.isFinite(strip.poisson) ? 0 : 1, 0);
let bad = false;
try {
  glue.springs_periodic(JSON.stringify({ network: net({ kind: 'triangular', phi: 1, psi: 1 }, { eta: 0.9 }), n1: 4, n2: 4 }));
} catch {
  bad = true;
}
check('refuses eta outside [0, 0.5]', bad ? 0 : 1, 0);
console.log(JSON.stringify({ ...results, ok }));
process.exit(ok ? 0 : 1);
