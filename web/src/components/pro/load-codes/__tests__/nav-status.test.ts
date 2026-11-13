import { describe, expect, it } from 'vitest';
import { codeInputStatus } from '../nav-status';

describe('the value beside wind and seismic for a code with its own inputs', () => {
  it('reads the basic wind speed of the Eurocode, the UK NA map and ASCE 7', () => {
    expect(codeInputStatus('wind', { vb0: 26, terrain: 'III' })).toEqual({ symbol: 'vb,0', value: 26, kind: 'speed' });
    expect(codeInputStatus('wind', { vbMap: 22.5, altitude: 80 })).toEqual({ symbol: 'vb,map', value: 22.5, kind: 'speed' });
    expect(codeInputStatus('wind', { V: 51.4 })).toEqual({ symbol: 'V', value: 51.4, kind: 'speed' });
  });

  it('reads agR, SDS or SS for the seismic codes', () => {
    expect(codeInputStatus('seismic', { agR: 0.25, groundType: 'C' })?.symbol).toBe('agR');
    expect(codeInputStatus('seismic', { sds: 1.0, sd1: 0.6 })?.symbol).toBe('SDS');
    expect(codeInputStatus('seismic', { ss: 1.2, s1: 0.3 })?.symbol).toBe('SS');
  });

  it('is null while the field is empty, zero or the code (TS 498 wind) has no such value', () => {
    expect(codeInputStatus('wind', undefined)).toBeNull();
    expect(codeInputStatus('wind', { vb0: 0 })).toBeNull();
    expect(codeInputStatus('wind', { shape: 'general', directions: { x: true, y: true } })).toBeNull();
    expect(codeInputStatus('seismic', { agR: Number.NaN })).toBeNull();
  });
});
