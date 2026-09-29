import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { proseParts } from '../format';
import { narrowTex } from '../narrow-tex';

describe('words with subscripts', () => {
  it('sets what follows an underscore as a subscript', () => {
    expect(proseParts('p₁ = θ_I − ψ')).toEqual([{ text: 'p₁ = θ', kind: 'text' }, { text: 'I', kind: 'sub' }, { text: ' − ψ', kind: 'text' }]);
    expect(proseParts('u_{x,B} y M_ij·x')).toEqual([
      { text: 'u', kind: 'text' }, { text: 'x,B', kind: 'sub' }, { text: ' y M', kind: 'text' }, { text: 'ij', kind: 'sub' }, { text: '·x', kind: 'text' },
    ]);
    expect(proseParts('t_{Q/P}')).toEqual([{ text: 't', kind: 'text' }, { text: 'Q/P', kind: 'sub' }]);
  });
  it('and what follows a caret as a superscript', () => {
    expect(proseParts('V^s y P^{0}')).toEqual([
      { text: 'V', kind: 'text' }, { text: 's', kind: 'sup' }, { text: ' y P', kind: 'text' }, { text: '0', kind: 'sup' },
    ]);
  });
  it('leaves words without one alone', () => {
    expect(proseParts('Sin subíndices.')).toEqual([{ text: 'Sin subíndices.', kind: 'text' }]);
    expect(proseParts('')).toEqual([{ text: '', kind: 'text' }]);
    expect(proseParts('a _ b')).toEqual([{ text: 'a _ b', kind: 'text' }]);
  });
});

describe('display mathematics on a narrow panel', () => {
  const ok = (tex: string) => expect(() => katex.renderToString(tex, { throwOnError: true, displayMode: true })).not.toThrow();
  it('level 0 stacks only what \\qquad puts side by side', () => {
    expect(narrowTex('a = 1, \\qquad b = 2')).toBe('\\begin{gathered} a = 1 \\\\ b = 2 \\end{gathered}');
    const chain = '\\delta = (\\mathbf u_J - \\mathbf u_I)\\cdot\\hat{\\mathbf e} = \\Delta u_x\\cos\\alpha + \\Delta u_z\\sin\\alpha';
    expect(narrowTex(chain)).toBe(chain);
  });
  it('level 1 breaks a chain of relations at its signs, and stacks lists', () => {
    const chain = '\\delta = (\\mathbf u_J - \\mathbf u_I)\\cdot\\hat{\\mathbf e} = \\Delta u_x\\cos\\alpha + \\Delta u_z\\sin\\alpha';
    const out = narrowTex(chain, 1);
    expect(out.startsWith('\\begin{aligned} \\delta &= ')).toBe(true);
    expect(out.split('&=').length).toBe(3);
    ok(out);
    expect(narrowTex('N_{AB} = -41.92, N_{BC} = -13.32, N_{DC} = -48.08', 1)).toBe('\\begin{gathered} N_{AB} = -41.92 \\\\ N_{BC} = -13.32 \\\\ N_{DC} = -48.08 \\end{gathered}');
    const implied = '\\sum M_B = 0 :\\quad \\hat M_{AB} + \\hat M_{BA} + M_{q,B} - V_{AB} L = 0 \\Rightarrow V_{AB} = \\frac{a}{L}';
    const o2 = narrowTex(implied, 1);
    expect(o2).toContain('&\\Rightarrow V_{AB}');
    ok(o2);
  });
  it('a box holding a list becomes one box per item', () => {
    const out = narrowTex('\\boxed{N_{AB} = -41.92,\\ N_{BC} = -13.32, N_{DC} = -48.08}', 1);
    expect(out.match(/\\boxed/g)?.length).toBe(3);
    ok(out);
  });
  it('levels 2 and 3 break long sums before + and −, never inside a group', () => {
    const sum = 'M_{i-1} L\'_i + 2 M_i (L\'_i + L\'_{i+1}) + M_{i+1} L\'_{i+1} = -6 EI_c (\\alpha_{ij} + \\alpha_{ji}) + 1234.5 - 678.9';
    const two = narrowTex(sum, 2), three = narrowTex(sum, 3);
    ok(two); ok(three);
    expect(three.split('\\\\').length).toBeGreaterThanOrEqual(two.split('\\\\').length);
    expect(three).toContain('(L\'_i + L\'_{i+1})');
    expect(three).toContain('(\\alpha_{ij} + \\alpha_{ji})');
  });
  it('lays out rows a step already stacked, and a box with its unit, one by one', () => {
    const rows = narrowTex('\\begin{aligned} M_{AB} &= 0 + 10125 \\cdot (-0.001243) + 7594 \\cdot (0.001613) \\\\ M_{BA} &= 0 + 20250 \\cdot (-0.001243) + 7594 \\cdot (0.001613) \\end{aligned}', 3);
    expect(rows.startsWith('\\begin{gathered}')).toBe(true);
    ok(rows);
    const unit = narrowTex('\\boxed{N_{AB} = -45,\\ N_{BC} = -18.32,\\ N_{DC} = -45}\\ \\mathrm{kN}', 1);
    expect(unit.match(/\\mathrm\{kN\}/g)?.length).toBe(3);
    ok(unit);
  });
  it('the last level breaks inside plain brackets', () => {
    const tex = '-\\{(-0.25)[(10125\\theta_B + 7594\\Delta_1) + (20250\\theta_B + 7594\\Delta_1)] + (-0.25)[(10125\\theta_C + 7594\\Delta_1) + (20250\\theta_C + 7594\\Delta_1)]\\} = 10';
    const four = narrowTex(tex, 4);
    ok(four);
    expect(four.split('\\\\').length).toBeGreaterThan(narrowTex(tex, 3).split('\\\\').length);
  });
  it('leaves what has nothing to break as it is', () => {
    expect(narrowTex('x = 1', 3)).toBe('x = 1');
    const braced = '\\frac{a = b = c = d}{2} = 3';
    expect(narrowTex(braced, 1)).toBe(braced);
    const env = '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}';
    expect(narrowTex(env, 3)).toBe(env);
  });
});
