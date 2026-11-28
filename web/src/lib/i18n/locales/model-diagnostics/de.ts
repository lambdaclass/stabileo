import type { Translations } from '../../types';

const messages: Translations = {
  "foundation.inconsistentPlateSprings": "Die Knotenfedern müssen der Bettungssteifigkeit, der Abhebeeinstellung und den horizontalen Bindungen jeder Platte entsprechen. Prüfen Sie die Platten und weisen Sie die Bettung erneut zu.",
  "foundation.mixedSoilSelection": "Ein einzelnes Schalenelement und eine ganze gebettete Platte teilen einen Gründungsknoten. Trennen Sie die Zuweisungen oder wählen Sie kompatible ganze Platten aus.",
  "diag.model.flangeTwice": "Träger mit T-Querschnitt unter einer ebenfalls modellierten Decke: der Gurt zählt in der Steifigkeit doppelt. Den Steg rechteckig und die Decke als Schalen modellieren; den Gurt berücksichtigt die Bemessung über die Bemessungsdaten.",
  "diag.tooltip.MODEL_FLANGE_TWICE": "T-Querschnitt und modellierte Decke: Gurt doppelt",
  'pro.plates.diag.looseCorner': "Platte mit Knoten, die mit nichts anderem verbunden sind (kein Stab, kein Lager, keine andere Platte): Dort wird keine Last übertragen",
  "plates.meshedAtAnalysisKept": "{n} Platten vor der Berechnung vernetzt ({cells} Elemente); die übrigen {kept} behielten ihr Netz.",
  'svc.engine.conflictingConstraints': 'Freiheitsgrad {dof} (Knoten {node}) wird von {n} Kopplungen bestimmt; nur die letzte gilt',
  'diag.detail.nodes': 'Knoten',
  'diag.detail.cases': 'Fälle',
  'diag.detail.computed': 'berechnet',
  'diag.detail.limit': 'Grenze',
  'diag.detail.ratio': 'Verhältnis',
  'diag.detail.value': 'Wert',
  'diag.detail.dofIndices': 'Freiheitsgrade',
  'diag.detail.n': 'Anzahl',
  'diag.detail.add': 'hinzuzufügen',
  'diag.detail.change': 'zu ändern',
  'diag.detail.remove': 'zu entfernen',
  "plates.analysisStale": "Diese Platten wurden mit ihrem veralteten Netz berechnet: {names}. Es ist weiterhin ein gültiges Netz, folgt aber den letzten Änderungen des Modells nicht; vernetzen Sie sie oder aktivieren Sie „Vor der Berechnung vernetzen“.",
  'xls.err.duplicatePhysicalColumn': 'Die Spalte für die physikalische Größe {k} ist mehrfach vorhanden.',
  'xls.err.duplicateLoadSheet': 'Es ist nur ein Blatt mit dem Namen {sheet} zulässig.',
  'plates.diag.looseCorner': "Platte mit Knoten, die mit nichts anderem verbunden sind (kein Stab, kein Lager, keine andere Platte): Dort wird keine Last übertragen",
};

export default messages;
