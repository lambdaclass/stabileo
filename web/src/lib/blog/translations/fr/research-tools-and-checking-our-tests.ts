import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Recherche, outils et vérification de nos tests",
  "excerpt": "Ce que nous avons publié ces derniers jours : des recherches exécutables, huit calculateurs et des contrôles des modèles de référence eux-mêmes. Ce qui fonctionne, ce qui était faux et ce qui reste à revoir.",
  "blocks": [
    {
      "k": "p",
      "t": "Ces derniers jours, nous avons ajouté Stabileo Research et Stabileo Tools et renforcé leurs contrôles. Stabileo est un logiciel gratuit et open source de calcul de structures avec IA, publié par Ergodic Group. LambdaClass est sa branche de développement."
    },
    {
      "k": "h",
      "t": "Des recherches que vous pouvez exécuter"
    },
    {
      "k": "p",
      "t": "Nous portons des articles publiés de calcul de structures et des benchmarks classiques dans le navigateur, avec le visualiseur de Stabileo. Chaque page précise ce qu’elle reproduit, comment nous l’avons vérifié et les limites de la comparaison. Nous complétons les pages dont certaines comparaisons restent ouvertes."
    },
    {
      "k": "p",
      "t": "Les pages disponibles couvrent la rupture par champ de phase de Shauer (2025) ; les réseaux de ressorts de Grossman et Boudaoud (2026) ; l’optimisation topologique d’Andreassen et al. (2011) ; la stabilité du portique de Roorda de Ferrari et Sigmund (2025) ; la recherche de forme de réseaux de câbles de Pastrana et al. (2026) ; les arcs à claquage de Zmyślony, Khan et Biggins (2026) ; et les coques réticulées de Fairclough et al. (2026)."
    },
    {
      "k": "p",
      "t": "Les classiques du moteur sont MacNeal–Harder, le parcours de tests de coques, l’élastique de Mattiasson, Riks/Crisfield, Newmark, CQC, la ruine plastique, la plaque de Navier, le portique de Lee et l’arc de DaDeppo–Schmidt. Les pages distinguent le calcul en direct de la lecture de résultats enregistrés et montrent les limites des comparaisons. La comparaison de Koiter de Ferrari reste inachevée ; Fairclough couvre un exemple à cinq nœuds ; le saut d’équilibre de l’arc n’est pas une simulation transitoire."
    },
    {
      "k": "p",
      "t": "Nous publions le périmètre et les preuves et les examinons ouvertement. Les résultats de recherche ne sont pas des résultats de dimensionnement, et l’accord avec un benchmark n’est pas une certification."
    },
    {
      "k": "table",
      "caption": "Disponible aujourd’hui :",
      "head": [
        "Offre",
        "Nombre"
      ],
      "rows": [
        [
          "Pages d’articles exécutables",
          "7"
        ],
        [
          "Pages de benchmarks du moteur",
          "10"
        ],
        [
          "Calculateurs",
          "8"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Les tests aussi doivent être vérifiés"
    },
    {
      "k": "p",
      "t": "Certaines pages étaient erronées parce que nos modèles de test étaient faux. Chaque page de benchmark du moteur et son test de CI lisent désormais le même fichier de cas : corriger le modèle met les deux à jour. Certaines comparaisons provisoires restent explicitement ignorées dans la CI et ne bloquent pas encore les intégrations ; nous les complétons."
    },
    {
      "k": "p",
      "t": "Nous avons corrigé les références de Mattiasson et le traitement de l’allongement axial (#845), un portique à nœuds rigides comparé à une formule de treillis purement axial (#846), ainsi que des modèles d’appuis et de chargement de coques incorrects (#810). Nous changeons la manière de construire les benchmarks pour que cette catégorie d’erreurs ne passe plus. La première partie est intégrée : chaque benchmark est une spécification avec deux références indépendantes qui doivent concorder et des contrôles automatiques de la charge appliquée, de l’équilibre des réactions et de la symétrie, avec comparaison entre demi-modèle et modèle complet. Nous ajoutons la convergence sur au moins trois maillages, un test avec erreur de signe qui prouve que chaque benchmark peut échouer et la validation d’un ingénieur pour l’ensemble principal."
    },
    {
      "k": "p",
      "t": "Nous intégrons aussi les unités au système de types (#864), afin de détecter les confusions kN/N ou m/mm à la compilation. La première étape, pour les portiques 2D, est en cours de revue."
    },
    {
      "k": "h",
      "t": "Huit calculateurs, avec accès à l’éditeur"
    },
    {
      "k": "p",
      "t": "Stabileo Tools propose des calculateurs gratuits pour les poutres simplement appuyées, les consoles, le flambement élastique des poteaux, les poutres continues, les portiques à une travée, les treillis plans, les lignes d’influence de charges mobiles et les fréquences de flexion des poutres. Ils utilisent le moteur de production, montrent des comparaisons classiques indépendantes et précisent leurs hypothèses. Chacun ouvre son modèle dans l’éditeur complet. Ce sont des outils d’analyse, pas des vérifications réglementaires complètes."
    },
    {
      "k": "h",
      "t": "Contenir les résultats erronés"
    },
    {
      "k": "p",
      "t": "Nous travaillons à contenir tous les problèmes connus de résultats incorrects : les refus ou avertissements du moteur portent l’identifiant du problème, au lieu de renvoyer un nombre non vérifié (#807, en cours de revue). Chaque refus est testé, y compris les modèles dynamiques non pris en charge avec excentrements de barres ou de coques."
    },
    {
      "k": "p",
      "t": "Les tests métamorphiques ont révélé des défauts d’invariance : des modèles équivalents pouvaient être refusés après rotation, réflexion ou changement d’échelle des unités. Nous exécutons désormais la suite métamorphique à chaque modification pour détecter ces régressions. Nous ajoutons une exécution nocturne de modèles aléatoires qui regroupe les observations par cause racine et ouvre une issue par cause racine."
    },
    {
      "k": "h",
      "t": "La suite"
    },
    {
      "k": "p",
      "t": "Nous complétons les comparaisons ouvertes et accélérons le site et le solveur. Les prochains éléments de la feuille de route sont un paquet Python (pip install stabileo) et un manuel public de vérification généré à partir des benchmarks."
    }
  ]
};

export default body;
