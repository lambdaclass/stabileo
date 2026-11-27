import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import replay from '../../../../../../research/mechanics/vella-2024/reference-results/replay.json';
import validation from '../../../../../../research/mechanics/vella-2024/VALIDATION.json';
import { decodeRun, snapFrame } from '../protocol';

afterEach(() => vi.unstubAllGlobals());

it('reports the two Fig. 2c comparison-band envelope errors in the release note', () => {
  const fragment = resolve('../changelog.d/research-vella-2024.md');
  const text = readFileSync(existsSync(fragment) ? fragment : resolve('../CHANGELOG.md'), 'utf8');
  const note = text.split('\n').find(line => line.includes('`/research/mechanics/vella-2024`') && line.includes('Fig. 2c'));
  const error = (id: string) => {
    const verdict = validation.not_reproduced.find(row => row.id === id)!;
    return (100 * verdict.observed).toFixed(0) + '%';
  };
  expect(note).toContain('0.04 ≤ |µ̇| ≤ 0.1');
  expect(note).toContain(`twelve-phase envelopes have median absolute relative errors of ${error('fig2c-amplitude')} for two clamps and ${error('fig2c-amplitude-one-end')} for one clamp`);
});

it.each([[2, 0], [2.5, 0], [3, 1], [5, 1], [9, 2]])('seeks the nearest frame for a trace-only snap at %s', (time, expected) => {
  const frames = [0, 5, 10].map((t, i) => ({ ...replay.frames[i], t, height: 0 }));
  const trace = {
    t: [0, time, 10], mu: [1, 1, 1], thetaMin: [0, 0, 0], thetaMax: [0, 0, 0],
    height: [0, Number.EPSILON, 1],
  };
  expect(snapFrame(decodeRun({ ...replay, frames, trace }))).toBe(expected);
});

it.each(['truncated', 'steps', 'newtonIterations'])('refuses invalid run metadata in %s', field => {
  const invalid = field === 'truncated' ? [undefined, null, 0, 'false'] : [undefined, null, -1, NaN, Infinity, '0', 0.5, Number.MAX_SAFE_INTEGER + 1];
  for (const value of invalid) {
    const outcome = { ...replay.outcome, [field]: value };
    expect.soft(() => decodeRun({ ...replay, outcome }), String(value)).toThrow('Invalid outcome');
  }
});

it('preserves both completion states and valid work counters', () => {
  for (const truncated of [true, false]) {
    for (const count of [0, 1, Number.MAX_SAFE_INTEGER]) {
      const outcome = { ...replay.outcome, truncated, steps: count, newtonIterations: count };
      expect(decodeRun({ ...replay, outcome }).outcome).toEqual(outcome);
    }
  }
});

it('returns each failed worker initialization to its own request in reverse completion order', async () => {
  const port = { onmessage: async (_event: MessageEvent) => {}, postMessage: vi.fn() };
  vi.stubGlobal('self', port);
  const failures: (() => void)[] = [];
  vi.stubGlobal('fetch', () => new Promise((_resolve, reject) => failures.push(() => reject(new Error()))));
  await import('../sim.worker');
  const request = (requestId: number) => port.onmessage(new MessageEvent('message', { data: { requestId, settings: replay.settings } }));
  const first = request(11);
  const second = request(12);
  failures[1]();
  await second;
  failures[0]();
  await first;
  expect(port.postMessage.mock.calls).toEqual([[{ requestId: 12, error: true }], [{ requestId: 11, error: true }]]);
});
