/**
 * A run's verdicts do not depend on how fast the machine is.
 *
 * The run's wall-clock cap (`RunOptions.maxRunMs`) stops the member loop, and what it leaves out
 * is counted in `notReached` with the run flagged `aborted`. The settle after the loop
 * (`settleCrossingSeats`) used to be cut by the same clock, and quietly: a run that crossed the
 * cap there kept beams VERIFIED against seats the run never designed, with `aborted` false. On
 * the flagship that was one beam more verified than a complete run verifies, and the detailing's
 * repair ladder then moved other bars. CI's slower runner crossed the 20 s cap there and the
 * flagship repair test read a different design.
 *
 * The clock here is a counter, so where the cap falls is the same on every machine: just after
 * the member loop's last member, inside the settle.
 */
import { describe, it, expect } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import { runDesign } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { rebarHash } from '../rebar-hash';
import { detailableReinforcement, type DesignRunSummary } from '../outcome';
import { solveFixture } from './helpers';

const verdicts = (s: DesignRunSummary) => [...s.outcomes.values()]
  .map((o) => `${o.elementId}:${o.outcome}:${detailableReinforcement(o) ? rebarHash(detailableReinforcement(o)!.rebar) : '-'}`)
  .sort();

describe('the settle after the member loop', () => {
  it('is not cut by the run\'s clock: a cap that falls inside it changes no verdict', () => {
    const solved = solveFixture(frame);
    const counter = () => { let n = 0; return { clock: () => ++n, now: () => n }; };

    // The complete run, and where its member loop ended on the counter.
    const a = counter();
    let loopEnd = 0;
    const complete = runDesign(cirsoc201Adapter, solved.contexts.values(), {
      clock: a.clock, maxRunMs: Number.POSITIVE_INFINITY, progressEvery: 1,
      onProgress: (p) => { if (p.done === p.total) loopEnd = a.now(); },
    });
    expect(complete.aborted).toBe(false);
    expect(loopEnd).toBeGreaterThan(0);
    // The settle did work after the loop: there is something for a cap to cut.
    expect(a.now()).toBeGreaterThan(loopEnd + 10);

    // The same run with the cap just past the loop's end.
    const b = counter();
    const capped = runDesign(cirsoc201Adapter, solved.contexts.values(), { clock: b.clock, maxRunMs: loopEnd + 1 });
    expect(capped.aborted).toBe(false);
    expect(capped.notReached).toBe(0);
    expect(verdicts(capped)).toEqual(verdicts(complete));
  }, 300_000);
});
