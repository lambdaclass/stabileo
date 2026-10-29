import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Comment nous vérifions les résultats de Stabileo, et où s'arrêtent les vérifications",
  "excerpt": "Le solveur, la vérification formelle et l'IA : comment nous cherchons les erreurs dans les chiffres que donne Stabileo, ce que prouvent les certificats et ce qu'aucune vérification ne peut garantir.",
  "blocks": [
    {
      "k": "p",
      "t": "Un logiciel d'analyse structurale peut donner un chiffre faux sans aucun signe visible. Ces dernières semaines, nous avons testé chaque partie de Stabileo par plusieurs voies indépendantes, trouvé des dizaines de défauts réels, dont beaucoup allaient dans le sens de l'insécurité, et corrigé la plupart d'entre eux. Chacun est évalué et, s'il a pu affecter des résultats déjà utilisés, publié sous forme d'avis indiquant que faire en attendant ; certains sont encore en cours d'évaluation. Cet article explique comment nous cherchons ces défauts, ce que prouvent les certificats qui accompagnent les résultats et, tout aussi clairement, ce qui échappe à toute vérification."
    },
    {
      "k": "h",
      "t": "Un seul moteur"
    },
    {
      "k": "p",
      "t": "Le solveur est écrit en Rust et compilé en WebAssembly : il s'exécute sur l'ordinateur de l'utilisateur, sans installation et sans envoyer le modèle à aucun serveur. C'est le même code qui tourne en intégration continue. En octobre 2026, nous avons supprimé les calculs parallèles en TypeScript qui remplaçaient silencieusement le moteur lorsqu'il n'était pas disponible : l'application le signale désormais, au lieu de calculer avec une copie non vérifiée."
    },
    {
      "k": "h",
      "t": "Cinq façons de chercher les erreurs"
    },
    {
      "k": "p",
      "t": "Aucun test ne trouve à lui seul toutes les erreurs ; nous en utilisons donc plusieurs, qui échouent de manières différentes :"
    },
    {
      "k": "ul",
      "items": [
        "Comparaison avec d'autres logiciels. Les mêmes modèles, fixes ou aléatoires générés chaque nuit, sont calculés avec OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos et CalculiX. Chaque écart est analysé jusqu'à savoir si l'erreur est la nôtre ou si les deux logiciels modélisent le cas différemment.",
        "Références publiées. Une suite de recette composée de cas dont les résultats ont été publiés par leurs auteurs, et non par un autre logiciel commercial, avec des tolérances fixées par la précision imprimée dans la source. Les vérifications réglementaires sont comparées à des exemples résolus publiés (INTI-CIRSOC, AISC et d'autres).",
        "Invariants physiques. Faire tourner un modèle, le symétriser, le renuméroter ou changer ses unités doit modifier la réponse exactement comme le dit la physique ; la superposition, la réciprocité et le bilan énergétique doivent être respectés. Ces tests n'ont besoin d'aucune valeur de référence.",
        "Dérivations. Les matrices des éléments de barre sont dérivées symboliquement à partir des principes premiers et comparées terme à terme avec celles du code ; pour les autres éléments, il existe des dérivations écrites destinées à être relues par un autre ingénieur.",
        "Fuzzing et tests de mutation. Des millions d'entrées générées cherchent des plantages et des résultats non finis, et des erreurs sont introduites volontairement dans le code pour vérifier que les tests les détectent."
      ]
    },
    {
      "k": "table",
      "caption": "Quelques chiffres du travail de vérification, tirés des documents du dépôt.",
      "head": [
        "Quoi",
        "Nombre"
      ],
      "rows": [
        [
          "Logiciels d'éléments finis indépendants dans la comparaison",
          "7"
        ],
        [
          "Cas de recette avec résultats publiés",
          "12"
        ],
        [
          "Valeurs de référence publiées dans ces cas",
          "105"
        ],
        [
          "Théorèmes Lean dont l'intégration continue vérifie les axiomes",
          "37"
        ]
      ]
    },
    {
      "k": "note",
      "t": "Les 105 valeurs de référence sont pour la plupart des fréquences de portiques de bâtiments (SAC, IASC-ASCE, Bathe et Wilson). Elles couvrent bien l'analyse modale et linéaire des portiques ; elles ne constituent pas une preuve pour d'autres types d'analyse."
    },
    {
      "k": "h",
      "t": "Certificats : un résultat avec une borne d'erreur"
    },
    {
      "k": "p",
      "t": "Pour les résultats qui s'y prêtent, Stabileo tente aussi en arrière-plan un certificat : une borne, calculée en arithmétique d'intervalles, qui contient la solution exacte du système qu'il a résolu. Quand il n'y parvient pas, le résultat est marqué comme non certifié, avec la raison. La borne porte sur l'erreur numérique, et non sur l'erreur de discrétisation du maillage ou du pas de temps. Pour l'analyse linéaire, les combinaisons, l'analyse modale et l'effondrement plastique, les mathématiques centrales de cette borne sont démontrées en Lean, un assistant de preuve dans lequel l'ordinateur vérifie chaque étape ; certaines étapes (les liaisons cinématiques, une condition de la vérification modale) ne sont pas encore formalisées. Les analyses P-Delta, spectrale, harmonique et temporelle ont elles aussi des certificats, mais leurs mathématiques ne sont pas encore formalisées en Lean. L'intégration continue rejette toute preuve incomplète ou tout axiome ajouté, et pour certains types de certificats, le vérificateur exécuté est le code Lean même sur lequel portent les preuves."
    },
    {
      "k": "h",
      "t": "Ce que les certificats ne disent pas"
    },
    {
      "k": "ul",
      "items": [
        "Un certificat borne l'erreur de résolution du système tel qu'il a été assemblé. Il ne prouve pas que le système représente le modèle : l'assemblage de la matrice de rigidité et des charges est testé par les voies décrites plus haut, mais pas certifié. Quand le flambement par torsion manquait (SA-2026-007), le certificat certifiait le mauvais problème. Depuis la 0.3.0, les certificats de bout en bout réassemblent le système de manière indépendante pour les portiques et les treillis et vérifient le résultat par rapport au modèle lui-même ; les coques, les solides et les connecteurs ne sont pas encore couverts.",
        "Lean démontre les mathématiques ; que le code Rust implémente exactement cet algorithme n'est pas démontré, sauf pour les vérificateurs qui sont du code Lean.",
        "Les vérifications réglementaires certifiées évaluent leurs formules en arithmétique d'intervalles, mais les formules elles-mêmes ne sont pas formalisées : elles sont comparées à des exemples résolus publiés lorsqu'il en existe, et la couverture de chaque norme (quelles clauses, quels exemples) figure dans la matrice de maturité. La maçonnerie, les assemblages, les fondations et les états limites de service ne sont pas certifiés.",
        "Aucune vérification du logiciel ne vérifie le modèle. Les charges, les appuis et l'idéalisation sont des décisions de l'ingénieur ; la revue du modèle signale les erreurs courantes, mais elle ne remplace pas le jugement.",
        "Il n'y a pas encore eu de revue indépendante par un ingénieur structure habilité. Les résultats CIRSOC 301 restent marqués comme expérimentaux."
      ]
    },
    {
      "k": "h",
      "t": "L'IA rédige et relit ; elle ne calcule pas"
    },
    {
      "k": "p",
      "t": "L'assistant IA rédige des modèles à partir d'une description et relit les modèles existants, mais il ne calcule pas de résultats : les chiffres viennent du solveur et des modules de vérification réglementaire de l'application. Ses explications sont du texte produit par un modèle de langage et peuvent être fausses ; les valeurs qui comptent sont celles des résultats. Avant d'appliquer une modification, il montre ce qu'il va changer, et cela peut être annulé en une seule étape. Les fonctions d'IA envoient la description et le modèle à un serveur qui interroge un modèle de langage ; le solveur, les résultats et les vérifications n'en ont pas besoin et fonctionnent hors ligne."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Pourquoi un agent d'IA ne devrait pas calculer, avec un cas concret :"
    },
    {
      "k": "h",
      "t": "Quand quelque chose échoue"
    },
    {
      "k": "p",
      "t": "Les défauts qui ont pu affecter des résultats déjà utilisés sont publiés sous forme d'avis de sécurité, avec la manière de reconnaître un modèle affecté et ce qu'il faut faire en attendant ; d'autres défauts de sécurité sont en cours d'évaluation et sont ajoutés lorsqu'ils le justifient. Les avis ouverts sont clos lorsque la correction est en ligne sur stabileo.com."
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Les avis publiés et leur état :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/TRUSTED_BASE.md",
      "label": "Base de confiance des certificats",
      "t": "Ce qui est démontré, ce qui est testé et ce qui est admis, composant par composant :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Matrice de maturité de la vérification",
      "t": "Pour chaque analyse, élément et norme de dimensionnement, le niveau de vérification atteint et les éléments de preuve :"
    }
  ]
};

export default body;
