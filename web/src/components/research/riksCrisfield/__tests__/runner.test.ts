import { afterEach, expect, it, vi } from 'vitest';
import { ArcRunner } from '../runner.svelte';
import { DEFAULT_PARAMETERS, type CaseFile } from '../benchmark';
import data from '../../../../../../research/numerical-methods/riks-crisfield/reference-results/arc_length_snap_through.json';
const workers: MockWorker[] = [];
class MockWorker {
  onmessage?: (e: {data: unknown}) => void;
  onerror?: (e: {message: string}) => void;
  runId = 0;
  constructor() { workers.push(this); }
  postMessage(message: {runId:number}) { this.runId=message.runId; }
  terminate() {}
  frame() { this.onmessage?.({data:{type:'frame',runId:this.runId,frame:{step:1,loadFactor:.25,load:12.5,displacement:.001,iterations:4,converged:true,displacements:[0,0]}}}); }
}
afterEach(() => vi.unstubAllGlobals());
it.each(['stop','error'])('preserves numerical partial results on %s', action => {
  vi.stubGlobal('Worker',MockWorker);
  const c = (data as CaseFile).cases[0], runner = new ArcRunner();
  runner.run(c,DEFAULT_PARAMETERS(c));
  const worker = workers.at(-1)!; worker.frame();
  if (action==='stop') runner.stop(); else worker.onerror?.({message:'failure'});
  expect(runner.current!.totalIterations).toBe(4);
  expect(runner.current!.finalLoadFactor).toBe(.25);
  expect(runner.current!.frames).toHaveLength(1);
  expect(runner.status).toBe(action === 'stop' ? 'stopped' : 'error');
  runner.dispose();
});
