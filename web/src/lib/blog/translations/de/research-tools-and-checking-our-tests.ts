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
    {
      "k": "p",
      "t": "Wir integrieren außerdem Einheiten in das Typsystem (#864), damit Verwechslungen zwischen kN/N oder m/mm beim Kompilieren auffallen. Der erste Teil für 2D-Rahmen wird derzeit geprüft."
    },
    {
      "k": "h",
      "t": "Acht Rechner mit Zugang zum Editor"
    },
    {
      "k": "p",
      "t": "Stabileo Tools bietet kostenlose Rechner für einfach gelagerte Balken, Kragarme, elastisches Stützenknicken, Durchlaufträger, einfeldrige Rahmen, ebene Fachwerke, Einflusslinien für bewegliche Lasten und Biegeeigenfrequenzen von Balken. Sie verwenden den Produktionssolver, zeigen unabhängige klassische Vergleiche und nennen ihre Annahmen. Jeder öffnet sein Modell im vollständigen Editor. Es sind Analysewerkzeuge, keine vollständigen Normnachweise."
    },
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
      "t": "Was als Nächstes kommt"
    },
    {
      "k": "p",
      "t": "Wir vervollständigen die offenen Vergleiche und machen Website und Solver schneller. Als Nächstes stehen ein Python-Paket (pip install stabileo) und ein öffentliches, aus den Benchmarks generiertes Verifikationshandbuch auf der Roadmap."
    }
  ]
};

export default body;
