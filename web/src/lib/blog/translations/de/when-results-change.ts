import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Wenn sich ein Ergebnis ändert: Ergebnisversionen, erneute Prüfungen und Sicherheitshinweise",
  "excerpt": "Eine Korrektur ändert Zahlen, die Ingenieure womöglich schon verwendet haben. Wie Stabileo Ihnen sagt, welche Ihrer Projekte eine Korrektur betrifft, wie es ein Ergebnis, von dem es weiß, dass es falsch sein kann, zurückhält, bis die Korrektur existiert, und wie die Korrektur veröffentlicht wird, mit den vierzehn Ergebnisversionen, die am 4. und 5. November zusammengeführt wurden.",
  "blocks": [
    {
      "k": "p",
      "t": "Jede Korrektur an einem Rechenkern für Tragwerke ändert eine Zahl, die jemand womöglich schon verwendet hat. Ein Knickfaktor, der zu hoch war, ist jetzt niedriger; ein Modell, das früher gerechnet wurde, wird jetzt abgelehnt. Eine Korrektur, die stillschweigend in die App gelangt, lässt die alte Zahl in bereits abgegebenen Berechnungen stehen, und der Ingenieur, der sie erstellt hat, hat keinen Grund, noch einmal hinzusehen."
    },
    {
      "k": "p",
      "t": "Dieser Beitrag beschreibt, was Stabileo dagegen tut, von dem Moment, in dem ein Fehler gefunden wird, bis zu dem Moment, in dem seine Korrektur veröffentlicht wird. Die Beispiele sind echt: Am 4. und 5. November 2026 erreichten vierzehn Ergebnisversionen, 16 bis 29, stabileo.com."
    },
    {
      "k": "h",
      "t": "Was eine Ergebnisversion ist"
    },
    {
      "k": "p",
      "t": "Eine Ergebnisversion ist eine ganze Zahl, getrennt von der App-Version. Sie steigt jedes Mal um eins, wenn eine Änderung die Website erreicht, die dasselbe gespeicherte Modell andere Zahlen liefern lässt oder ein Modell ablehnt, das früher gerechnet wurde. Jede Änderung dieser Art wird erfasst mit:"
    },
    {
      "k": "ul",
      "items": [
        "der Version, mit der sie kam, ihrem Datum und ihren Pull Requests;",
        "den Modellen, die sie betrifft, beschrieben als Modellmerkmale: ein ebenes Modell mit Zwangsbedingungen, eine 2D-Knickanalyse mit Lasten entlang der Stäbe, ein nach CIRSOC 201 nachgewiesener Betonstab;",
        "einem Titel und einer Erläuterung für den Ingenieur in jeder der sechs Sprachen der App, mit dem, was erneut zu prüfen ist;",
        "einem Link zur vollständigen Beschreibung: einem Sicherheitshinweis, einer Notiz zur Ergebnisänderung oder dem Änderungsprotokoll."
      ]
    },
    {
      "k": "p",
      "t": "Jede Berechnung versieht das Projekt mit einem Stempel der Ergebnisversion, die es erzeugt hat, zusammen mit der App-Version, dem Commit, der Version des Rechenkerns, einem Hash der Binärdatei des Rechenkerns und den ausgeführten Analysen. Der Stempel reist mit dem Projekt: Eine gespeicherte Datei, eine automatische Sicherung, ein offener Tab oder ein geteilter Link tragen ihn alle."
    },
    {
      "k": "note",
      "t": "Eine Ergebnisversion wird nie wiederverwendet. Jeder Merge in den Hauptzweig wird ausgerollt und stempelt, was er berechnet, mit der aktuellen Version; ein Eintrag, der zu einer bereits auf der Website befindlichen Version hinzugefügt würde, erreichte daher nie die Projekte, die diese Version gestempelt hat. Ein Test schlägt bei einer solchen Ergänzung fehl."
    },
    {
      "k": "h",
      "t": "Warum sich eine Version ändert"
    },
    {
      "k": "p",
      "t": "Die meisten Änderungen sind Korrekturen: Ein Ergebnis war falsch und ist jetzt richtig. Manche sind Ablehnungen: Ein Modell, das früher eine Zahl lieferte, liefert jetzt stattdessen eine klare Meldung, weil die Zahl nichts bedeutete. Und eine Version kann auch etwas rückgängig machen: Version 15 zog drei Änderungen von Version 14 zurück, deren Korrekturen aus dem Review nicht mit ihnen auf die Website gelangt waren, und die Versionen 27 bis 29 brachten sie geprüft zurück. Ein mit Version 14 berechnetes Projekt wird über beides informiert."
    },
    {
      "k": "table",
      "caption": "Ergebnisversionen 16 bis 29, zusammengeführt am 4. und 5. November 2026.",
      "head": [
        "Version",
        "Änderung",
        "Art"
      ],
      "rows": [
        [
          "16",
          "Aluminium: Querkraft in Richtung der schwachen Achse wird nachgewiesen",
          "Korrektur"
        ],
        [
          "17",
          "Stahlverbindungen: Momente um die schwache Achse werden nicht mehr ignoriert",
          "Ablehnung"
        ],
        [
          "18",
          "ACI 318 und EN 1992: Betonstäbe mit Torsion werden als nicht nachgewiesen markiert",
          "Ablehnung"
        ],
        [
          "19",
          "Stahlbetonstützen werden auch unter ihrer kleinsten Druckkraft nachgewiesen (SA-2026-041)",
          "Korrektur"
        ],
        [
          "20",
          "Lastgenerator: Eine Decke, die teilweise unter niedrigem Dachtragwerk liegt, behält ihre Flächenlasten (SA-2026-033)",
          "Korrektur"
        ],
        [
          "21",
          "Exportierte Schalenabbildungen zeigen das Feld und den Maßstab des Bildschirms",
          "Korrektur"
        ],
        [
          "22",
          "2D: Ein Mechanismus hinter einer starren Kopplung oder einer Scheibe wird abgelehnt",
          "Ablehnung"
        ],
        [
          "23",
          "2D-Knicken von Stäben, deren Normalkraft sich entlang des Stabs ändert (SA-2026-042)",
          "Korrektur"
        ],
        [
          "24",
          "Korotationale 3D-Analyse mit großen Rotationen um mehrere Achsen (SA-2026-037)",
          "Korrektur"
        ],
        [
          "25",
          "Zwangsbedingungen eines 2D-Modells, das aus einer Y–Z- oder X–Y-Ebene geschnitten wurde (SA-2026-036)",
          "Korrektur"
        ],
        [
          "26",
          "Der maßgebende Wert eines Stabs und die 2D-Umhüllende lesen die tatsächliche Spitze",
          "Korrektur"
        ],
        [
          "27–29",
          "Die von Version 15 zurückgezogenen Änderungen in Basic kehren geprüft zurück",
          "Korrektur"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Die Meldung zur erneuten Prüfung"
    },
    {
      "k": "p",
      "t": "Wenn ein Projekt geöffnet wird, vergleicht die App seinen Stempel mit dem Register und listet die seitdem vorgenommenen Änderungen auf, die dieses Modell betreffen. Ein ebener Rahmen mit Knickanalyse erfährt von der 2D-Knickkorrektur; ein Stahlrahmen ohne Beton erfährt nichts vom Nachweis der Stahlbetonstützen. Die Liste ist keine Einblendung, die verschwindet: Die Meldung hat keine Schließen-Schaltfläche, ignoriert Escape und Klicks außerhalb, und sie lässt sich nur schließen, indem man „Ich habe diese Änderungen gelesen“ ankreuzt und wählt, fortzufahren oder erneut zu rechnen."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic öffnet einen ebenen Rahmen aus den Beispielen, gespeichert als berechnet mit Ergebnisversion 15. Ein Dialog mit dem Titel „Die Ergebnisse haben sich seit der letzten Berechnung dieses Projekts geändert“ listet die Änderungen auf, die es betreffen, darunter die 2D-Knickkorrektur für Stäbe mit veränderlicher Normalkraft und den an der tatsächlichen Spitze gelesenen maßgebenden Wert, jeweils mit Erläuterung, und verlangt, „Ich habe diese Änderungen gelesen“ anzukreuzen, bevor man fortfährt oder die Berechnung erneut ausführt.",
      "caption": "Ein mit Version 15 berechneter ebener Rahmen, heute geöffnet: Nur die Änderungen, die dieses Modell betreffen, werden aufgelistet, jeweils mit dem, was erneut zu prüfen ist."
    },
    {
      "k": "p",
      "t": "Bis das Modell erneut berechnet ist, sind seine Ergebnisse als veraltet markiert: Ein Banner sagt das, und jeder Bericht, jede Arbeitsmappe und jede CSV-Datei, die in der Zwischenzeit exportiert wird, druckt in ihrer Herkunftsangabe eine Warnung VERALTET. „Berechnung und Bemessung erneut ausführen“ rechnet erneut und weist in PRO die Betonstäbe mit der bereits gewählten Bewehrung erneut nach; es bemisst sie nicht neu, weil das die Bewehrungsstäbe des Ingenieurs überschreiben würde."
    },
    {
      "k": "p",
      "t": "Seit dem 4. November (#1406) erklärt die Meldung jede Änderung in der Sprache des Lesers, in allen sechs Sprachen der App. Davor erhielten Leser auf Deutsch, Französisch und Türkisch Titel und Erläuterung auf Englisch: 66 der 72 erfassten Änderungen hatten in diesen Sprachen keinen Text. Jede Übersetzung wurde geprüft, indem sie ohne das Original ins Englische zurückübersetzt und die Bedeutung verglichen wurde: Zahlen, Vorzeichen, welche Last, welcher Nachweis, sichere oder unsichere Seite. Diese Prüfung korrigierte Sätze in allen drei Sprachen und zeigte, dass vier englische Erläuterungen schon in der Quelle mehrdeutig waren; diese wurden in allen sechs Sprachen korrigiert."
    },
    {
      "k": "h",
      "t": "Vor der Korrektur: warnen oder ablehnen"
    },
    {
      "k": "p",
      "t": "Ein Fehler wird meist gefunden, bevor er behoben ist, manchmal Tage vorher. In dieser Zeit steht das betroffene Ergebnis weiter auf dem Bildschirm. Die Regel, der wir folgen, lautet: erst eindämmen, dann beheben (Issue #447). Jeder offene Fehler, der ein falsches Ergebnis liefern kann, erhält an jedem betroffenen Einstiegspunkt entweder eine Warnung oder eine Ablehnung."
    },
    {
      "k": "ul",
      "items": [
        "Eine Warnung behält das Ergebnis bei und zeigt daneben, welches bekannte Problem es betreffen kann und was von Hand zu prüfen ist.",
        "Eine Ablehnung hält das Ergebnis zurück und sagt, warum, wenn die Zahl um einen großen Faktor falsch sein kann, ohne dass man es an der Ausgabe bemerken könnte, etwa bei einem Faktor, der je nach Nummerierung der Stäbe um ein Mehrfaches größer oder kleiner wird."
      ]
    },
    {
      "k": "img",
      "base": "blog/results-refusal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic mit dem Beispiel des verborgenen Mechanismus: ein Zweifeldträger auf drei horizontalen Rollenlagern. Das Panel der kinematischen Analyse zeigt, dass die Gradzählung null ergibt, und eine Meldung sagt, dass das Tragwerk instabil ist, ein Mechanismus, weil kein Lager die horizontale Bewegung behindert; daher wird kein Ergebnis angezeigt.",
      "caption": "Eine Ablehnung: Ein Modell, das ein Mechanismus ist, erhält eine Meldung, die sagt, warum, und keine Zahlen."
    },
    {
      "k": "p",
      "t": "Die Eindämmung wird in einem Verzeichnis geführt, das jedes offene Sicherheitsproblem auflistet, mit seiner Warnung oder Ablehnung, der Bedingung, die sie auslöst, und dem Test, der zeigt, dass sie auslöst, oder dem Nachweis, dass keine Eindämmung nötig ist. Ein Test hält das Verzeichnis und die Liste bekannter Probleme des Rechenkerns in Übereinstimmung, und ein zeitgesteuerter Job vergleicht das Verzeichnis mit den auf GitHub offenen Issues. Die Bedingungen sind bewusst eng: Über die 39 Modelle des Ergebniskorpus hinweg löst jede Warnung bei höchstens zweien aus. Der Pull Request, der dieses Verzeichnis für jedes offene Issue vervollständigt (#807), ist zum Zeitpunkt des Schreibens im abschließenden Review; er kommt vor Release 0.5.0."
    },
    {
      "k": "p",
      "t": "Eine Eindämmung endet, wenn ihre Korrektur eingeht, und sie endet im selben Pull Request. Diese Woche hat #1295 die Ablehnung von 3D-zu-2D-Schnitten entfernt, die Stäbe um die falsche Achse biegen ließen, weil der Schnitt jetzt richtig ist; #1301 hat eine Warnung bei jeder korotationalen 3D-Berechnung durch eine ersetzt, die nur auslöst, wenn sich ein Stabende um mehr als 0,02 rad gegenüber seiner Sehne verdreht, wo die verbleibende Näherung ins Gewicht fallen kann."
    },
    {
      "k": "h",
      "t": "Die Korrekturen dieser Woche"
    },
    {
      "k": "p",
      "t": "2D-Knicken mit Normalkräften entlang der Stäbe (#1324, Version 23). Die geometrische Steifigkeit jedes Stabs verwendete seine mittlere Normalkraft. Wo der Druck zu dem Ende hin zunimmt, das sich am stärksten verdreht, etwa unter Schwerkraft an einem Sparren oder bei einer axialen Einzellast innerhalb des Felds, kam der Knickfaktor zu hoch heraus, und nichts warnte davor. Jeder Stab integriert jetzt seine veränderliche Normalkraft."
    },
    {
      "k": "table",
      "caption": "Ein Stab, λP·L²/EI. Quelle: SA-2026-042.",
      "head": [
        "Fall",
        "Exakt",
        "Vorher",
        "Jetzt"
      ],
      "rows": [
        [
          "Kragarm, Druck von 0 bis P an der Spitze ansteigend",
          "3,477",
          "4,972 (+43 %)",
          "3,542 (+1,9 %)"
        ],
        [
          "Kragarm, axiale Einzellast in Feldmitte",
          "2,961",
          "4,972 (+68 %)",
          "3,056 (+3,2 %)"
        ],
        [
          "Eulers schwere Stütze, größter Druck am Auflager",
          "7,837",
          "4,972 (−37 %)",
          "7,889 (+0,7 %)"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Die verbleibenden wenigen Prozent sind der übliche Diskretisierungsfehler eines Elements pro Stab, und sie sinken, wenn der Stab unterteilt wird. P-Delta verwendet weiterhin die mittlere Normalkraft, und 3D-Knicken mit Lasten entlang der Stäbe behält seine Warnung bis zu seiner eigenen Korrektur."
    },
    {
      "k": "p",
      "t": "Korotationale 3D-Analyse (#1301, Version 24). Die Endrotationen der Stäbe wurden als Rotationsvektoren subtrahiert, was nur exakt ist, wenn alle Rotationen eine gemeinsame Achse haben. Der 45°-Bogen von Bathe–Bolourchi lag 1,3 % neben seiner veröffentlichten Lösung, und eine Netzverfeinerung entfernte ihn von den Referenzen, statt ihn ihnen anzunähern. Rotationen werden jetzt als Rotationsmatrizen zusammengesetzt: Derselbe Bogen liegt innerhalb von 0,4 % zweier unabhängiger veröffentlichter Lösungen und konvergiert zwischen ihnen. Ein Stab, dessen Enden sich um mehr als 0,9π gegeneinander verdrehen, wird abgelehnt, weil das Ergebnis nicht sagen kann, welche volle Umdrehung gemeint ist."
    },
    {
      "k": "p",
      "t": "Ein verborgener Mechanismus in 2D (#1298, Version 22). Eine starre Kopplung oder eine Scheibe von einem Knoten, dessen Stäbe alle gelenkig angeschlossen sind, zum Ende eines Fachwerkstabs ist ein Mechanismus, aber der Rechenkern hielt ihn mit einer winzigen künstlichen Feder und gab Verschiebungen von Hunderten von Kilometern aus, die das Zertifikat dann zertifizierte. Ein solches Modell wird jetzt abgelehnt. Dafür gibt es keinen Sicherheitshinweis: Niemand hätte diese Zahlen verwenden können, ohne es zu bemerken, und die App warnte bereits vor einem wahrscheinlichen Mechanismus. Falsch war die Aussage des Zertifikats, und der Versionseintrag informiert die Projekte, die er betrifft. Ein ähnlicher Fall über ein Verbindungselement statt einer starren Kopplung wurde danach gefunden (#1414); seine Korrektur (#1415) ist im Review und kommt mit 0.5.0."
    },
    {
      "k": "p",
      "t": "Schnitt eines 3D-Modells nach 2D (#1295). Der Schnitt verwendete für jeden Stab das Trägheitsmoment um die starke Achse seines Querschnitts, sodass Stützen in einem Y–Z-Schnitt, Träger in einem X–Y-Schnitt und um 90° gedrehte Stäbe um die falsche Achse gebogen wurden: Ein in Y–Z stehender Rahmen aus IPN 300 verschob sich in 2D seitlich um 0,96 mm gegenüber 13,0 mm in 3D. Jeder Stab biegt sich jetzt in 2D um die Achse, um die er sich in 3D biegt, und Schnitte, die ein ebenes Modell nicht darstellen kann, werden abgelehnt. Diese Korrektur hat keine Ergebnisversion, und das ist Absicht: Ein gespeichertes 2D-Modell rechnet genau wie zuvor, denn falsch war das Modell, das der Schnitt erzeugte. Die Meldung zur erneuten Prüfung kann diese Dateien nicht erreichen, daher ist der Sicherheitshinweis (SA-2026-035) der Weg: Schneiden Sie das Modell erneut aus 3D, oder berechnen Sie es in 3D."
    },
    {
      "k": "h",
      "t": "Nach der Korrektur: Sicherheitshinweise"
    },
    {
      "k": "p",
      "t": "Ein Fehler, der in einer veröffentlichten Version ein falsches oder auf der unsicheren Seite liegendes Ergebnis hätte liefern können, erhält einen Sicherheitshinweis: was falsch war, welche Modelle er betrifft, wie man sie erkennt, was in bereits abgegebenen Ergebnissen erneut zu prüfen ist, und den Fall, der ihn reproduziert. Die Sicherheitshinweise zu den Korrekturen dieser Woche liegen jetzt als Entwürfe im Repository und werden mit Release 0.5.0 veröffentlicht, so wie SA-2026-001 bis 024 mit 0.3.0 und 0.4.0."
    },
    {
      "k": "table",
      "caption": "Sicherheitshinweise, entworfen für die am 4. und 5. November 2026 zusammengeführten Korrekturen.",
      "head": [
        "Hinweis",
        "Was falsch war",
        "Schweregrad"
      ],
      "rows": [
        [
          "SA-2026-033",
          "Der Lastgenerator ließ die Flächenlasten einer Decke weg, wenn ein einzelner niedriger Stab über einem Teil davon lag",
          "Hoch"
        ],
        [
          "SA-2026-034",
          "Die Gleichgewichtsprüfung meldete Übereinstimmung für Lastfälle, deren Prüfung Lasten ausließ",
          "Mittel"
        ],
        [
          "SA-2026-035",
          "Der 3D-zu-2D-Schnitt bog Stäbe um die falsche Querschnittsachse",
          "Hoch"
        ],
        [
          "SA-2026-036",
          "Der 3D-zu-2D-Schnitt auf Y–Z oder X–Y las die Zwangsbedingungen, als stünde der Rahmen in X–Z",
          "Hoch"
        ],
        [
          "SA-2026-037",
          "Die korotationale 3D-Analyse subtrahierte Rotationsvektoren",
          "Mittel"
        ],
        [
          "SA-2026-040",
          "ACI-318- und EN-1992-Nachweise ließen Betonstäbe bestehen, ohne ihre Torsion nachzuweisen",
          "Hoch"
        ],
        [
          "SA-2026-041",
          "Der Nachweis von Stahlbetonstützen kombinierte das größte Moment nur mit der größten Druckkraft",
          "Hoch"
        ],
        [
          "SA-2026-042",
          "2D-Knicken überschätzte den Faktor von Stäben, deren Druck entlang des Stabs zunimmt",
          "Hoch"
        ]
      ]
    },
    {
      "k": "img",
      "base": "blog/results-changelog",
      "w": 1600,
      "h": 1000,
      "alt": "Die Seite mit dem Änderungsprotokoll von Stabileo auf der Website, mit den neuesten Änderungen nach Datum und den Ergebnisänderungen samt ihren Sicherheitshinweisen oben an jedem Tag.",
      "caption": "Die Seite mit dem Änderungsprotokoll: jede Änderung, die die Website erreicht hat, mit den Ergebnisänderungen zuerst."
    },
    {
      "k": "h",
      "t": "Was das nicht leistet"
    },
    {
      "k": "ul",
      "items": [
        "Die Meldung kennt nur erfasste Änderungen. Ein noch nicht gefundener Fehler steht in keinem Register; dafür gibt es die Verifikation hinter dem Rechenkern, und das deckt die Eindämmung ab, sobald etwas gefunden ist.",
        "Sie liest die Merkmale des Modells aus der gespeicherten Datei, und wenn sie sie nicht feststellen kann, zählt sie das Merkmal als vorhanden: Eine Meldung zu viel ist besser als eine Änderung, die dem Modell, das sie betrifft, verborgen bleibt.",
        "Sie kann einer Zahl nicht folgen, sobald diese die App verlassen hat, in eine Zeichnung, eine Tabellenkalkulation oder einen bereits abgegebenen Bericht. Dafür gibt es den Sicherheitshinweis.",
        "Eingedämmt, abgelehnt oder behoben: Das Ergebnis vor der Unterschrift zu prüfen, bleibt Sache des Ingenieurs."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Jeder veröffentlichte Sicherheitshinweis, jeweils mit dem, was erneut zu prüfen ist:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/PROVENANCE.md",
      "label": "Meldung zur erneuten Prüfung, Herkunft und Reproduzierbarkeit",
      "t": "Wie Ergebnisversionen, Stempel und die Meldung im Detail funktionieren:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Index der Sicherheitshinweise",
      "t": "Die Sicherheitshinweise, einschließlich der Entwürfe für 0.5.0:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/issues/447",
      "label": "Issue #447: erst eindämmen, dann beheben",
      "t": "Die Eindämmungsrichtlinie und ihr Fortschritt:"
    }
  ]
};

export default body;
