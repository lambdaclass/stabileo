import { beforeAll, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as engine from '../../engine/wasm-solver';
import { EXAMPLES } from '../../../components/examples/catalog';
import { defaults, refusedOutcome } from '../../../components/examples/define';

const root = process.env.AUDIT_SITE_ROOT!;
const supplied = process.env.AUDIT_SITE_MANIFEST;
const generated = EXAMPLES.flatMap(e => {
  const base = defaults(e.params);
  return [{ id: e.id, name: `site-${e.id}-default`, values: base }, ...e.params.flatMap(p => [
    { id: e.id, name: `site-${e.id}-${p.key}-min`, values: { ...base, [p.key]: p.min } },
    { id: e.id, name: `site-${e.id}-${p.key}-max`, values: { ...base, [p.key]: p.max } },
  ])];
});
const cases: typeof generated = supplied === undefined ? generated : JSON.parse(readFileSync(supplied, 'utf8'));
beforeAll(async () => {
  await engine.initSolver();
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/manifest.json`, JSON.stringify(cases));
});
for (const c of cases) {
  it(c.name, () => {
    const example = EXAMPLES.find(e => e.id === c.id)!;
    let model: unknown;
    let outcome: unknown;
    try {
      model = example.build(c.values);
      outcome = example.analyses(model, c.values, engine);
    } catch (e) {
      outcome = refusedOutcome(e);
    }
    writeFileSync(`${root}/${c.name}.json`, JSON.stringify({ case: c.name, parameters: c.values, model, outcome }, (key, value) => key === 'timings' ? undefined : value instanceof Map ? Object.fromEntries(value) : value));
    expect(outcome).toBeDefined();
  }, 600_000);
}
