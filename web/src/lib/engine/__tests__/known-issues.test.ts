import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import ContainmentBanner from '../../../components/ContainmentBanner.svelte';
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { knownIssueMessage, knownIssueDisposition, knownIssueRefusal, knownIssueResultDisposition } from '../known-issues';
import { setLocale } from '../../i18n';
import { dictFor, ensureLocale, isOfferedLocale } from '../../i18n/store.svelte';
import { errorText } from '../../utils/error-text';
import { OFFERED_LOCALES } from '../../i18n/offered';
import { localizeEngineText } from '../../i18n/engine-text';

afterEach(() => setLocale('en'));

describe('known-issue warnings in the reader’s language', () => {
  const d = { code: 'known_issue', phase: 'NL-5', value: 428, message: 'engine English (known issue #428, NL-5; being fixed)' };

  it('shows the app’s sentence for the id, with the issue number', () => {
    setLocale('es');
    const es = knownIssueMessage(d);
    expect(es).toMatch(/no lineales de material/);
    expect(es).toMatch(/#428/);
    setLocale('en');
    expect(knownIssueMessage(d)).toMatch(/Material-nonlinear/);
  });

  it('keeps the engine’s text for an id the app does not know, and leaves other codes alone', () => {
    expect(knownIssueMessage({ ...d, phase: 'XX-99' })).toBe(d.message);
    expect(knownIssueMessage({ code: 'residual_high', message: 'r' })).toBe('r');
  });

  it('says a thermal default was assumed in the reader’s language (#407)', () => {
    for (const phase of ['alpha', 'depth']) {
      for (const loc of ['es', 'en', 'pt'] as const) {
        setLocale(loc);
        expect(knownIssueMessage({ code: 'thermal_default_assumed', phase, message: 'ENGINE' }), `${phase} ${loc}`).not.toBe('ENGINE');
      }
    }
    expect(knownIssueMessage({ code: 'thermal_default_assumed', phase: 'other', message: 'ENGINE' })).toBe('ENGINE');
  });

  it('says a cable\'s own weight gives most of its tension, in the reader\'s language (#527)', () => {
    for (const loc of ['es', 'en', 'pt'] as const) {
      setLocale(loc);
      const m = knownIssueMessage({ code: 'cable_self_weight_tension', value: 1.55, message: 'ENGINE' });
      expect(m, loc).not.toBe('ENGINE');
      expect(m, loc).toMatch(/100 %/);
    }
    expect(knownIssueMessage({ code: 'cable_self_weight_tension', value: 0.4, message: 'ENGINE' })).toMatch(/40 %/);
  });

  it('names the member and section of a 3D plastic refusal for missing capacity, in every offered language (#1525)', async () => {
    await Promise.all(['de', 'fr', 'tr'].map(ensureLocale));
    const d = { code: 'plastic_capacity_missing', severity: 'error', elementIds: [7], value: 12, message: 'ENGINE' };
    const error = JSON.stringify({ message: 'ENGINE', structuredDiagnostics: [d] });
    for (const loc of OFFERED_LOCALES) {
      setLocale(loc);
      const m = knownIssueRefusal(error);
      expect(m, loc).not.toBe('ENGINE');
      expect(m, loc).toMatch(/\b7\b[^]*\b12\b/);
      expect(errorText(error, 'fallback'), loc).toBe(m);
    }
    setLocale('en');
    expect(knownIssueRefusal(error)).toMatch(/at least one axis[^]*either axis prevents a reliable plastic analysis/);
    expect(knownIssueRefusal(error)).not.toMatch(/never form a hinge/);
    expect(knownIssueRefusal(JSON.stringify({ message: 'ENGINE', structuredDiagnostics: [{ ...d, severity: 'warning' }] }))).toBeNull();
    expect(knownIssueMessage({ ...d, elementIds: [] })).toBe('ENGINE');
  });

  it('describes the certified lower bound and uncertified raw steps in every offered language', async () => {
    await Promise.all(['de', 'fr', 'tr'].map(ensureLocale));
    const warning = { code: 'known_issue', severity: 'warning', phase: 'PL-3D-CERTIFICATE-MISMATCH', value: 1760, message: 'ENGINE' };
    const clauses = {
      en: [/certified lower bound/, /steps and hinges/, /not certified/],
      es: [/cota inferior certificada/, /pasos y las rótulas/, /no están certificados/],
      pt: [/limite inferior certificado/, /passos e as rótulas/, /não são certificados/],
      de: [/zertifizierte untere Schranke/, /Schritte und Gelenke/, /nicht zertifiziert/],
      fr: [/borne inférieure certifiée/, /étapes et les rotules/, /ne sont pas certifiées/],
      tr: [/sertifikalı alt sınır/, /adımlar ve mafsallar/, /sertifikalandırılmamıştır/],
    };
    for (const loc of OFFERED_LOCALES) {
      setLocale(loc);
      const disposition = knownIssueDisposition([warning]);
      expect(disposition.refused, loc).toBe(false);
      expect(disposition.messages, loc).toEqual([`${dictFor(loc)['knownIssue.PL-3D-CERTIFICATE-MISMATCH']} (#1760)\n${warning.message}`]);
      for (const clause of clauses[loc]) expect(disposition.messages[0], loc).toMatch(clause);
      expect(knownIssueRefusal(JSON.stringify({ structuredDiagnostics: [warning] })), loc).toBeNull();
    }
  });

  it('translates the plastic resource-budget refusal and preserves its limit details', async () => {
    await Promise.all(['de', 'fr', 'tr'].map(ensureLocale));
    const prefix = 'exact plastic LP resource budget exceeded';
    const engine = readFileSync('../engine/src/certify/plastic_budget.rs', 'utf8');
    expect(engine).toContain(prefix);
    for (const loc of OFFERED_LOCALES) {
      setLocale(loc);
      const sentence = dictFor(loc)['plasticDiag.resourceBudget'];
      expect(sentence, loc).toBeTruthy();
      if (loc !== 'en') expect(sentence, loc).not.toBe(dictFor('en')['plasticDiag.resourceBudget']);
      for (const detail of ['dense storage bytes 2 > 1', 'exact workspace bytes 2 > 1', 'rational limb bits 2 > 1', 'simplex workspace bytes 2 > 1 after reserving 1 retained bytes']) {
        expect(localizeEngineText(`${prefix}: ${detail}`), loc).toBe(`${sentence}: ${detail}`);
      }
    }
  });

  it('has a sentence for every finding the engine contains, in every offered language', async () => {
    await Promise.all(['de', 'fr', 'tr'].map(ensureLocale));
    expect(OFFERED_LOCALES.every(isOfferedLocale)).toBe(true);
    const registry = readFileSync('../engine/src/known_issues.rs', 'utf8');
    const ids = [...registry.matchAll(/Entry \{ id: "([^"]+)"/g)].map(match => match[1]);
    expect(ids.length).toBeGreaterThan(1);
    for (const id of ids) {
      for (const loc of OFFERED_LOCALES) {
        setLocale(loc);
        const message = knownIssueMessage({ code: 'known_issue', phase: id, message: 'ENGINE' });
        expect(message, `${id} ${loc}`).not.toBe('ENGINE');
        if (loc !== 'en') {
          setLocale('en');
          expect(message, `${id} ${loc}`).not.toBe(knownIssueMessage({ code: 'known_issue', phase: id, message: 'ENGINE' }));
        }
      }
    }
  });

  it('names the unresolved buckling modes in the reader\'s language (#982)', () => {
    const engine = { code: 'known_issue', severity: 'warning', phase: 'BU-UNRESOLVED-MODE', value: 982, message: 'These buckling modes are not resolved (known issue #982, BU-UNRESOLVED-MODE): mode 3 (λ = 2.766e10), mode 4 (λ = 9.220e9)' };
    setLocale('es');
    expect(knownIssueMessage(engine)).toBe('Los modos de pandeo 3, 4 no están resueltos: el redondeo de los esfuerzos axiales puede cambiar su trabajo geométrico en más del 1 %, normalmente porque los gobiernan barras sin compresión resoluble. Sus factores de carga no son confiables y no deben usarse sin verificación independiente. (#982)');
    setLocale('en');
    expect(knownIssueMessage(engine)).toMatch(/^Buckling modes 3, 4 are not resolved: .* must not be used without independent verification\. \(#982\)$/);
  });

  it('keeps the safety-critical clauses of the English copy in Spanish and Portuguese', () => {
    const clauses: Record<string, Record<'es' | 'pt', RegExp[]>> = {
      'CERT-MECHANISM': { es: [/mecanismos/, /cota de error algebraico pequeña no demuestra la estabilidad/], pt: [/mecanismos/, /limite de erro algébrico pequeno não demonstra a estabilidade/] },
      'BU-BOUND': { es: [/Ni el factor mostrado ni el certificado/], pt: [/Nem o fator exibido nem o certificado/] },
      'FR-5': { es: [/restringir en exceso/, /de forma independiente/], pt: [/restringir em excesso/, /de forma independente/] },
      'SP-17': { es: [/no puede orientar/, /de forma independiente/], pt: [/não pode orientar/, /de forma independente/] },
      'TH-RECIPROCITY': { es: [/Todavía no se aisló/], pt: [/Ainda não se isolou/] },
    };
    for (const [id, byLocale] of Object.entries(clauses)) {
      for (const loc of ['es', 'pt'] as const) {
        for (const clause of byLocale[loc]) expect(dictFor(loc)[`knownIssue.${id}`], `${id} ${loc}`).toMatch(clause);
      }
    }
  });

  it('says a warped MITC4 or MITC9 shell is withheld above the refusal band and only warned below it (#1057)', async () => {
    await Promise.all(['de', 'fr', 'tr'].map(ensureLocale));
    for (const element of ['MITC4', 'MITC9']) {
      const phase = `SH-WARPED-${element}`;
      for (const loc of OFFERED_LOCALES) {
        setLocale(loc);
        const refused = knownIssueMessage({ code: 'known_issue', severity: 'error', phase, value: 1057, message: 'ENGINE' });
        const warned = knownIssueMessage({ code: 'known_issue', severity: 'warning', phase, value: 1057, message: 'ENGINE' });
        expect(refused, `${phase} ${loc}`).toBe(`${dictFor(loc)[`knownIssue.${phase}`]} (#1057)`);
        expect(warned, `${phase} ${loc}`).toBe(`${dictFor(loc)[`knownIssue.${phase}.warning`]} (#1057)`);
        expect(refused, `${phase} ${loc}`).toContain(element);
        expect(refused, `${phase} ${loc}`).toMatch(/5 %|%5/);
        expect(warned, `${phase} ${loc}`).toMatch(/1[.,]5/);
        expect(warned).not.toBe(refused);
      }
    }
    setLocale('en');
    const refusal = JSON.stringify({ message: 'm', structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'SH-WARPED-MITC9', value: 1057, message: 'ENGINE' }] });
    expect(knownIssueRefusal(`solver failed: ${refusal}`)).toMatch(/^Results withheld: the twist of these MITC9 shells/);
  });
});


describe('containment modes', () => {
  const warning = { code: 'known_issue', severity: 'warning', phase: 'NL-5', value: 428, message: 'Approximate' };
  it('WARN keeps results visible and provides an issue banner', () => {
    const state = knownIssueDisposition([warning]);
    expect(state.refused).toBe(false);
    expect(state.messages[0]).toContain('#428');
    const html = render(ContainmentBanner, { props: { disposition: state, children: createRawSnippet(() => ({ render: () => '<span>123.45</span>' })) } }).body;
    expect(html).toContain('role="alert"');
    expect(html).toContain('#428');
    expect(html).toContain('123.45');
    expect(knownIssueResultDisposition({ results: { structuredDiagnostics: [warning] } }).messages[0]).toContain('#428');
  });
  it('REFUSE hides results and translates the structured engine refusal', () => {
    const refusal = { ...warning, severity: 'error' };
    expect(knownIssueDisposition([refusal]).refused).toBe(true);
    const html = render(ContainmentBanner, { props: { disposition: knownIssueDisposition([refusal]), children: createRawSnippet(() => ({ render: () => '<span>123.45</span>' })) } }).body;
    expect(html).toContain('#428');
    expect(html).not.toContain('123.45');
    expect(knownIssueResultDisposition({ steps: [{ results: { structuredDiagnostics: [refusal] } }] }).refused).toBe(true);
    expect(knownIssueRefusal(JSON.stringify({ structuredDiagnostics: [refusal] }))).toContain('#428');
    expect(knownIssueRefusal('ordinary error')).toBeNull();
  });
});

for (const key of ['results', 'linearResults', 'finalResults', 'steps', 'stages', 'X', 'Y', 'caseResults', 'combinationResults', 'maxAbsResults', 'maxAbsResults3D', 'envelope', 'envelope3D']) {
  it(`collects and renders diagnostics in ${key}`, () => {
    const leaf = { structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'MD-ORTHOGONALITY', value: 759, message: 'ENGINE' }] };
    const result = { [key]: ['steps', 'stages', 'caseResults', 'combinationResults'].includes(key) ? [{ results: leaf }] : leaf };
    const disposition = knownIssueResultDisposition(result);
    expect(disposition.messages).toHaveLength(1);
    const html = render(ContainmentBanner, { props: { disposition } }).body;
    expect(html).toContain('#759');
    expect(disposition.refused).toBe(false);
  });
}
it('collects both spectral directions, deduplicates, and tolerates cycles', () => {
  const X = { structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'MD-ORTHOGONALITY', value: 759, message: 'ENGINE' }] };
  const Y = { structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'NL-DYNAMIC-GAPS', value: 370, message: 'ENGINE' }] };
  const result: Record<string, unknown> = { X, Y, results: X };
  expect(knownIssueResultDisposition(result).messages).toHaveLength(2);
  result.results = result;
  expect(knownIssueResultDisposition(result).messages).toHaveLength(2);
});
it('withholds the spectral panel when only Y carries a refusal', () => {
  const disposition = knownIssueResultDisposition({
    X: { structuredDiagnostics: [] },
    Y: { structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'withheld' }] },
  });
  const html = render(ContainmentBanner, { props: { disposition, children: createRawSnippet(() => ({ render: () => '<span>123.45</span>' })) } }).body;
  expect(disposition.refused).toBe(true);
  expect(html).toContain('#741');
  expect(html).not.toContain('123.45');
});
it('refuses an envelope whose maxAbsResults3D carries a refusal', () => {
  const refusal = { code: 'known_issue', severity: 'error', phase: 'SH-MITC4-DISTORTION', value: 798, message: 'ENGINE' };
  expect(knownIssueResultDisposition({ maxAbsResults3D: { structuredDiagnostics: [refusal] } }).refused).toBe(true);
  expect(knownIssueResultDisposition({ envelope3D: { maxAbsResults3D: { structuredDiagnostics: [refusal] } } }).refused).toBe(true);
  expect(knownIssueResultDisposition({ unrelated: { structuredDiagnostics: [refusal] } }).refused).toBe(false);
});
it('refuses a moving-load result whose positions are clean but whose full envelope carries a refusal', () => {
  const refusal = { code: 'known_issue', severity: 'error', phase: 'SH-MITC4-DISTORTION', value: 798, message: 'ENGINE' };
  const positions = [{ results: { structuredDiagnostics: [] } }];
  expect(knownIssueResultDisposition({ structuredDiagnostics: [], positions, fullEnvelope: { maxAbsResults: { structuredDiagnostics: [] } } }).refused).toBe(false);
  expect(knownIssueResultDisposition({ structuredDiagnostics: [], positions, fullEnvelope: { maxAbsResults: { structuredDiagnostics: [refusal] } } }).refused).toBe(true);
});

