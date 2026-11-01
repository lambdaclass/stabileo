import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Stabileo est-il fiable ? Comment ses résultats sont vérifiés",
  "description": "Vérification des résultats de Stabileo : sept autres programmes EF, exemples publiés, bornes d'erreur prouvées en Lean, avis publics. Et ce qu'aucune ne promet.",
  "eyebrow": "Fiabilité",
  "lead": "Les résultats de Stabileo sont vérifiés de cinq façons indépendantes, dont la comparaison avec sept autres programmes d'éléments finis et des bornes d'erreur dont les mathématiques de base sont prouvées en Lean. Les défauts qui ont pu affecter des résultats déjà utilisés sont publiés sous forme d'avis de sécurité (certains constats sont encore en cours d'évaluation, publiquement), et les vingt-quatre avis publiés sont tous corrigés (les quatre derniers dans la version 0.4.0). Comme tout programme d'analyse, il ne vérifie pas votre modèle : les charges, les appuis et l'idéalisation sont des décisions de l'ingénieur.",
  "blocks": [
    {
      "k": "h",
      "t": "Cinq façons de chercher les erreurs"
    },
    {
      "k": "ul",
      "items": [
        "Comparaison avec d'autres programmes : les mêmes modèles, fixes ou générés aléatoirement chaque nuit, sont résolus avec OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos et CalculiX, et chaque écart est analysé.",
        "Références publiées : des cas dont les résultats ont été publiés par leurs auteurs, et des vérifications réglementaires comparées à des exemples d'application publiés (INTI-CIRSOC, AISC et d'autres).",
        "Invariants physiques : faire tourner un modèle, le symétriser, le renuméroter ou changer ses unités doit modifier la réponse exactement comme le prévoit la physique.",
        "Dérivations : les matrices de l'élément de barre sont dérivées symboliquement et comparées terme à terme avec le code.",
        "Fuzzing et tests de mutation : des millions d'entrées générées cherchent des défaillances, et des erreurs sont introduites volontairement pour vérifier que les tests les détectent."
      ]
    },
    {
      "k": "h",
      "t": "Des résultats avec une borne d'erreur"
    },
    {
      "k": "p",
      "t": "Pour les résultats qui le permettent, Stabileo calcule, en arithmétique d'intervalles, une borne qui contient la solution exacte du système qu'il a résolu ; lorsqu'il n'y parvient pas, le résultat est marqué comme non certifié, avec la raison. Les mathématiques de base sont prouvées en Lean pour l'analyse linéaire, les combinaisons, l'analyse modale et l'effondrement plastique. Depuis la version 0.3.0, pour l'analyse linéaire des portiques et des treillis, la borne est aussi vérifiée par rapport au modèle lui-même, avec un assemblage indépendant."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Comment fonctionne la vérification par rapport au modèle :"
    },
    {
      "k": "h",
      "t": "Pourquoi nous publions des avis de sécurité"
    },
    {
      "k": "p",
      "t": "Cette vérification a mis au jour des défauts réels, dont beaucoup allaient dans le sens de l'insécurité. Nous publions ceux qui ont pu affecter des résultats déjà utilisés, avec la manière de reconnaître un modèle concerné et ce qu'il faut revérifier, car un défaut que personne ne signale reste dans des calculs déjà livrés."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001 à 004 ont été corrigés dans la version 0.2.0.",
        "SA-2026-005 à 020 ont été corrigés dans la version 0.3.0.",
        "SA-2026-021 à 024 ont été corrigés dans la version 0.4.0.",
        "L'application prévient une fois lorsque des résultats ont pu changer, et les projets enregistrés avant une modification qui les concerne demandent une revérification à l'ouverture."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "La liste complète des avis :"
    },
    {
      "k": "h",
      "t": "Ce qu'aucune vérification ne garantit"
    },
    {
      "k": "ul",
      "items": [
        "Une borne d'erreur borne l'erreur numérique ; elle ne prouve pas que le modèle est juste et ne borne pas l'erreur de discrétisation du maillage.",
        "Il n'y a pas encore eu de revue indépendante par un ingénieur structure habilité, et les résultats acier selon CIRSOC 301 restent marqués comme expérimentaux.",
        "L'analyse en non-linéarité matérielle utilise un modèle sécant sur la barre entière.",
        "Le module PRO, dimensionnement réglementaire compris, est encore en développement.",
        "Les problèmes de sécurité ouverts sont publics sur GitHub, et le niveau de vérification de chaque analyse, élément et norme figure dans la matrice de maturité."
      ]
    },
    {
      "k": "p",
      "t": "En résumé : Stabileo convient à une analyse que l'on peut recouper, à l'enseignement et au dimensionnement lorsqu'un ingénieur revoit les résultats déterminants, comme avec tout programme. Si votre processus exige un logiciel commercial revu de façon indépendante ou certifié, Stabileo n'en est pas encore là, et nous le disons."
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Chaque vérification en détail, et ses limites :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Matrice de maturité",
      "t": "Le niveau de vérification de chaque partie :"
    }
  ],
  "faqTitle": "Questions fréquentes",
  "faq": [
    {
      "q": "Stabileo est-il fiable pour un vrai travail de dimensionnement de structures ?",
      "a": "Ses résultats sont vérifiés de cinq façons indépendantes, dont la comparaison avec sept autres programmes d'éléments finis et des bornes d'erreur prouvées en Lean, et les défauts qui ont pu affecter des résultats déjà utilisés sont publiés ; ceux qui sont encore en cours d'évaluation sont publics sur GitHub. Il n'a pas encore fait l'objet d'une revue indépendante par un ingénieur habilité et le module PRO est en développement : comme avec tout programme, l'ingénieur revoit donc le modèle et les résultats déterminants."
    },
    {
      "q": "Pourquoi Stabileo publie-t-il des avis de sécurité ?",
      "a": "Parce que sa vérification a mis au jour des défauts réels, dont beaucoup allaient dans le sens de l'insécurité, et qu'un défaut que personne ne signale reste dans des calculs déjà livrés. Chaque avis indique comment reconnaître un modèle concerné et ce qu'il faut revérifier."
    },
    {
      "q": "Les avis publiés sont-ils corrigés ?",
      "a": "Oui. SA-2026-001 à 004 ont été corrigés dans la version 0.2.0, SA-2026-005 à 020 dans la 0.3.0 et SA-2026-021 à 024 dans la 0.4.0."
    }
  ]
};

export default body;
