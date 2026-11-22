import { relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { clearInterval, setInterval } from 'node:timers';
import { afterAll } from 'vitest';

const sampleIntervalMs = 50;
const warnAtMs = 30_000;
const now = performance.now.bind(performance);
let lastSample = now();
let longestGap = 0;

function sample() {
  const sampledAt = now();
  longestGap = Math.max(longestGap, sampledAt - lastSample);
  lastSample = sampledAt;
}

const sampler = setInterval(sample, sampleIntervalMs).unref();

afterAll((suite) => {
  sample();
  clearInterval(sampler);
  const file = relative(process.cwd(), suite.file?.filepath ?? suite.name);
  const duration = `${longestGap.toFixed(1)} ms`;
  if (longestGap >= warnAtMs) {
    console.warn(`[vitest-worker] ${file} went ${duration} without servicing its event-loop timer. Yield between synchronous stages.`);
  } else if (process.env.STABILEO_VITEST_WORKER_PROFILE === '1') {
    console.log(`[worker-block] ${duration} ${file}`);
  }
});
