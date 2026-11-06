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
      "t": "Zweite Runde: jede Seite erneut geprüft"
    },
    {
      "k": "p",
      "t": "Danach durchlief jede veröffentlichte Forschungsseite eine zweite Prüfung durch drei KI-Modelle nacheinander (Kimi, dann Codex, dann Claude), und jeder Befund, den wir bestätigen konnten, wurde behoben. Fünfzehn Seiten wurden gemeinsam überarbeitet und am 4. November veröffentlicht (#1068): sechs Artikel (Shauer, Pastrana, Ferrari, Zmyślony, Grossman und Fairclough) und neun Benchmarks des Rechenkerns (Newmark, Riks/Crisfield, Navier, Lee, MacNeal–Harder, DaDeppo–Schmidt, das Beispiel zum plastischen Kollaps nach Horne, SRSS/CQC und Mattiasson, das eine dritte Runde durchlief). Keine Toleranz wurde gelockert und kein Test entfernt. Die Prüfung durch praktizierende Ingenieure steht noch aus."
    },
    {
      "k": "ul",
      "items": [
        "MacNeal–Harder verglich Beträge, sodass ein Ergebnis mit falschem Vorzeichen bestanden hätte. Die Referenzen tragen jetzt ihr Vorzeichen, und ein Test weist für jeden Fall eine umgekehrte Antwort zurück.",
        "Riks/Crisfield konnte einen Grenzpunkt ohne Lastabfall melden. Ein Grenzpunkt erfordert jetzt einen Lastabfall zwischen konvergierten Schritten; die Seite sagt, dass die Berechnung den oberen Grenzpunkt überschreitet, statt „traces the snap-through“, und ihre Toleranzen gingen von 5 % auf Werte zwischen 5e-3 und 1e-5.",
        "Navier erklärte den MITC4-Fehler, statt ihn zu messen. Jetzt wird er mit einer unabhängigen Reissner–Mindlin-Reihe verglichen, und der MITC4-Fehler bei harter Lagerung sinkt von −1,951 % bei 4×4 auf −0,036 % bei 32×32, mit Konvergenz zweiter Ordnung.",
        "Die Seiten sagen, womit sie verglichen werden. Newmark wird gegen exakte geschlossene Lösungen geprüft, nicht gegen „the author’s code“; SRSS/CQC ist eine Illustration der Methode, keine Reproduktion des Gebäudes aus dem Artikel; die Schranken des plastischen Kollapses sind unsere eigenen Herleitungen von Hand, kein Zitat; die Referenz von 1,83 kN für den Lee-Rahmen ist aus einer veröffentlichten Abbildung abgelesen, daher behaupten wir nur Abweichungen in ganzen Prozent."
      ]
    },
    {
      "k": "h",
      "t": "Auf Smartphones und Tablets"
    },
    {
      "k": "p",
      "t": "Auf der Live-Website gemessen liefen die Forschungsseiten auf einem Smartphone nicht über, aber das Experiment stand unter dem ganzen Artikel, der Viewer war beengt (356×189 px für eine quadratische Platte), und jede Seite hatte 25 bis 40 Bedienelemente unter 32 px und 14 bis 20 Textstellen unter 12 px. Jetzt folgt das Experiment direkt auf den Titel, der Viewer ist auf das Modell zugeschnitten, Bedienelemente messen mindestens 44 px und Text mindestens 12 px (#831)."
    },
    {"k": "img", "base": "blog/research-phone", "w": 1600, "h": 1000, "alt": "Zwei Smartphone-Screenshots von Stabileo Research nebeneinander, 390 px breit. Links die Seite zum Seilnetz nach Pastrana et al. (2026), „Four cables, one equilibrium“, mit dem Viewer direkt unter dem Titel; rechts der Benchmark der Navier-Platte, dessen Viewer die ganze Bildschirmbreite füllt und die Durchbiegung der Platte nach unten zeigt.", "caption": "Forschung auf dem Smartphone: das Experiment nach dem Titel und ein Viewer so breit wie der Bildschirm."},
    {
      "k": "p",
      "t": "Eine dauerhafte Prüfung rendert die Galerie und jede ausführbare Seite bei 360, 390, 844×390 und 810 px, auf Spanisch, Englisch und Portugiesisch, und schlägt fehl bei horizontalem Überlauf, kleinen Bedienelementen, kleinem Text oder einem Viewer, der fehlt, zu klein ist oder zu weit unten steht. Ihre ersten Läufe fanden echte Fehler, und korrigiert wurden die Layouts, nicht die Prüfung: Der Mattiasson-Viewer war auf dem Smartphone im Querformat 187 px hoch und ist jetzt 280 px hoch, und ein Konvergenzdiagramm zeigte seine Beschriftungen mit 9 px. Ein Reflow-Test ergab, dass Shauers Reiter auf Portugiesisch und Türkisch bei 360 px überliefen."
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
      "t": "Wir arbeiten daran, jedes bekannte Problem mit falschen Ergebnissen einzudämmen: Ablehnungen oder Warnungen im Rechenkern tragen die Kennung des bekannten Problems, statt eine ungeprüfte Zahl zurückzugeben (#807, am 5. November gemergt). Jede Ablehnung wird getestet, einschließlich nicht unterstützter dynamischer Modelle mit Stab- oder Schalenexzentrizitäten."
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
      "t": "Prüfungen, die in zwanzig Minuten antworten"
    },
    {
      "k": "p",
      "t": "Bevor sie main erreicht, durchläuft jede Änderung an Stabileo die Prüfungen, die sie betreffen kann, und eine Änderung am Rechenkern alle: Tests des Rechenkerns, Web-Unit-Tests, Produktions-Builds, End-to-End-Tests im Browser, die Ergebnis-Snapshots und die Determinismusprüfung. Eine Korrektur eines Ergebnisfehlers ist nur so schnell wie diese Prüfungen, deshalb haben wir am 4. November an ihrer Geschwindigkeit gearbeitet. Zuerst haben wir gemessen. In einem sauberen Merge-Queue-Lauf von 44 bis 47 Minuten waren die Tests des Rechenkerns und die Unit-Tests 8 bis 15 Minuten vor dem Ende fertig, mehr davon parallel laufen zu lassen hätte also nichts gebracht. Die Zeit ging in den Bau der Forschungs-Bundles nacheinander und in den langsamsten End-to-End-Shard. Als diese kürzer waren, war der langsamste Shard wegen der Einrichtung langsam: In einem Lauf verbrachte er 7,2 seiner 16 Minuten mit Tests und sechseinhalb mit dem Herunterladen von Browserpaketen von einem langsamen Mirror."
    },
    {
      "k": "ul",
      "items": [
        "Einmal bauen, das Gebaute testen. Die Tests der Produktions-Builds erstellten fünf weitere eigene Builds, vier davon aus demselben Baum, den die CI gerade gebaut hatte; diese vier lesen jetzt diesen Build (#1411). Jeder Build trägt einen Stempel von allem, woraus er gebaut wurde, und ein Test schlägt fehl, wird nie übersprungen, wenn der Stempel nicht zu dem Baum passt, auf dem er läuft.",
        "Cache nach Eingaben. Jedes Forschungs-Bundle wird unter einem Schlüssel aus seinen eigenen Eingaben gecacht, einschließlich des Rechenkerns, den jedes Bundle einbindet, sodass eine Änderung an einem Artikel nur diesen Artikel neu baut und eine Änderung am Rechenkern alle. Ein Pull Request verwendet Bundles wieder, die die Merge-Queue bereits aus denselben Eingaben gebaut hat, nachdem jede Datei gegen ihre Prüfsumme geprüft wurde, und er kann diesen Cache lesen, aber nie schreiben (#1395). Auch Browserpakete kommen aus einem Cache statt vom Mirror (#1413).",
        "Nur ausführen, was eine Änderung betreffen kann. Eine Änderung an der Dokumentation baut nichts und ist in ein bis zwei Minuten statt eines ganzen Laufs fertig. Eine Änderung nur an der Website überspringt die Jobs des Rechenkerns, behält aber jeden End-to-End-Shard, weil 59 der 281 Specs Text auf dem Bildschirm lesen (#1381). In der Queue wird jeder Eintrag durch seinen eigenen Diff gegenüber dem Eintrag vor ihm eingegrenzt; das ist korrekt, weil ein Eintrag nur zusammengeführt wird, wenn jeder Eintrag vor ihm bestanden hat. Fehlt der Diff oder ist er unklar, läuft alles (#1400).",
        "Den langsamsten Pfad ausbalancieren. End-to-End-Tests laufen in 14 statt 10 Shards, ausbalanciert nach gemessenen Laufzeiten (#1382). Die alte Zeittabelle sagte 41,5 Minuten Tests voraus, wo ein Lauf 69,8 dauerte."
      ]
    },
    {
      "k": "table",
      "caption": "Laufzeit erfolgreicher CI-Läufe, in denen jeder Job lief, von der Erstellung bis zum letzten Job, gemessen über die GitHub-Actions-API. Vorher: 4. November, ab 08:00 UTC (Pull Requests) bzw. 13:48 UTC (Merge-Queue) bis 21:10 UTC; nachher: von 21:15 UTC bis 03:00 UTC am 5. November.",
      "head": [
        "Läufe",
        "Anzahl",
        "Median",
        "Spanne"
      ],
      "rows": [
        [
          "Merge-Queue, vorher",
          "20",
          "42 min",
          "25 bis 56 min"
        ],
        [
          "Merge-Queue, nachher",
          "10",
          "20 min",
          "15 bis 26 min"
        ],
        [
          "Pull Requests (erster Versuch), vorher",
          "69",
          "59 min",
          "35 bis 127 min"
        ],
        [
          "Pull Requests (erster Versuch), nachher",
          "19",
          "27 min",
          "16 bis 45 min"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Eine rote Prüfung, für die die Änderung nichts kann"
    },
    {
      "k": "p",
      "t": "Ein Fehlschlag durch das Netzwerk oder eine verlorene Maschine ist Rauschen, aber er ist auch eine rote Prüfung, die sich jemand ansehen muss, und die Gewohnheit, rote Prüfungen neu zu starten, ist der Weg, auf dem ein echter Fehler durchgewunken wird. Deshalb werden die fehlgeschlagenen Jobs eines Pull Requests einmal automatisch neu gestartet, nur wenn jeder fehlgeschlagene Job einen positiven Nachweis eines Infrastrukturfehlers trägt: ein Timeout in einem Download-Schritt, eine mitten im Job verlorene CI-Maschine, ein Netzwerkfehler, der den letzten Versuch eines Downloads beendet (#1380). Alles, was irgendwo im Log wie ein Testfehler aussieht, blockiert den Neustart, ebenso alles, was der Klassifikator nicht erkennt. Das hält ihn vorsichtig: Er startet höchstens einmal neu und nie nach einem fehlgeschlagenen Testschritt. Eine Garantie ist das nicht: Ein sporadischer Fehler, den der Klassifikator fälschlich als Infrastrukturfehler liest, könnte beim Neustart bestehen; deshalb blockiert alles, was er nicht erkennt, den Neustart."
    },
    {
      "k": "p",
      "t": "Zwei weitere Korrekturen haben Fehlalarme beseitigt. Ein Pull-Request-Lauf, der abgebrochen wurde, weil ein neuerer Lauf auf demselben Commit ihn ersetzt hatte, zeigte früher eine rote Pflichtprüfung; jetzt überspringt er diese Prüfung, aber erst nachdem bestätigt ist, dass der neuere Lauf existiert und nicht fehlgeschlagen ist, denn eine übersprungene Pflichtprüfung gilt als bestanden (#1397). Und ein hängender Download konnte einen Prozess zurücklassen, der die Sperre des Paketmanagers hielt, sodass der erneute Versuch an der Sperre statt am Download scheiterte; ein Versuch gilt jetzt erst nach Minuten ohne Ausgabe als hängend, wird zusammen mit allem, was er gestartet hat, beendet, und der erneute Versuch wartet auf die Sperre (#1408)."
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
