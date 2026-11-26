import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { EXAMPLES_2D, EXAMPLES_3D } from '../basic-examples';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import { getFixture, is2DFixture } from '../../templates/fixture-index';
import { codeExampleText, type CodeExampleId } from '../../templates/examples';
import { codeToModel } from '../../model/code/format';
import { buildPreview, type ExamplePreview, type PreviewSource } from '../preview-geometry';

const FILE = 'src/lib/examples/previews.generated.json';

type Raw = {
  nodes: PreviewSource['nodes'];
  elements: PreviewSource['elements'];
  supports: PreviewSource['supports'];
  quads?: { nodes: number[] }[];
  plates?: { nodes: number[] }[];
};

const values = <T>(v: unknown): T[] => (Array.isArray(v) ? v.map((e) => (Array.isArray(e) ? e[1] : e)) as T[] : []);

async function sourceOf(id: string, code: boolean): Promise<PreviewSource> {
  let raw: Raw;
  if (code) {
    const parsed = codeToModel(await codeExampleText(id as CodeExampleId));
    if (!parsed.snapshot) throw new Error(`${id} does not parse`);
    const s = parsed.snapshot as Record<string, unknown>;
    raw = { nodes: values(s.nodes), elements: values(s.elements), supports: values(s.supports), quads: values(s.quads), plates: values(s.plates) };
  } else {
    const loader = getFixture(id);
    if (!loader) throw new Error(`${id} has no fixture`);
    const m = await loader();
    raw = (m.default ?? m) as Raw;
  }
  return {
    nodes: raw.nodes,
    elements: raw.elements,
    supports: raw.supports ?? [],
    shells: [...(raw.quads ?? []), ...(raw.plates ?? [])].map((q) => q.nodes),
  };
}

async function computeAll(): Promise<Record<string, ExamplePreview>> {
  const out: Record<string, ExamplePreview> = {};
  const basic = [...EXAMPLES_2D, ...EXAMPLES_3D].map((e) => ({ id: e.id, code: false }));
  const pro = PRO_EXAMPLES.map((e) => ({ id: e.id, code: e.source === 'code' }));
  for (const { id, code } of [...basic, ...pro]) {
    if (out[id]) continue;
    out[id] = buildPreview(await sourceOf(id, code), !code && is2DFixture(id));
  }
  return out;
}

describe('example previews', () => {
  it('cover every example in the gallery and match the models', async () => {
    const computed = await computeAll();
    if (process.env.UPDATE_EXAMPLE_PREVIEWS === '1' || !existsSync(FILE)) {
      writeFileSync(FILE, JSON.stringify(computed) + '\n');
    }
    const stored = JSON.parse(readFileSync(FILE, 'utf8'));
    expect(stored, 'run UPDATE_EXAMPLE_PREVIEWS=1 npx vitest run --project unit src/lib/examples').toEqual(computed);
    for (const [id, p] of Object.entries(computed)) expect(p.m.length + p.s.length, `${id} draws something`).toBeGreaterThan(0);
  }, 120_000);
});
