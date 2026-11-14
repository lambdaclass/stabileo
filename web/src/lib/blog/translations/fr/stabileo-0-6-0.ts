import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.0 : recalculez les projets concernés",
  "excerpt": "Recalculez les analyses concernées et revoyez les résultats déjà utilisés. SA-2026-048 à SA-2026-063 expliquent quoi vérifier ; SA-2026-056 reste non corrigé.",
  "blocks": [
    {
      "k": "p",
      "t": "Recalculez les cas, combinaisons et historiques non linéaires ou par phases complets concernés. Comparez déplacements, efforts, réactions et sollicitations de dimensionnement aux résultats déjà utilisés. Réexaminez les calculs remis et les dimensionnements fondés sur eux. Chaque avis précise les données concernées et les mesures à prendre. Un refus ou une grandeur indisponible ne fournit aucun résultat de remplacement : cela ne signifie ni sollicitation nulle ni vérification réussie."
    },
    {
      "k": "note",
      "t": "Les avis SA-2026-048 à SA-2026-063 ont été ajoutés après v0.5.0. Les corrections ci-dessous sont incluses dans 0.6.0, sauf SA-2026-056, qui reste non corrigé. Revérifiez les fonctions indiquées même si le calcul précédent convergeait ou si ses déplacements semblaient plausibles."
    },
    {
      "k": "h",
      "t": "Avis de sécurité"
    },
    {
      "k": "table",
      "caption": "Avis de sécurité SA-2026-048 à SA-2026-063",
      "head": [
        "Avis",
        "Gravité",
        "Changement et mesure à prendre"
      ],
      "rows": [
        [
          "SA-2026-048",
          "Élevée",
          "Le CIRSOC 301 omettait les moments d’extrémité dans Mmax pour toute section avec un tronçon non maintenu raccourci ; les profilés U et T en double courbure pouvaient aussi perdre un changement de signe. Revérifiez tous les éléments CIRSOC 301 avec un Lb déclaré inférieur à la longueur de l’élément, y compris les vérifications de l’acier et les propositions de l’optimiseur."
        ],
        [
          "SA-2026-049",
          "Élevée",
          "Un blocage rigide avec ressort pouvait devenir un appui élastique en 3D. Choisissez explicitement la condition voulue et recalculez les analyses concernées."
        ],
        [
          "SA-2026-050",
          "Moyenne",
          "Un calcul d’élancement en échec pouvait devenir zéro et les résultats multicas contenaient parfois des valeurs non finies. Écartez ces valeurs, vérifiez les données et recalculez."
        ],
        [
          "SA-2026-051",
          "Élevée",
          "Les charges mobiles 3D omettaient les pics intérieurs et la composante axiale du poids des essieux. Recalculez les enveloppes et revoyez le dimensionnement et les sollicitations."
        ],
        [
          "SA-2026-052",
          "Élevée",
          "Les enveloppes axiales mobiles 2D/3D omettaient les limites des charges réparties. Recalculez et vérifiez les extrêmes axiaux intérieurs ; réduire le pas du convoi ne suffit pas."
        ],
        [
          "SA-2026-053",
          "Faible",
          "Les enveloppes mobiles incluaient des limites d’effort extérieures aux charges d’extrémité. Recalculez les enveloppes axiales et de cisaillement et revoyez le dimensionnement en conservant les réactions dans les bilans."
        ],
        [
          "SA-2026-054",
          "Élevée",
          "Les calculs linéaires pouvaient rendre une réponse avec rigidité non résolue ou omettre une composante de charge. Recalculez les cas et combinaisons statiques ; vérifiez indépendamment les sollicitations si le solveur corrigé refuse."
        ],
        [
          "SA-2026-055",
          "Élevée",
          "P-Delta sous-estimait l’amplification sous charges axiales le long des barres. Recalculez les analyses et vérifications dérivées, vérifiez la convergence du maillage et réévaluez la stabilité."
        ],
        [
          "SA-2026-056",
          "Élevée",
          "Non corrigé : la dynamique des modèles mixtes portiques-coques avec contraintes change entre descriptions équivalentes. Vérifiez indépendamment les sollicitations avant utilisation ; aucun facteur correctif conservateur n’est établi."
        ],
        [
          "SA-2026-057",
          "Moyenne",
          "L’affichage plastique pouvait déclarer intérieur un facteur hors intervalle. Recalculez les certificats et comparez les bornes exactes. Un refus pour ressources ne prouve pas l’absence de mécanisme."
        ],
        [
          "SA-2026-058",
          "Élevée",
          "Les grands modèles harmoniques conservaient des réponses inexactes des modes omis. Relancez les balayages et examinez amplitude, phase et pics, y compris aux fréquences hors couverture de l’avertissement de troncature."
        ],
        [
          "SA-2026-059",
          "Élevée",
          "Les analyses web avancées donnaient une résistance en compression aux câbles. Utilisez le solveur de câbles dédié pris en charge ou une analyse indépendante ; les calculs avancés avec câbles sont désormais explicitement refusés."
        ],
        [
          "SA-2026-060",
          "Élevée",
          "La rigidité artificielle de rotation par phases modifiait translations et efforts. Recalculez les historiques complets avec relâchements ou ressorts d’appui et revoyez les sollicitations dérivées."
        ],
        [
          "SA-2026-061",
          "Élevée",
          "Les réactions de cheminement manquaient ou étaient récupérées à la mauvaise charge ; des efforts par phases ou dynamiques pouvaient manquer. Recalculez et revoyez les demandes aux appuis, assemblages et fondations. Un effort indisponible n’est pas nul ; les réactions dynamiques totales restent indisponibles."
        ],
        [
          "SA-2026-062",
          "Élevée",
          "Un refus élastique initial pouvait devenir un résultat brut de facteur d’effondrement plastique 3D nul déclaré réussi. Recalculez les analyses concernées ; un refus numérique ne prouve pas un effondrement à charge nulle."
        ],
        [
          "SA-2026-063",
          "Élevée",
          "Les contraintes perdaient le mouvement imposé du nœud maître bloqué. Recalculez les historiques complets et examinez déplacements, efforts et réactions avec SA-2026-061. Les mouvements d’appui non pris en charge des câbles ou analyses temporelles sont désormais refusés."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Index des avis de sécurité",
      "t": "Consultez chaque avis applicable pour les données concernées et les mesures à prendre :"
    },
    {
      "k": "h",
      "t": "Autres changements qui affectent les résultats"
    },
    {
      "k": "p",
      "t": "Le registre des résultats s’arrête à la version 49 dans 0.5.0 et atteint 78 dans 0.6.0. Le tableau présente d’autres changements à examiner avec les avis ci-dessus. Recalculez chaque analyse couverte par un avis applicable et comparez ses résultats. La liste complète, y compris les vérifications remplacées ou retirées, figure dans les notes de version."
    },
    {
      "k": "table",
      "caption": "Sélection d’avis de changement des résultats depuis 0.5.0",
      "head": [
        "Version de résultats",
        "Résultat modifié"
      ],
      "rows": [
        [
          "50",
          "2D : les rotations tenues seulement par des connecteurs, qui les laissent libres, sont refusées"
        ],
        [
          "52",
          "3D : les rotations de nœud qu'un connecteur couple mais laisse libres sont refusées"
        ],
        [
          "53",
          "Le flambement ne prend plus de rigidité géométrique d’efforts normaux qui ne sont que des arrondis. En 2D et 3D, les éléments dont les efforts normaux ne se distinguent pas des arrondis ne contribuent pas à la rigidité géométrique. L’analyse est refusée si leur compression possible peut abaisser le facteur critique de plus de 1 %."
        ],
        [
          "54",
          "L’aire nette d’une attache boulonnée en quinconce prend sa pire ligne de rupture, et une attache boulonnée de tous les éléments exige des boulons dans l’âme"
        ],
        [
          "56",
          "Les appuis inclinés 3D comptent les blocages dans un repère commun"
        ],
        [
          "58",
          "Les bases modales utilisent l’échelle d’arrondi de chaque entrée de Gram de masse"
        ],
        [
          "59",
          "L’analyse plastique 3D vérifiée renvoie la borne inférieure certifiée"
        ],
        [
          "61",
          "Le contrôle en charge des fibres de béton affine son intervalle d’arrêt"
        ],
        [
          "63",
          "L'analyse linéaire refuse un mécanisme ou une rigidité non résoluble au lieu de le résoudre avec un avertissement"
        ],
        [
          "65",
          "Les contacts figés invalides et les analyses de câbles comme barres sont refusés"
        ],
        [
          "66",
          "Les bornes d’arrondi du flambement suivent le couplage réel des contraintes"
        ],
        [
          "67",
          "Les facteurs de flambement utilisent les matrices de rigidité originales"
        ],
        [
          "68",
          "L’équilibre plastique utilise les identifiants du modèle résolu et le certificat limite chaque candidat"
        ],
        [
          "69",
          "La convergence non linéaire suit l’équilibre physique"
        ],
        [
          "71",
          "Inclure les actions transversales des barres de treillis dans l’équilibre conditionnel"
        ],
        [
          "72",
          "La continuation en longueur d’arc regroupe le calcul de la charge de référence"
        ],
        [
          "73",
          "L’analyse modale préserve l’espace physique de la masse"
        ],
        [
          "75",
          "SSI corrige les résidus élastiques stagnants"
        ],
        [
          "76",
          "La réduction des contraintes conserve l’incertitude directionnelle"
        ],
        [
          "78",
          "Charges compatibles avec les rotations libérées"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.fr.md",
      "label": "Notes complètes de la version 0.6.0",
      "t": "Tous les avis de changement des résultats, avec les liens vers leur portée et leurs preuves :"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Un dialogue de réexamen des résultats dans Stabileo Basic, listant les changements qui concernent un projet enregistré auparavant.",
      "caption": "Le dialogue de réexamen des résultats illustré dans l’article de la version 0.5.0."
    },
    {
      "k": "h",
      "t": "Deux avis décrivent des comportements déjà présents dans 0.5.0"
    },
    {
      "k": "p",
      "t": "Ces deux avis ont été enregistrés ultérieurement. Les changements correspondants étaient déjà dans v0.5.0 ; ce ne sont donc pas de nouveaux changements numériques de cette version. Ils peuvent néanmoins apparaître dans une demande de recalcul du projet."
    },
    {
      "k": "table",
      "caption": "Avis ultérieurs sur des changements déjà inclus dans 0.5.0",
      "head": [
        "Version de résultats",
        "Résultat modifié"
      ],
      "rows": [
        [
          "72",
          "La galerie publique de dalles utilise des appuis simples durs sur murs"
        ],
        [
          "72",
          "SSI fournit les réactions d’appui et inclut le sol dans les efforts de contrainte"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Limites connues"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-056 reste non corrigé : vérifiez indépendamment les sollicitations dynamiques des modèles mixtes portiques-coques avec contraintes qui changent sensiblement après renumérotation, rotation ou conversion d’unités. Aucun facteur correctif conservateur n’est établi.",
        "L’effondrement plastique 2D reste refusé en attendant #758, voir SA-2026-044. Une borne inférieure certifiée 3D ne certifie pas l’historique brut des rotules.",
        "L’analyse temporelle ne fournit pas les sollicitations dynamiques totales aux appuis. Utilisez une analyse indépendante comprenant inertie, amortissement et charges aux appuis. Les analyses de câbles non prises en charge et les mouvements d’appui imposés non nuls dans les calculs de câbles ou temporels sont explicitement refusés.",
        "Aucun solveur spatial de longueur d’arc ou de contrôle en déplacement n’est ajouté. Les avertissements et restrictions existants restent applicables."
      ]
    },
    {
      "k": "h",
      "t": "Autres changements"
    },
    {
      "k": "ul",
      "items": [
        "Les structures planes générées reçoivent des maintiens explicites et les halles utilisent par défaut un contreventement physique. Régénérez les modèles et vérifiez appuis et contreventement ; les modèles enregistrés restent inchangés.",
        "L’expérience de commande de forme d’une bande courbée de Fehér, Sipos et Várkonyi propose un solveur interactif, des trajectoires d’actionneurs et une comparaison avec l’article en anglais, espagnol et portugais. Le résumé de la bande découpée est également traduit en espagnol et portugais.",
        "L’article du blog de la version 0.5.0 est intégralement traduit en allemand, français et turc. Les avertissements des certificats plastiques et les refus pour limites de ressources sont traduits dans toutes les langues proposées."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Journal des modifications",
      "t": "Le dossier technique complet :"
    }
  ]
};

export default body;
