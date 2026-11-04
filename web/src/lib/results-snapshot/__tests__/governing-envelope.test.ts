import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { SNAPSHOT_DIR } from '../run-group';

type Values = Record<string, unknown>;

function governingBelowEnvelope(values: Values): string[] {
  const out: string[] = [];
  for (const [key, g] of Object.entries(values)) {
    const m = /^envelope\.governing\[e(\d+)\]$/.exec(key);
    if (!m) continue;
    for (const [field, value] of Object.entries(g as Record<string, unknown>)) {
      if (!field.endsWith('.value') || typeof value !== 'number') continue;
      const component = field.slice(0, -'.value'.length);
      const env = values[`envelope.${component}[e${m[1]}]`] as Record<string, unknown> | undefined;
      if (!env) continue;
      const stations = Object.values(env).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v): v is number => typeof v === 'number');
      if (stations.length === 0) continue;
      const peak = Math.max(...stations.map(Math.abs));
      const globalMax = Math.abs(Number(values[`envelope.${component}.globalMax`] ?? peak));
      if (Math.abs(peak - value) > 1e-6 * peak + 1e-12 * globalMax) out.push(`e${m[1]} ${component}: governing ${value}, envelope ${peak}`);
    }
  }
  return out;
}

const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith('.json'));

describe('the governing value of each member is its envelope peak', () => {
  for (const f of files) {
    it(f, () => {
      const { values } = JSON.parse(readFileSync(new URL(f, SNAPSHOT_DIR), 'utf8')) as { values: Values };
      expect(governingBelowEnvelope(values)).toEqual([]);
    });
  }

  it('NEGATIVE: a governing moment read at the member ends only, below its midspan envelope, fails', () => {
    const values = {
      'envelope.momentY.globalMax': 0.36,
      'envelope.momentY[e10]': { posValues: [0, 0.3451605375, 0.1], negValues: [-0.2210394375, 0, 0] },
      'envelope.governing[e10]': { 'momentY.combos': '3', 'momentY.value': 0.2210394375 },
    };
    expect(governingBelowEnvelope(values)).toEqual(['e10 momentY: governing 0.2210394375, envelope 0.3451605375']);
  });
});
