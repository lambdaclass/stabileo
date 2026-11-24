import { setImmediate as yieldToEventLoop } from 'node:timers/promises';

export { yieldToEventLoop };

export async function runBetweenWorkerTurns<T>(run: () => T): Promise<T> {
  await yieldToEventLoop();
  const result = run();
  await yieldToEventLoop();
  return result;
}

export async function runWithWorkerYields<T>(steps: Generator<void, T, void>): Promise<T> {
  await yieldToEventLoop();
  let step = steps.next();
  while (!step.done) {
    await yieldToEventLoop();
    step = steps.next();
  }
  await yieldToEventLoop();
  return step.value;
}
