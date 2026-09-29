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
  it('stacks what \\qquad puts side by side', () => {
    expect(narrowTex('a = 1, \\qquad b = 2')).toBe('\\begin{gathered} a = 1 \\\\ b = 2 \\end{gathered}');
  });
  it('breaks a long chain of equalities at its equal signs', () => {
    const tex = '\\delta = (\\mathbf u_J - \\mathbf u_I)\\cdot\\hat{\\mathbf e} = \\Delta u_x\\cos\\alpha + \\Delta u_z\\sin\\alpha';
    const out = narrowTex(tex);
    expect(out.startsWith('\\begin{aligned} \\delta &= ')).toBe(true);
    expect(out.split('&=').length).toBe(3);
    expect(() => katex.renderToString(out, { throwOnError: true, displayMode: true })).not.toThrow();
  });
  it('leaves short equations, and equalities inside braces, as they are', () => {
    expect(narrowTex('x = 1 = 1')).toBe('x = 1 = 1');
    const braced = '\\frac{a = b = c = d = e = f = g = h = i = j = k = l = m = n}{2} = 3';
    expect(narrowTex(braced)).toBe(braced);
  });
});
