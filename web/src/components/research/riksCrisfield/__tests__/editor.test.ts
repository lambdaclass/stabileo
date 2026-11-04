import { describe, expect, it } from 'vitest';
import caseData from '../../../../../../research/numerical-methods/riks-crisfield/reference-results/arc_length_snap_through.json';
import { codeShareUrl, readCodeFragment } from '../../../../lib/model/code/share';
import { DEFAULT_PARAMETERS, type CaseFile } from '../benchmark';
import { editorSnapshot } from '../editor';

const data = caseData as CaseFile;

describe('Riks–Crisfield editor sharing', () => {
  it('round-trips the production case through the existing model-code link', () => {
    const c = data.cases[0];
    const parameters = { ...DEFAULT_PARAMETERS(c), riseSpan: 0.04, direction: 'upward' as const };
    const snapshot = editorSnapshot(c, parameters);
    const { url } = codeShareUrl(snapshot, 'https://stabileo.test/app/basic');
    expect(url).toContain('#code=');
    const restored = readCodeFragment(url.slice(url.indexOf('#'))).snapshot!;
    expect(restored.analysisMode).toBe('2d');
    expect(restored.nodes).toHaveLength(3);
    expect(restored.elements).toHaveLength(2);
    expect(restored.nodes!.find(([id]) => id === c.apex.nodeId)![1].y).toBeCloseTo(0.16, 12);
    expect(restored.loads![0].data.fz).toBe(50);
    expect(restored.materials![0][1].e).toBe(200_000_000);
    expect(restored.supports).toHaveLength(2);
  });
});
