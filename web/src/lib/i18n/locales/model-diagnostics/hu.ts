import type { Translations } from '../../types';

const messages: Translations = {
  "diag.model.flangeTwice": "T keresztmetszetű gerendák egy szintén modellezett födém alatt: az öv kétszer számít a merevségbe. A gerincet téglalapként, a födémet héjként érdemes modellezni; az övet a méretezés a Tervezési adatokból veszi figyelembe.",
  "diag.tooltip.MODEL_FLANGE_TWICE": "T keresztmetszet és modellezett födém: az öv kétszer számít",
  "pro.plates.diag.looseCorner": "Lemez olyan csomópontokkal, amelyek semmi máshoz nem kapcsolódnak (sem rúdhoz, sem támaszhoz, sem másik lemezhez): ott nem adódik át teher",
  "plates.meshedAtAnalysisKept": "{n} lemez hálózva az analízis előtt ({cells} elem); a többi {kept} megtartotta a hálóját.",
  "svc.engine.conflictingConstraints": "A(z) {dof} szabadságfokot ({node}. csomópont) {n} kényszer köti; csak az utolsó érvényes",
  "diag.detail.nodes": "csomópontok",
  "diag.detail.cases": "esetek",
  "diag.detail.computed": "számított",
  "diag.detail.limit": "határérték",
  "diag.detail.ratio": "arány",
  "diag.detail.value": "érték",
  "diag.detail.dofIndices": "szabadságfokok",
  "diag.detail.n": "darabszám",
  "diag.detail.add": "hozzáadandó",
  "diag.detail.change": "módosítandó",
  "diag.detail.remove": "eltávolítandó",
  "plates.analysisStale": "Ezeket a lemezeket elavult hálójukkal számoltuk: {names}. Ez továbbra is érvényes háló, de nem követi a modell legutóbbi változásait; hálózza őket, vagy kapcsolja be a „Hálózás analízis előtt” beállítást.",
  'xls.err.duplicatePhysicalColumn': 'A(z) {k} fizikai mennyiség oszlopa többször szerepel.',
  'xls.err.duplicateLoadSheet': 'Csak egy {sheet} nevű munkalap engedélyezett.',
  "plates.diag.looseCorner": "Lemez olyan csomópontokkal, amelyek semmi máshoz nem kapcsolódnak (sem rúdhoz, sem támaszhoz, sem másik lemezhez): ott nem adódik át teher",
};

export default messages;
