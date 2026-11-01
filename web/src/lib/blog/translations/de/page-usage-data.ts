import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Welche anonymen Nutzungsdaten Stabileo sendet",
  "description": "Die vollständige Liste der anonymen Nutzungsdaten, die Stabileo sendet, was niemals gesendet wird und wie Sie dies deaktivieren.",
  "eyebrow": "Datenschutz",
  "lead": "Stabileo teilt standardmäßig anonyme Nutzungsdaten, und Sie können dies jederzeit in den Einstellungen oder in Ihrem Profil deaktivieren. So erfahren wir, welche Werkzeuge genutzt werden und welche fehlschlagen, damit wir entscheiden können, was wir zuerst verbessern. Dies ist die vollständige Liste dessen, was gesendet wird.",
  "blocks": [
    {
      "k": "h",
      "t": "Was gesendet wird"
    },
    {
      "k": "ul",
      "items": [
        "Welches Werkzeug Sie wählen (zum Beispiel Stab, Auflager oder Last) und welches Diagramm Sie anzeigen.",
        "Jede Berechnung: ob sie erfolgreich war oder fehlgeschlagen ist, wie lange sie gedauert hat, ob sie 2D oder 3D war, und die Größe des Modells in Bereichen (zum Beispiel 11 bis 50 Stäbe).",
        "Die Beispiele, die Sie öffnen, die erweiterten Berechnungen und die Schritt-für-Schritt-Methoden, die Sie nutzen.",
        "Exporte, mit ihrem Format.",
        "Der Modus (Basic oder PRO), die Version der App und die Sprache.",
        "Eine zufällige ID für diesen Besuch. Wenn Sie den Hinweis mit „Verstanden“ beantworten, zusätzlich eine für diesen Browser, die darin gespeichert wird, um verschiedene Browser zu zählen. Keine von beiden ist mit Ihrem Konto verknüpft."
      ]
    },
    {
      "k": "h",
      "t": "Was niemals gesendet wird"
    },
    {
      "k": "ul",
      "items": [
        "Geometrie, Lasten, Querschnitte oder irgendein Wert aus Ihren Modellen.",
        "Die Namen Ihrer Projekte oder Dateien.",
        "Ihr Name, Ihre E-Mail-Adresse oder Ihre IP-Adresse zusammen mit den Ereignissen."
      ]
    },
    {
      "k": "h",
      "t": "Wie lange sie aufbewahrt werden"
    },
    {
      "k": "p",
      "t": "Die Ereignisse werden bis zu dreizehn Monate aufbewahrt und in aggregierter Form ausgewertet."
    },
    {
      "k": "h",
      "t": "Wie Sie es ändern"
    },
    {
      "k": "p",
      "t": "In den Einstellungen unter Datenschutz oder in Ihrem Profil, wenn Sie ein Konto haben. Wenn Sie das Teilen beenden, werden noch nicht gesendete Ereignisse verworfen."
    }
  ],
  "faqTitle": "Häufig gestellte Fragen",
  "faq": []
};

export default body;
