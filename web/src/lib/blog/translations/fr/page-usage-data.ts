import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Les données d'usage anonymes que Stabileo envoie",
  "description": "La liste complète des données d'usage anonymes que Stabileo envoie, ce qu'il n'envoie jamais et comment les désactiver.",
  "eyebrow": "Confidentialité",
  "lead": "Stabileo partage par défaut des données d'usage anonymes, et vous pouvez les désactiver à tout moment dans les Paramètres ou dans votre profil. Elles nous indiquent quels outils sont utilisés et lesquels échouent, afin que nous décidions quoi améliorer en priorité. Voici la liste complète de ce qui est envoyé.",
  "blocks": [
    {
      "k": "h",
      "t": "Ce qui est envoyé"
    },
    {
      "k": "ul",
      "items": [
        "L'outil que vous choisissez (par exemple barre, appui ou charge) et le diagramme que vous affichez.",
        "Chaque calcul : s'il a réussi ou échoué, sa durée, s'il était en 2D ou en 3D, et la taille du modèle par tranches (par exemple, de 11 à 50 barres).",
        "Les exemples que vous ouvrez, les analyses avancées et les méthodes pas à pas que vous utilisez.",
        "Les exports, avec leur format.",
        "Le mode (Basic ou PRO), la version de l'application et la langue.",
        "Un identifiant aléatoire pour cette visite. Si vous répondez “Compris” à l'avis, un autre pour ce navigateur, stocké dans celui-ci afin de compter les navigateurs distincts. Aucun des deux n'est lié à votre compte."
      ]
    },
    {
      "k": "h",
      "t": "Ce qui n'est jamais envoyé"
    },
    {
      "k": "ul",
      "items": [
        "La géométrie, les charges, les sections ou toute valeur de vos modèles.",
        "Les noms de vos projets ou de vos fichiers.",
        "Votre nom, votre adresse e-mail ou votre adresse IP associés aux événements."
      ]
    },
    {
      "k": "h",
      "t": "Durée de conservation"
    },
    {
      "k": "p",
      "t": "Les événements sont conservés jusqu'à treize mois et analysés de façon agrégée."
    },
    {
      "k": "h",
      "t": "Comment modifier ce réglage"
    },
    {
      "k": "p",
      "t": "Dans les Paramètres, sous Confidentialité, ou dans votre profil si vous avez un compte. Si vous cessez de partager, les événements qui n'ont pas encore été envoyés sont supprimés."
    }
  ],
  "faqTitle": "Questions fréquentes",
  "faq": []
};

export default body;
