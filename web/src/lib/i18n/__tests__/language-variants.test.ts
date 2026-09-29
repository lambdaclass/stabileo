/**
 * Each dictionary speaks one variant of its language: US English, Brazilian
 * Portuguese and Rioplatense Spanish (voseo). A dedicated audit found all
 * three mixed with their neighbours, colour next to color, ficheiro next to
 * arquivo, "seleccione" next to "seleccioná", because each string had been
 * written on its own. These are the forms that audit removed; a new string
 * that brings one back fails here, whatever part of the app it is for.
 */
import { describe, it, expect } from 'vitest';
import en from '../locales/en';
import es from '../locales/es';
import pt from '../locales/pt';
import steelEn from '../locales/steel/en';
import steelEs from '../locales/steel/es';
import steelPt from '../locales/steel/pt';
import { stepsEn, stepsEs, stepsPt } from '../locales/steps';

const merged = {
  en: { ...en, ...steelEn, ...stepsEn } as Record<string, string>,
  es: { ...es, ...steelEs, ...stepsEs } as Record<string, string>,
  pt: { ...pt, ...steelPt, ...stepsPt } as Record<string, string>,
};

function offenders(dict: Record<string, string>, re: RegExp): string[] {
  return Object.entries(dict).filter(([, v]) => re.test(v)).map(([k, v]) => `${k}: ${v.match(re)![0]}`);
}

describe('each dictionary speaks one variant', () => {
  it('English is US English', () => {
    const british = /\b(colours?|centres?|centred|utilisation|fibres?|metres?|catalogues?|behaviours?|modell(?:ing|ed)|analys(?:e|ed|ing)|counter-clockwise|neighbours?|favourable|aluminium|storeys?)\b/i;
    expect(offenders(merged.en, british)).toEqual([]);
  });
  it('Portuguese is Brazilian Portuguese', () => {
    const european = /\b(ficheiros?|ecrãs?|registos?|utilizadores?|encurvadura|noutro|percentagem)\b/i;
    expect(offenders(merged.pt, european)).toEqual([]);
  });
  it('Spanish addresses the reader with vos', () => {
    // "se verifique" and "haga falta" are not addressed to the reader.
    const usted = /\b(haga(?! falta)|elija|seleccione|presione|ingrese|(?<!se )verifique|asegúrese|revise|intente|elimínelo|conéctelo|cambie a|considere|sepárelas)\b/i;
    expect(offenders(merged.es, usted)).toEqual([]);
  });
});
