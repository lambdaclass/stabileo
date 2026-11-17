import { describe, expect, it } from 'vitest';
import es from '../locales/es';
import en from '../locales/en';
import pt from '../locales/pt';
import de from '../locales/de';
import fr from '../locales/fr';
import tr from '../locales/tr';
import hu from '../locales/hu';
import { SAME_AS_ENGLISH as SAME_DE } from '../locales/same-as-english/de';
import { SAME_AS_ENGLISH as SAME_FR } from '../locales/same-as-english/fr';
import { SAME_AS_ENGLISH as SAME_TR } from '../locales/same-as-english/tr';
import { SAME_AS_ENGLISH as SAME_HU } from '../locales/same-as-english/hu';

const all = { es, en, pt, de, fr, tr, hu } as Record<string, Record<string, string>>;
const each = (key: string) => Object.entries(all).map(([l, d]) => [l, d[key]!] as const);

describe('code clauses as the code words them', () => {
  it('ACI 318-19 §9.4.3.1 for face moments and §9.4.3.2 for shear at d, each cited', () => {
    for (const [l, s] of each('rcSheets.opt.faces')) {
      expect(s, l).toContain('§9.4.3.1');
      expect(s, l).toContain('§9.4.3.2');
      expect(s.indexOf('§9.4.3.1'), l).toBeLessThan(s.indexOf('§9.4.3.2'));
    }
  });
  it('ACI 318-19 §10.7.4.1: separate dowels from an offset of 75 mm or more, the limit included', () => {
    expect(en['rcSheets.v.colOffset']).toContain('7.5 cm or more');
    expect(es['rcSheets.v.colOffset']).toContain('7,5 cm o más');
    for (const [l, s] of each('rcSheets.v.colOffset')) expect(s, l).not.toMatch(/more than|más de|mais de|über 7|plus de|cm.den fazla|több mint/);
  });
  it('EN 1991-1-4 Table 4.1, terrain IV: at least 15 % covered, by buildings of average height over 15 m', () => {
    expect(en['loads.ec.terrain.IV']).toBe('at least 15 % covered by buildings whose average height exceeds 15 m');
    expect(es['loads.ec.terrain.IV']).toContain('altura media');
    for (const [l, s] of each('loads.ec.terrain.IV')) expect(s, l).not.toMatch(/^(over|más del|mais de|über|plus de|%15’ten fazlası|több mint)/);
  });
  it('EN 1992-1-1 §7.3.3(1): the exemption names its conditions, not the thickness alone', () => {
    for (const [l, s] of each('rcSheets.ec2.s.crackThin')) {
      expect(s, l).toContain('200 mm');
      expect(s, l).toContain('§9.3');
    }
  });
  it('the French status for generous reinforcement does not read as "wide"', () => {
    expect(fr['rcSheets.status.warn']).not.toBe('Large');
  });
  it('literal decimals take the locale\'s comma, and the line is no longer exempt from translation', () => {
    for (const l of ['de', 'fr', 'tr', 'hu']) expect(all[l]!['loads.cirsoc101.reduction.applied'], l).toContain('0,25 + 4,57');
    for (const list of [SAME_DE, SAME_FR, SAME_TR, SAME_HU]) expect(list).not.toContain('loads.cirsoc101.reduction.applied');
  });
});
