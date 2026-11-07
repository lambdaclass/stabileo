import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Une alternative gratuite et open source à ETABS",
  "description": "Comparez Stabileo à votre usage de ETABS : analyse gratuite dans le navigateur, code ouvert, preuves de vérification, limites et import prévu.",
  "eyebrow": "Une alternative gratuite et open source à ETABS",
  "lead": "Stabileo propose une analyse de structures gratuite et open source dans le navigateur. Son adéquation à votre usage de ETABS dépend des analyses et vérifications requises ; aucune équivalence fonctionnelle n’est affirmée.",
  "blocks": [
    {
      "k": "h",
      "t": "Ce que Stabileo couvre aujourd’hui"
    },
    {
      "k": "p",
      "t": "La matrice des capacités documente la statique linéaire 2D et 3D, les portiques et treillis, les combinaisons et enveloppes, P-Delta, le flambement et l’analyse modale, ainsi que des familles de plaques et coques. L’analyse en Basique et en PRO est disponible ; le dimensionnement réglementaire et l’assistant IA sont en développement."
    },
    {
      "k": "p",
      "t": "Pour les bâtiments, distinguez les capacités de plaques et coques du solveur de l’interface PRO pour les dalles, voiles et modèles complexes. Le dimensionnement réglementaire dans PRO est encore en développement ; une fonction du solveur ne signifie pas qu’un parcours complet de dimensionnement de bâtiment est prêt."
    },
    {
      "k": "h",
      "t": "Limites actuelles"
    },
    {
      "k": "p",
      "t": "L’import de modèles SAP2000/ETABS est prévu, mais indisponible. Les fichiers .s2k et .e2k ne peuvent pas être ouverts. La matrice indique des lacunes de robustesse non linéaire, de couplage portiques/coques et de validation des grands modèles. L’assistant IA est en développement, à venir."
    },
    {
      "k": "h",
      "t": "Comment les résultats sont vérifiés"
    },
    {
      "k": "p",
      "t": "Les benchmarks publiés, les comparaisons avec des implémentations indépendantes et les tests apportent différents niveaux de preuve. Les analyses et vérifications prises en charge peuvent inclure des bornes vérifiées par machine ; cela ne certifie pas chaque résultat ni le modèle d’ingénierie. La matrice de maturité recense les preuves et problèmes ouverts par famille."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
      "label": "Capacités du solveur",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Maturité de la vérification",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
      "label": "Feuille de route du produit",
      "t": ""
    }
  ],
  "faqTitle": "Sources et portée",
  "faq": [
    {
      "q": "Est-ce un remplacement complet de ETABS ?",
      "a": "Aucune équivalence fonctionnelle n’est affirmée. Consultez les capacités et limites documentées pour votre projet. Le nom ETABS identifie uniquement l’usage comparé ; aucune affiliation ni approbation n’est suggérée."
    }
  ]
};

export default body;
