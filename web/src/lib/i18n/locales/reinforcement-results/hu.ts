import type { Translations } from '../../types';

const messages: Translations = {
  "seisDes.issue.confinementUnassessed": "A körülzárás nincs igazolva. Az oszlop vasalásának részletezése előtt ellenőrizze a rögzített normálerőket és a kengyelek elrendezését.",
  "detailing.cutoff.unverified": "{element} gerenda, x = {x} m. A helyi nyírási ellenállás és a vasalás alapján a betonacél itt nem végződhet igazoltan.",
  "detailing.schedule.spliceNote": "A(z) {mark} jelű vas ({length} m) hosszabb a {stock} m-es kereskedelmi szálnál, toldás kell.",
  'project.adoptedReinforcementIgnored': "Ez a verzió figyelmen kívül hagyja a projektben mentett, elfogadott vasalást, és a méretezett vasalást használja.",
  'wall.boundaryBarCount': "A fal mindkét végén adja meg a peremvasak számát nemnegatív egész számként.",
  'wall.tensionAtOpenings': "Nyílásos fal húzási ellenőrzéséhez szükséges a nettó keresztmetszet és az azon átmenő folytonos vasalás.",
  'wall.tensionRequiresBarLayout': "Együttes húzás és hajlítás esetén szükséges a függőleges vasalás kiosztása.",
  'wall.tensionShearEdition': "A fal együttes húzása és nyírása a(z) {edition} kiadás szerint nem ellenőrizhető.",
};

export default messages;
