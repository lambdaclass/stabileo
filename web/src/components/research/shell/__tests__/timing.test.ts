import { expect, it } from 'vitest';
import { completedTiming, timingText, referenceTimingText } from '../timing';

it('shows only finite completed live measurements, never replay, cache or partial runs', () => {
  expect(completedTiming(null)).toBeNull();
  for (const status of ['running', 'stopped', 'error', 'unconverged']) {
    expect(completedTiming({ status, seconds: 1, origin: 'live' })).toBeNull();
  }
  expect(completedTiming({ status: 'done', seconds: 1, origin: 'cached' })).toBeNull();
  expect(completedTiming({ status: 'done', seconds: NaN, origin: 'live' })).toBeNull();
  expect(completedTiming({ status: 'done', seconds: 0, origin: 'live' })).toBe(0);
  expect(completedTiming({ status: 'done', seconds: 0.9, origin: 'live' })).toBe(0.9);
});

it('formats real counts and local decimals in all public languages', () => {
  expect(timingText('en', 0.9, 79, 2000)).toBe('Solved in 0.9 s on your device (79 load steps, 2,000 elements)');
  expect(timingText('es', 0.9, 79, 2000)).toContain('0,9 s');
  expect(timingText('pt', 0.9, 79, 2000)).toContain('79 passos de carga');
});

it('uses the selected measured case and identifies the reference machine', () => {
  const timing = { machine: { runner_label: 'runner', cpu_model: 'CPU', cores: 4 }, date: '2026-10-29', scope: 'process', python_seconds: 41, rust_native_seconds: 0.6,
    cases: { example: { python_seconds: 41, rust_native_seconds: 0.6, steps: 79, elements: 2000 } } };
  expect(referenceTimingText('en', timing, 'example')).toContain('Reference Python: 41 s, native Rust: 0.6 s on runner / CPU');
  expect(referenceTimingText('en', timing, 'missing')).toBeNull();
  expect(referenceTimingText('en', { ...timing, reference_includes_output: true }, 'example')).toContain('Python includes file/plot output');
  expect(referenceTimingText('en', timing, 'example')).not.toContain('file/plot');
});
