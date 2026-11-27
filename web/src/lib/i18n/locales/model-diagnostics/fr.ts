import type { Translations } from '../../types';

const messages: Translations = {
  "foundation.inconsistentPlateSprings": "Les ressorts nodaux doivent correspondre au module de réaction du sol, au réglage du soulèvement et aux blocages horizontaux de chaque plaque. Vérifiez les plaques et réappliquez les paramètres de fondation.",
  "foundation.mixedSoilSelection": "Un élément de coque et une plaque entière sur ressorts partagent un nœud de fondation. Séparez leurs affectations ou sélectionnez des plaques entières compatibles.",
  "diag.model.flangeTwice": "Poutres à section en T sous une dalle également modélisée : la table compte deux fois dans la rigidité. Modélisez l’âme rectangulaire et la dalle en coques ; la table est prise dans le dimensionnement depuis les données de calcul.",
  "diag.tooltip.MODEL_FLANGE_TWICE": "Section en T et dalle modélisée : la table compte deux fois",
  'pro.plates.diag.looseCorner': "Plaque avec des nœuds reliés à rien d'autre (ni barre, ni appui, ni autre plaque) : aucune charge n'y est transmise",
  "plates.meshedAtAnalysisKept": "{n} plaques maillées avant le calcul ({cells} éléments) ; les {kept} autres ont gardé leur maillage.",
  'svc.engine.conflictingConstraints': 'Le degré de liberté {dof} (nœud {node}) est soumis à {n} liaisons ; seule la dernière s’applique',
  'diag.detail.nodes': 'nœuds',
  'diag.detail.cases': 'cas',
  'diag.detail.computed': 'calculé',
  'diag.detail.limit': 'limite',
  'diag.detail.ratio': 'rapport',
  'diag.detail.value': 'valeur',
  'diag.detail.dofIndices': 'degrés de liberté',
  'diag.detail.n': 'nombre',
  'diag.detail.add': 'à ajouter',
  'diag.detail.change': 'à modifier',
  'diag.detail.remove': 'à supprimer',
  "plates.analysisStale": "Ces plaques ont été calculées avec leur maillage obsolète : {names}. Il reste un maillage valide, mais ne suit pas les dernières modifications du modèle ; maillez-les ou activez « Mailler avant le calcul ».",
  'xls.err.duplicatePhysicalColumn': 'La colonne de grandeur physique {k} apparaît plusieurs fois.',
  'xls.err.duplicateLoadSheet': 'Une seule feuille nommée {sheet} est autorisée.',
  'plates.diag.looseCorner': "Plaque avec des nœuds reliés à rien d'autre (ni barre, ni appui, ni autre plaque) : aucune charge n'y est transmise",
};

export default messages;
