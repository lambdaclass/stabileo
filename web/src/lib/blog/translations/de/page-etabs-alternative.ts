import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Eine kostenlose Open-Source-Alternative zu ETABS",
  "description": "Vergleichen Sie Stabileo mit Ihrem ETABS-Workflow: kostenlose Browseranalyse, offener Quellcode, Verifikationsnachweise, Grenzen und geplanter Import.",
  "eyebrow": "Eine kostenlose Open-Source-Alternative zu ETABS",
  "lead": "Stabileo bietet kostenlose Open-Source-Tragwerksanalyse im Browser. Ob es zu Ihrem ETABS-Workflow passt, hängt von den benötigten Analysen und Nachweisen ab; Funktionsgleichheit wird nicht behauptet.",
  "blocks": [
    {
      "k": "h",
      "t": "Was Stabileo heute abdeckt"
    },
    {
      "k": "p",
      "t": "Die Funktionsmatrix dokumentiert lineare Statik in 2D und 3D, Rahmen und Fachwerke, Lastkombinationen und Einhüllende, P-Delta, Knicken und Modalanalyse sowie Platten- und Schalenfamilien. Die Berechnung in Basic und PRO ist verfügbar; die normgemäße Bemessung und der KI-Assistent sind in Entwicklung."
    },
    {
      "k": "p",
      "t": "Unterscheiden Sie bei Gebäuden die Platten- und Schalenfunktionen des Solvers von der PRO-Oberfläche für Decken, Wände und komplexe Modelle. Die normgemäße Bemessung in PRO ist noch in Entwicklung; eine Solver-Funktion bedeutet nicht, dass ein vollständiger Gebäudebemessungsablauf fertig ist."
    },
    {
      "k": "h",
      "t": "Aktuelle Grenzen"
    },
    {
      "k": "p",
      "t": "Der Import von SAP2000/ETABS-Modellen ist geplant und nicht verfügbar. Dateien im Format .s2k oder .e2k können nicht geöffnet werden. Die Matrix nennt Lücken bei nichtlinearer Robustheit, gemischten Rahmen-Schalen-Modellen und der Validierung größerer Modelle. Der KI-Assistent ist in Entwicklung und kommt später."
    },
    {
      "k": "h",
      "t": "Wie Ergebnisse geprüft werden"
    },
    {
      "k": "p",
      "t": "Veröffentlichte Benchmarks, Vergleiche mit unabhängigen Implementierungen und Tests liefern unterschiedliche Nachweise. Unterstützte Analysen und Bemessungsprüfungen können maschinell geprüfte Schranken enthalten; dies zertifiziert nicht jedes Ergebnis oder das Ingenieurmodell. Die Reifematrix nennt Nachweise und offene Probleme je Familie."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
      "label": "Solver-Funktionen",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Verifikationsreife",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
      "label": "Produkt-Roadmap",
      "t": ""
    }
  ],
  "faqTitle": "Quellen und Geltungsbereich",
  "faq": [
    {
      "q": "Ist dies ein vollständiger Ersatz für ETABS?",
      "a": "Funktionsgleichheit wird nicht behauptet. Prüfen Sie die dokumentierten Funktionen und Grenzen für Ihr Projekt. ETABS bezeichnet nur den verglichenen Workflow; eine Verbindung oder Empfehlung wird nicht behauptet."
    }
  ]
};

export default body;
