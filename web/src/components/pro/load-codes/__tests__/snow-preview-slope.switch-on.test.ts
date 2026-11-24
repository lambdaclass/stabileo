import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Asce7SnowInputs from '../asce7/Asce7SnowInputs.svelte';
import Ts498SnowInput from '../turkey/Ts498SnowInput.svelte';
import { publicI18n, setLocale } from '../../../../lib/i18n/store.svelte';

const original = publicI18n.locale;
afterEach(() => setLocale(original));
const text = (html: string, testid: string) => (html.match(new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`))?.[1] ?? '').replace(/&amp;/g, '&');
const noop = () => {};

describe('a roof slope left to the model is not previewed as 0°', () => {
  it('ASCE 7: pf only, with Cs, ps and pm left blank until the slope or Cs is typed', () => {
    setLocale('en');
    const blank = text(render(Asce7SnowInputs, { props: { value: { pg: 1, slippery: true }, onchange: noop } }).body, 'asce7-snow-preview');
    expect(blank).toContain('pf = 0.700');
    expect(blank).toContain('Cs = —');
    expect(blank).toContain('ps = —');
    expect(blank).toContain('pm = —');
    const typed = text(render(Asce7SnowInputs, { props: { value: { pg: 1, slippery: true, roofSlopeDeg: 10 }, onchange: noop } }).body, 'asce7-snow-preview');
    expect(typed).not.toContain('—');
    const cs = text(render(Asce7SnowInputs, { props: { value: { pg: 1, cs: 0.5 }, onchange: noop } }).body, 'asce7-snow-preview');
    expect(cs).toContain('Cs = 0.500');
    expect(cs).toContain('ps = 0.350');
    expect(cs).toContain('pm = —');
  });
  it('TS 498: Pk0 only, with m and Pk left blank until the slope is typed', () => {
    setLocale('en');
    const blank = text(render(Ts498SnowInput, { props: { value: { zone: 'II', altitudeM: 900 }, onchange: noop } }).body, 'tr-snow-preview');
    expect(blank).toMatch(/m = —, Pk = —/);
    const typed = text(render(Ts498SnowInput, { props: { value: { zone: 'II', altitudeM: 900, roofSlopeDeg: 45 }, onchange: noop } }).body, 'tr-snow-preview');
    expect(typed).not.toContain('—');
    const sliding = text(render(Ts498SnowInput, { props: { value: { zone: 'II', altitudeM: 900, slidingPrevented: true }, onchange: noop } }).body, 'tr-snow-preview');
    expect(sliding).toContain('m = 1.00');
  });
});
