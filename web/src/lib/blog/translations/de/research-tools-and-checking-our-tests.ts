import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Forschung, Werkzeuge und die Prüfung unserer Tests",
  "excerpt": "Was wir in den letzten Tagen veröffentlicht haben: ausführbare Forschung, acht Rechner und Prüfungen der Benchmarkmodelle selbst. Was funktioniert, was falsch war und was noch geprüft werden muss.",
  "blocks": [
    {
      "k": "p",
      "t": "In den letzten Tagen haben wir Stabileo Research und Stabileo Tools ergänzt und ihre Prüfungen verschärft. Stabileo ist kostenlose, quelloffene Software für Tragwerksplanung mit KI, herausgegeben von Ergodic Group. LambdaClass ist deren Entwicklungsabteilung."
    },
    {
      "k": "h",
      "t": "Forschung zum Ausführen"
    },
    {
      "k": "p",
      "t": "Wir bringen veröffentlichte Fachartikel zur Tragwerksberechnung und klassische Benchmarks mit Stabileos eigenem Viewer in den Browser. Auf jeder Seite geben wir an, was sie reproduziert, wie wir es geprüft haben und welche Grenzen der Vergleich hat. Seiten mit noch offenen Vergleichen vervollständigen wir derzeit."
    },
    {"k": "img", "base": "blog/research", "w": 1600, "h": 1000, "alt": "Die Seite Stabileo Research, „Forschung im Ingenieurbau“, mit dem Hinweis, dass es Forschung und kein Bemessungswerkzeug ist, und dem ersten ausführbaren Eintrag, dem Lee-Rahmen (1968), mit seinem Lastpfad.", "caption": "stabileo.com/research: Jede Seite sagt, was sie reproduziert und wie es geprüft wurde."},
    {
      "k": "p",
      "t": "Die verfügbaren Artikelseiten behandeln Phasenfeldbruch nach Shauer (2025), Federnetzwerke nach Grossman und Boudaoud (2026), Topologieoptimierung nach Andreassen et al. (2011), Stabilität des Roorda-Rahmens nach Ferrari und Sigmund (2025), Formfindung von Seilnetzen nach Pastrana et al. (2026), durchschnappende Bögen nach Zmyślony, Khan und Biggins (2026) und Gitterschalen nach Fairclough et al. (2026)."
    },
    {
      "k": "p",
      "t": "Die klassischen Solverfälle sind MacNeal–Harder, der Schalenparcours, die Mattiasson-Elastika, Riks/Crisfield, Newmark, CQC, plastischer Kollaps, die Navier-Platte, der Lee-Rahmen und der DaDeppo–Schmidt-Bogen. Die Seiten unterscheiden Liveberechnung von gespeicherten Ergebnissen und nennen die Vergleichsgrenzen. Ferraris Koiter-Vergleich ist unvollständig; Fairclough umfasst ein Beispiel mit fünf Knoten; der Gleichgewichtssprung des Bogens ist keine transiente Simulation."
    },
    {
      "k": "p",
      "t": "Wir veröffentlichen Umfang und Nachweise und prüfen sie offen. Forschungsergebnisse sind keine Bemessungsergebnisse, und die Übereinstimmung mit einem Benchmark ist keine Zertifizierung."
    },
    {
      "k": "table",
      "caption": "Heute verfügbar:",
      "head": [
        "Angebot",
        "Anzahl"
      ],
      "rows": [
        [
          "Ausführbare Artikelseiten",
          "7"
        ],
        [
          "Benchmark-Seiten des Rechenkerns",
          "10"
        ],
        [
          "Rechner",
          "8"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Auch die Tests müssen geprüft werden"
    },
    {
      "k": "p",
      "t": "Einige Seiten waren falsch, weil unsere Testmodelle falsch waren. Jede Benchmark-Seite des Rechenkerns und ihr CI-Test lesen jetzt dieselbe Falldatei, sodass eine Modellkorrektur beide aktualisiert. Einige vorläufige Vergleiche bleiben in der CI ausdrücklich deaktiviert und blockieren Zusammenführungen noch nicht; wir vervollständigen diese Vergleiche."
    },
    {
      "k": "p",
      "t": "Wir haben die Mattiasson-Referenzen und die Behandlung der axialen Dehnung (#845), den Vergleich eines biegesteifen Rahmens mit einer rein axialen Fachwerkformel (#846) sowie falsche Lagerungs- und Belastungsmodelle für Schalen (#810) korrigiert. Wir ändern die Art, wie Benchmarks aufgebaut werden, damit solche Fehler nicht erneut unbemerkt bleiben. Der erste Teil ist integriert: Jeder Benchmark ist eine Spezifikation mit zwei unabhängigen Referenzen, die übereinstimmen müssen, und automatischen Prüfungen der aufgebrachten Last, des Gleichgewichts der Auflagerreaktionen und der Symmetrie, einschließlich Vergleichen zwischen Halbmodell und Vollmodell. Wir ergänzen Konvergenzprüfungen mit mindestens drei Netzen, einen Vorzeichenfehlertest, der nachweist, dass jeder Benchmark fehlschlagen kann, und die Freigabe durch einen Ingenieur für den Kernsatz."
    },
    {"k": "img", "base": "blog/research-mattiasson", "w": 1600, "h": 1000, "alt": "Die Benchmarkseite zur Elastica von Mattiasson (1981), Reiter Ergebnisse: ein Diagramm von u/L und v/L über PL²/EI mit den Kurven von Stabileo und Kreisen für die analytischen Referenzen sowie eine Tabelle der Werte mit ihren relativen Fehlern. Links: 5 von 5 Prüfungen bestanden und der Hinweis, dass es Forschung und kein Bemessungswerkzeug ist.", "caption": "Die korrigierte Mattiasson-Seite: die Antwort der Engine gegen zwei unabhängige analytische Referenzen."},
    {
      "k": "p",
      "t": "Wir integrieren außerdem Einheiten in das Typsystem (#864), damit Verwechslungen zwischen kN/N oder m/mm beim Kompilieren auffallen. Der erste Teil, für den Material- und Querschnittspfad von 2D-Rahmen, ist am 3. November eingeflossen."
    },
    {
      "k": "h",
      "t": "Acht Rechner mit Zugang zum Editor"
    },
    {
      "k": "p",
      "t": "Stabileo Tools bietet kostenlose Rechner für einfach gelagerte Balken, Kragarme, elastisches Stützenknicken, Durchlaufträger, einfeldrige Rahmen, ebene Fachwerke, Einflusslinien für bewegliche Lasten und Biegeeigenfrequenzen von Balken. Sie verwenden den Produktionssolver, zeigen unabhängige klassische Vergleiche und nennen ihre Annahmen. Jeder öffnet sein Modell im vollständigen Editor. Es sind Analysewerkzeuge, keine vollständigen Normnachweise."
    },
    {"k": "img", "base": "blog/tools", "w": 1600, "h": 1000, "alt": "Die Seite Stabileo Tools, „Kostenlose Ingenieurrechner“, beginnend mit dem Rechner für den Einfeldträger: ein Balken unter Streckenlast mit seiner Biegelinie und einer Schaltfläche zum Öffnen.", "caption": "stabileo.com/tools: acht Rechner auf der Produktions-Engine."},
    {
      "k": "h",
      "t": "Falsche Ergebnisse begrenzen"
    },
    {
      "k": "p",
      "t": "Wir arbeiten daran, jedes bekannte Problem mit falschen Ergebnissen einzudämmen: Ablehnungen oder Warnungen im Rechenkern tragen die Kennung des bekannten Problems, statt eine ungeprüfte Zahl zurückzugeben (#807, in Prüfung). Jede Ablehnung wird getestet, einschließlich nicht unterstützter dynamischer Modelle mit Stab- oder Schalenexzentrizitäten."
    },
    {
      "k": "p",
      "t": "Metamorphe Tests haben Invarianzfehler aufgedeckt: Gleichwertige Modelle konnten nach Drehung, Spiegelung oder Einheitenskalierung abgelehnt werden. Wir führen die metamorphe Testsuite jetzt bei jeder Änderung aus, um solche Regressionen zu erkennen. Wir ergänzen einen nächtlichen Lauf mit Zufallsmodellen, der die Befunde nach Grundursache gruppiert und pro Grundursache ein Issue erstellt."
    },
    {
      "k": "h",
      "t": "Seitdem: 1. bis 3. November"
    },
    {
      "k": "ul",
      "items": [
        "Der Analysemodus von PRO ist fertig. Ergebnisse, die ohne Warnung falsch waren, sind korrigiert: Der Lastgenerator belastet die Traufe einer Halle nicht mehr wie eine Geschossdecke, und das seismische Gewicht jeder Ebene enthält jetzt die als Schalen gezeichneten Platten und Wände, die es ausgelassen hatte (#1076).",
        "Exporte funktionieren bei realen Gebäuden. Große Excel-Blätter werden Zeile für Zeile geschrieben, und der Bericht eines sechsgeschossigen Gebäudes dauert etwa zehn Sekunden statt vier Minuten. „Exportierten Bericht prüfen“ vergleicht jetzt die gedruckten Zahlen, nicht nur die Fingerabdrücke (#1076).",
        "PRO hat abschaltbare Hilfetexte, einen Speicherstatus in der Kopfzeile, einen Bericht nach der Analyse, Plattenergebnisse und einen schreibgeschützten Viewer für geteilte Modelle mit „Duplizieren und bearbeiten“ bekommen (#1077, #1078).",
        "Ein Knickfaktor über seiner unabhängig zertifizierten oberen Schranke wird jetzt abgelehnt, in 2D und 3D (#817, Ergebnisversion 6). Zertifizieren Sie erneut, bevor Sie sich auf ein früheres Knickzertifikat verlassen.",
        "Geteilte Links mit nicht endlichen Zahlen oder mit Stäben, Auflagern oder Lasten, die auf etwas Fehlendes verweisen, werden abgelehnt statt geöffnet (#1058).",
        "Die Invarianz-Suite prüft jetzt sechs vorrangige Analysen unter Drehung, Spiegelung und Superposition und vier davon unter gleichmäßiger Skalierung der Steifigkeit (#1060)."
      ]
    },
    {
      "k": "h",
      "t": "Was als Nächstes kommt"
    },
    {
      "k": "p",
      "t": "Wir vervollständigen die offenen Vergleiche und machen Website und Solver schneller. Als Nächstes stehen ein Python-Paket (pip install stabileo) und ein öffentliches, aus den Benchmarks generiertes Verifikationshandbuch auf der Roadmap."
    }
  ]
};

export default body;