describe('the result walker finds a refusal wherever a bundle keeps it', () => {
  const refused = { structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' }] };
  it.each([
    ['a vertical spectral direction', { X: {}, Y: {}, Z: refused }],
    ['a per-case Map', new Map([[1, refused]])],
    ['a bundle with a per-combination Map', { perCase: new Map([[1, {}]]), perCombo: new Map([[2, refused]]) }],
    ['a moving-load position', { positions: [{ refPosition: 0, results: refused }] }],
  ])('%s', (_label, source) => {
    const d = knownIssueResultDisposition(source);
    expect(d.refused).toBe(true);
    expect(d.messages.join()).toContain('#741');
  });
});


it('translates cable and frozen-contact refusals in all six languages', async () => {
  for (const loc of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
    setLocale(loc);
    await ensureLocale(loc);
    for (const [code, key] of [['cable_analysis_required', 'cable'], ['contact_state_invalid', 'contact']] as const) {
      const d = { code, severity: 'error', elementIds: [7, 9], message: 'ENGINE' };
      const error = JSON.stringify({ message: 'ENGINE', structuredDiagnostics: [d] });
      const translated = dictFor(loc)[`analysisValidity.${key}`].replace('{elements}', '7, 9');
      expect(knownIssueRefusal(error), `${code} ${loc}`).toBe(translated);
      expect(errorText(error, 'fallback'), `${code} ${loc}`).toBe(translated);
      if (code === 'contact_state_invalid') {
        expect(errorText(JSON.stringify({ structuredDiagnostics: [{ ...d, elementIds: [], nodeIds: [7, 9] }] }), 'fallback')).toBe(translated);
      }
      expect(knownIssueRefusal(JSON.stringify({ structuredDiagnostics: [{ ...d, severity: 'warning' }] }))).toBeNull();
    }
  }
  setLocale('en');
});

it.skip('known wrong result: #432: translates invalid contact tolerance in six locales', async () => {
  for (const loc of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
    setLocale(loc);
    await ensureLocale(loc);
    const error = JSON.stringify({ structuredDiagnostics: [{ code: 'contact_tolerance_invalid', severity: 'error', message: 'ENGINE' }] });
    const translated = dictFor(loc)['analysisValidity.contactTolerance'];
    expect(translated).toBeTruthy();
    expect(knownIssueRefusal(error)).toBe(translated);
    expect(errorText(error, 'fallback')).toBe(translated);
  }
  setLocale('en');
});
