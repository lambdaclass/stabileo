import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Wie zuverlässig ist Stabileo? Wie seine Ergebnisse geprüft werden",
  "description": "Wie Stabileo prüft: sieben andere FE-Programme, publizierte Beispiele, in Lean bewiesene Fehlerschranken, öffentliche Hinweise. Und was keine Prüfung zusagt.",
  "eyebrow": "Zuverlässigkeit",
  "lead": "Die Ergebnisse von Stabileo werden auf fünf unabhängigen Wegen geprüft, darunter der Vergleich mit sieben anderen Finite-Elemente-Programmen und Fehlerschranken, deren mathematischer Kern in Lean bewiesen ist. Fehler, die bereits verwendete Ergebnisse beeinflusst haben könnten, werden als Sicherheitshinweise veröffentlicht (einige Befunde werden noch bewertet, öffentlich), und alle vierundzwanzig veröffentlichten Hinweise sind behoben (die letzten vier in Version 0.4.0). Wie jedes Berechnungsprogramm prüft Stabileo Ihr Modell nicht: Lasten, Auflager und Idealisierung sind Entscheidungen des Ingenieurs.",
  "blocks": [
    {
      "k": "h",
      "t": "Fünf Wege, nach Fehlern zu suchen"
    },
    {
      "k": "ul",
      "items": [
        "Vergleich mit anderen Programmen: Dieselben Modelle, feste und jede Nacht neu erzeugte zufällige, werden mit OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos und CalculiX berechnet, und jeder Unterschied wird untersucht.",
        "Veröffentlichte Referenzen: Fälle, deren Ergebnisse ihre Autoren veröffentlicht haben, und Bemessungsnachweise, die mit veröffentlichten Rechenbeispielen verglichen werden (INTI-CIRSOC, AISC und andere).",
        "Physikalische Invarianten: Drehen, Spiegeln oder Umnummerieren eines Modells oder ein Wechsel seiner Einheiten muss die Antwort genau so ändern, wie es die Physik vorgibt.",
        "Herleitungen: Die Matrizen der Stabelemente werden symbolisch hergeleitet und Term für Term mit dem Code verglichen.",
        "Fuzzing und Mutationstests: Millionen erzeugter Eingaben suchen nach Fehlschlägen, und es werden absichtlich Fehler eingebaut, um zu prüfen, ob die Tests sie finden."
      ]
    },
    {
      "k": "h",
      "t": "Ergebnisse mit Fehlerschranke"
    },
    {
      "k": "p",
      "t": "Für Ergebnisse, bei denen das möglich ist, berechnet Stabileo in Intervallarithmetik eine Schranke, die die exakte Lösung des gelösten Gleichungssystems enthält; gelingt das nicht, wird das Ergebnis mit Angabe des Grundes als nicht zertifiziert gekennzeichnet. Der mathematische Kern ist in Lean bewiesen, für die lineare Berechnung, Kombinationen, die Modalanalyse und den plastischen Kollaps. Seit 0.3.0 wird bei der linearen Berechnung von Rahmen und Fachwerken die Schranke zusätzlich mit einer unabhängigen Assemblierung gegen das Modell selbst geprüft."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Wie die Prüfung gegen das Modell funktioniert:"
    },
    {
      "k": "h",
      "t": "Warum wir Sicherheitshinweise veröffentlichen"
    },
    {
      "k": "p",
      "t": "Diese Verifikation hat echte Fehler gefunden, viele davon auf der unsicheren Seite. Wir veröffentlichen diejenigen, die bereits verwendete Ergebnisse beeinflusst haben könnten, zusammen mit der Angabe, wie man ein betroffenes Modell erkennt und was erneut zu prüfen ist, denn ein Fehler, den niemand meldet, bleibt in bereits abgegebenen Berechnungen."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001 bis 004 wurden in Version 0.2.0 behoben.",
        "SA-2026-005 bis 020 wurden in Version 0.3.0 behoben.",
        "SA-2026-021 bis 024 wurden in Version 0.4.0 behoben.",
        "Die App weist einmal darauf hin, wenn sich Ergebnisse geändert haben können, und Projekte, die vor einer sie betreffenden Änderung gespeichert wurden, fordern beim Öffnen eine erneute Prüfung an."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Die vollständige Liste der Hinweise:"
    },
    {
      "k": "h",
      "t": "Was keine Prüfung garantiert"
    },
    {
      "k": "ul",
      "items": [
        "Eine Fehlerschranke begrenzt den numerischen Fehler; sie beweist nicht, dass das Modell richtig ist, und sie begrenzt nicht den Diskretisierungsfehler des Netzes.",
        "Eine unabhängige Prüfung durch einen zugelassenen Tragwerksplaner hat es noch nicht gegeben, und die Stahlergebnisse nach CIRSOC 301 sind weiterhin als experimentell gekennzeichnet.",
        "Die materiell nichtlineare Berechnung ist ein Sekantenmodell über den ganzen Stab.",
        "Das PRO-Modul, einschließlich der normgemäßen Bemessung, ist noch in Entwicklung.",
        "Offene Sicherheitsprobleme sind auf GitHub öffentlich einsehbar, und der Verifikationsstand jeder Berechnungsart, jedes Elements und jeder Norm steht in der Reifegradmatrix."
      ]
    },
    {
      "k": "p",
      "t": "Kurz gesagt: Stabileo eignet sich für Berechnungen, die Sie gegenprüfen können, für die Lehre und für Bemessungsarbeit, bei der ein Ingenieur die maßgebenden Ergebnisse durchsieht, wie bei jedem Programm. Wenn Ihr Ablauf unabhängig geprüfte oder zertifizierte kommerzielle Software verlangt, ist Stabileo noch nicht so weit, und das sagen wir auch."
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Jede Prüfung im Detail und ihre Grenzen:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Reifegradmatrix",
      "t": "Der Verifikationsstand jedes Teils:"
    }
  ],
  "faqTitle": "Häufige Fragen",
  "faq": [
    {
      "q": "Ist Stabileo für echte Tragwerksplanung zuverlässig?",
      "a": "Seine Ergebnisse werden auf fünf unabhängigen Wegen geprüft, darunter der Vergleich mit sieben anderen Finite-Elemente-Programmen und in Lean bewiesene Fehlerschranken, und Fehler, die bereits verwendete Ergebnisse beeinflusst haben könnten, werden veröffentlicht; die noch in Bewertung befindlichen sind auf GitHub öffentlich. Eine unabhängige Prüfung durch einen zugelassenen Ingenieur gab es noch nicht, und das PRO-Modul ist in Entwicklung. Wie bei jedem Programm prüft daher der Ingenieur das Modell und die maßgebenden Ergebnisse."
    },
    {
      "q": "Warum veröffentlicht Stabileo Sicherheitshinweise?",
      "a": "Weil seine Verifikation echte Fehler gefunden hat, viele davon auf der unsicheren Seite, und ein Fehler, den niemand meldet, in bereits abgegebenen Berechnungen bleibt. Jeder Hinweis sagt, wie man ein betroffenes Modell erkennt und was erneut zu prüfen ist."
    },
    {
      "q": "Sind die veröffentlichten Hinweise behoben?",
      "a": "Ja. SA-2026-001 bis 004 wurden in Version 0.2.0 behoben, SA-2026-005 bis 020 in 0.3.0 und SA-2026-021 bis 024 in 0.4.0."
    }
  ]
};

export default body;
