import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Une alternative gratuite et open source à SAP2000, dans votre navigateur",
  "description": "Stabileo : calcul de structures libre et gratuit dans le navigateur. Portiques 2D/3D, coques, P-Delta, modal, spectre ; contrôles AISC, ACI, Eurocode, CIRSOC.",
  "eyebrow": "Alternative à SAP2000",
  "lead": "Stabileo est un logiciel d'analyse de structures gratuit et open source (AGPL-3.0) qui fonctionne dans votre navigateur, sans installation, clé de licence ni compte. Le solveur est écrit en Rust et compilé en WebAssembly : le modèle est donc résolu sur votre propre ordinateur. Le mode Basique permet de modéliser, charger, calculer et lire les résultats de portiques et de treillis 2D et 3D ; le mode PRO, en développement, ajoute les dalles et les voiles, l'import DXF et IFC, les charges réglementaires et les vérifications des barres.",
  "blocks": [
    {
      "k": "h",
      "t": "Quand c'est une bonne alternative"
    },
    {
      "k": "ul",
      "items": [
        "Analyser des portiques, des treillis et des bâtiments sans payer de licence ni rien installer, sur n'importe quel système d'exploitation doté d'un navigateur récent.",
        "Contrôler les résultats d'un autre programme : Stabileo est comparé à sept autres programmes d'éléments finis, et chaque ligne de son code peut être lue.",
        "Enseigner et apprendre : il montre la méthode des déplacements pas à pas.",
        "Vérifier des barres en acier et en béton selon AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 et les normes CIRSOC argentines, en mode PRO."
      ]
    },
    {
      "k": "h",
      "t": "Quand ce n'est pas encore le cas"
    },
    {
      "k": "ul",
      "items": [
        "Si vous avez besoin de l'éventail de normes de dimensionnement et des décennies de recul d'un programme commercial établi : le mode PRO est encore en développement.",
        "Si votre bureau d'études exige un logiciel revu de façon indépendante par un ingénieur habilité : cette revue n'a pas encore eu lieu."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Comment nous vérifions les résultats, et où s'arrêtent les vérifications :"
    }
  ],
  "faqTitle": "Questions fréquentes",
  "faq": [
    {
      "q": "Quelle est la meilleure alternative gratuite à SAP2000 ?",
      "a": "Cela dépend de l'usage que vous faites de SAP2000. Pour l'analyse de portiques, de treillis et de coques en 2D et 3D dans le navigateur, sans rien installer, Stabileo est gratuit et open source. Pour l'analyse non linéaire scriptée en recherche, OpenSees est l'option open source établie de longue date."
    },
    {
      "q": "Puis-je utiliser Stabileo au lieu de payer une licence SAP2000 ou ETABS ?",
      "a": "Pour l'analyse de portiques, de treillis et de nombreux bâtiments, et pour les vérifications de barres selon AISC 360, ACI 318, les Eurocodes et CIRSOC, oui. L’analyse est gratuite ; les modules de dimensionnement spécialisés sont payants et gratuits pour les universités. Pour l'éventail complet des normes de dimensionnement et un long historique en production, les programmes commerciaux offrent encore davantage ; le mode PRO de Stabileo est en développement."
    },
    {
      "q": "Stabileo est-il vraiment gratuit ?",
      "a": "Le programme principal, pour l’analyse de structures dans le navigateur, est open source et gratuit pour tout le monde. Certains modules spécialisés sont payants ; les universités les obtiennent gratuitement. Stabileo IA et les calculs lourds dans le cloud sont payants pour tout le monde, universités comprises, à un prix qui couvre leur coût."
    },
    {
      "q": "Fonctionne-t-il sur Mac ou Linux ?",
      "a": "Oui. Il fonctionne dans n'importe quel navigateur récent, sur n'importe quel système d'exploitation."
    }
  ]
};

export default body;
