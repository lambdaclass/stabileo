import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0: sechzehn weitere Sicherheitshinweise, und jeder offene Fehler gewarnt oder abgelehnt",
  "excerpt": "Was sich seit 0.4.0 geändert hat: sechzehn Fehler, die ein falsches oder unsicheres Ergebnis liefern konnten, behoben und als Sicherheitshinweise dokumentiert; eine Warnung oder eine Ablehnung für jeden noch offenen Fehler; der Schritt-für-Schritt-Kurs in Basic; und die App in sechs Sprachen.",
  "blocks": [
    {
      "k": "p",
      "t": "Seit 0.4.0 haben wir Stabileo weiter von mehreren Seiten zugleich geprüft: den Rechenkern gegen veröffentlichte Lösungen und andere Programme, die Bemessungsnachweise gegen durchgerechnete Beispiele, dieselbe Struktur umnummeriert, skaliert und verschoben, und die Dateien, die frühere Versionen gespeichert haben. Dabei fanden sich sechzehn weitere Fehler, die ein falsches Ergebnis oder ein Ergebnis auf der unsicheren Seite liefern konnten. Sie sind behoben, und zu jedem gibt es einen Sicherheitshinweis, der sagt, was falsch war, wer betroffen ist und was erneut zu prüfen ist."
    },
    {
      "k": "note",
      "t": "stabileo.com veröffentlicht jede Änderung, sobald sie gemergt ist; die meisten dieser Korrekturen sind daher bereits online, jede seit dem Tag, an dem sie gemergt wurde. Projekte, die vor einer sie betreffenden Änderung gespeichert wurden, fordern beim Öffnen eine erneute Prüfung an, in der Sprache des Lesers. Eine Korrektur kann das nicht: Ein vor #1295 aus 3D geschnittenes 2D-Modell öffnet sich ohne Hinweis, weil das Modell selbst falsch war (SA-2026-035). Schneiden Sie es neu aus dem 3D-Modell, oder rechnen Sie es in 3D."
    },
    {
      "k": "h",
      "t": "Berechnen Sie Ihre Projekte neu"
    },
    {
      "k": "p",
      "t": "Das sind die Fälle, die ein Bemessungsergebnis am stärksten verschieben. Jeder Sicherheitshinweis enthält das durchgerechnete Beispiel und sagt, was mit bereits abgegebenen Ergebnissen zu tun ist."
    },
    {"k": "img", "base": "blog/release-050-recheck-de", "w": 1600, "h": 1000, "alt": "Stabileo Basic auf Deutsch beim Öffnen eines ebenen Rahmens aus den Beispielen, der zuletzt mit der Ergebnisversion 15 berechnet wurde. Die Aufforderung zur Nachprüfung listet die Änderungen, die ihn betreffen, jede mit Titel und Erläuterung auf Deutsch, und verlangt eine Lesebestätigung, bevor man fortfährt oder die Berechnung erneut ausführt.", "caption": "Die Aufforderung zur Nachprüfung erklärt jede Änderung jetzt in allen sechs Sprachen: hier auf Deutsch."},
    {
      "k": "table",
      "caption": "Einige der Korrekturen in 0.5.0, wie der jeweilige Sicherheitshinweis sie dokumentiert, mit der Ergebnisversion, die jede einführte; SA-2026-035 hat keine, daher ist sein Hinweis die einzige Benachrichtigung.",
      "head": [
        "Hinweis",
        "Ergebnisversion",
        "Was falsch war",
        "Schweregrad"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "Die 3D-Bemessungsnachweise lasen das seitliche Moment oder die seitliche Querkraft: Eine Stütze nach CIRSOC 201 mit Biegung um Mz wurde über ihre Höhe nachgewiesen, in einem Beispiel mit 36 % zu wenig Bewehrung",
          "Kritisch"
        ],
        [
          "SA-2026-028",
          "8",
          "Die Biegebemessung nach EN 1992-1-1 nahm an, dass die Zugbewehrung fließt: MRd bis zu 22 % zu hoch",
          "Hoch"
        ],
        [
          "SA-2026-030",
          "12",
          "Druck nach CIRSOC 301: Ein Querschnitt mit Qa ≤ 0 erhielt eine Tragfähigkeit über seiner Quetschlast und bestand den Nachweis",
          "Hoch"
        ],
        [
          "SA-2026-041",
          "19",
          "Der Nachweis von Stahlbetonstützen kombinierte das größte Moment nur mit der größten Druckkraft: in einem Beispiel bis zu 15 % auf der unsicheren Seite",
          "Hoch"
        ],
        [
          "SA-2026-042",
          "23",
          "Die 2D-Knickberechnung überschätzte den Knicklastfaktor von Stäben, deren Druckkraft entlang des Stabs zunimmt: +43 % bis +68 % für einen Stab",
          "Hoch"
        ],
        [
          "SA-2026-035",
          "—",
          "Ein Schnitt von 3D auf 2D bog Stäbe um die falsche Querschnittsachse: ein Y–Z-Rahmen 13,5-mal zu steif",
          "Hoch"
        ],
        [
          "SA-2026-033",
          "20",
          "Der Lastgenerator ließ die gesamte Flächenlast eines Geschosses weg, wenn ein niedriger Stab über einem Teil davon stand",
          "Hoch"
        ],
        [
          "SA-2026-027",
          "11",
          "Die Umhüllende der Schalen behielt die Kombination mit dem größten Von-Mises-Wert statt des Extremwerts jeder Komponente: mx in einem Beispiel 14 % zu niedrig",
          "Hoch"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Die übrigen Sicherheitshinweise betreffen Betonstäbe mit Torsion nach ACI 318 und EN 1992 (SA-2026-040), die Zwangsbedingungen eines Modells, das aus einer Y–Z- oder X–Y-Ebene auf 2D geschnitten wird (SA-2026-036), die korotierende 3D-Berechnung mit großen Rotationen (SA-2026-037), eine Last bei t = 0 auf einem Knoten ohne Masse in der Zeitverlaufsberechnung (SA-2026-031), die Null-Eigenform eines Mechanismus in der Modalanalyse (SA-2026-032), die Gleichgewichtskontrolle des Berichts nach der Berechnung (SA-2026-034) und, für alle, die den Rechenkern direkt aufrufen, die Querkraft bei Stahl ohne Schubfläche nach AISC 360 und EN 1993 (SA-2026-025 und 026)."
    },
    {
      "k": "h",
      "t": "Weitere Änderungen, die Ergebnisse verschieben"
    },
    {
      "k": "p",
      "t": "Das sind keine Fehler mit Sicherheitshinweis, aber sie ändern Zahlen, deshalb steht jede in der Aufforderung zur Nachprüfung:"
    },
    {
      "k": "ul",
      "items": [
        "Der maßgebende Wert eines Stabs und die 2D-Umhüllende lesen den tatsächlichen Spitzenwert des Verlaufs, nicht den nächstgelegenen von 21 Auswertungspunkten: Sie können steigen, in den dokumentierten Fällen um 0,23 % unter einer Dreieckslast und um 1,05 % unter einer kurzen Teillast, und sinken nie.",
        "Mechanismen werden abgelehnt statt berechnet: hinter einer starren Kopplung oder einer Scheibe in 2D, hinter einem Verbindungselement in 2D (#1415) und in der Modalanalyse, die früher die Null-Eigenform verwarf und die übrigen als vollständig zurückgab.",
        "Mehrfache Eigenwerte behalten ihre Vielfachheit, und statische und modale Ergebnisse prüfen ihr eigenes Gleichgewicht und ihre Orthogonalität, bevor sie angezeigt werden.",
        "In Basic teilen P-Δ und die kritische Last jeden Stab in Elemente, die plastische Traglastberechnung schließt Gelenke, die entlastet werden, und die Einflusslinie des Biegemoments zählt Momente mit Zug an der Unterseite als positiv, wie jedes andere Moment in Basic."
      ]
    },
    {
      "k": "h",
      "t": "Gewarnt oder abgelehnt, bis die jeweilige Korrektur vorliegt"
    },
    {
      "k": "p",
      "t": "Jeder offene Fehler, der ein falsches Ergebnis liefern kann, hat jetzt an jeder Stelle, an der er den Ingenieur erreichen kann, eine Warnung oder eine Ablehnung (#807). Eine Warnung behält das Ergebnis und nennt den Fehler daneben; eine Ablehnung hält das Ergebnis zurück und nennt den Grund. Ein Verzeichnis im Repository listet jeden offenen Sicherheitsfehler mit seiner Warnung oder Ablehnung, der Bedingung, die sie auslöst, und dem Test, der beweist, dass sie greift, und ein Test hält es in Übereinstimmung mit dem Rechenkern."
    },
    {
      "k": "ul",
      "items": [
        "Abgelehnt: der plastische Traglastfaktor in 2D, der sich mit der Nummerierung, der Richtung der Stäbe und den Einheiten um bis zum 4,6-Fachen ändern kann (#758); ein Knicklastfaktor außerhalb der Schranken seines eigenen Zertifikats (#741); MITC4-Schalen auf verzerrten Netzen unter nennenswerter Biegung in der Ebene (#798); und MITC4- und MITC9-Schalen auf verwundener Geometrie (#1057).",
        "Gewarnt: unter anderem Zeitverlaufsberechnung, modale Superposition in 3D, nahezu singuläre Modelle, 3D-Knicken mit Lasten entlang der Stäbe, Kontakt, materiell nichtlineare Berechnung und Verbindungselemente mit ungleichen Steifigkeiten.",
        "Abgesehen von dem, was sie ablehnt, ändert diese Absicherung offener Fehler eine einzige Zahl: Die 2D-Reaktion eines Auflagers mit vorgegebener Setzung, das in Setzungsrichtung zusätzlich eine Feder hat, enthält jetzt die Kraft dieser Feder. Jeder andere der 145.515 Werte im Ergebniskorpus ist identisch."
      ]
    },
    {
      "k": "note",
      "t": "Zwei Ablehnungen nehmen Ergebnisse weg, die manche Leser nutzen. Plastische Traglastfaktoren ebener Rahmen werden zurückgehalten, bis #758 behoben ist. Auch einige verzerrte Schalennetze, deren Ergebnisse innerhalb von 2 % ihrer Referenzen lagen, werden zurückgehalten: Wir haben lieber eine Ablehnung zu viel als eine falsche Steifigkeit, die ohne Warnung angezeigt wird, und die Eingrenzung steht auf der Roadmap."
    },
    {
      "k": "h",
      "t": "Außerdem in 0.5.0"
    },
    {
      "k": "ul",
      "items": [
        "Basic lehrt Tragwerksberechnung Schritt für Schritt: Statik, Kraft- und Weggrößenverfahren, Einflusslinien, Theorie II. Ordnung und Knicken, plastische Berechnung und Dynamik, jeweils Schritt für Schritt in der App erklärt.",
        "Die App und die öffentliche Website auf Deutsch, Französisch und Türkisch, neben Spanisch, Englisch und Portugiesisch. Die Aufforderung zur Nachprüfung erklärt jede Änderung in allen sechs Sprachen.",
        "PRO: Mustergeschosse und ähnliche Geschosse, Plattenergebnisse je Breiteneinheit mit Hauptmomenten und Hauptrichtungen, der Bericht nach der Berechnung, ein schreibgeschützter Viewer mit „Duplizieren und bearbeiten“ und ein verknüpftes IFC, als 3D-Referenz dargestellt.",
        "Dateien, die mit 0.2.0, 0.3.0 und 0.4.0 gespeichert wurden, öffnen sich, werden migriert und liefern bei jeder Änderung dieselben Ergebnisse, außer wo eine registrierte Ergebnisänderung greift; eine Datei, die mit einer neueren Version gespeichert wurde, wird mit einer Meldung abgelehnt, die das sagt.",
        "Dieselbe Struktur, skaliert, umnummeriert, umgekehrt oder verschoben, muss dieselbe Antwort liefern; geprüft wird das in 17 Berechnungsarten bei jeder Änderung und jede Nacht an 8192 generierten Modellen.",
        "Stabileo Research und Stabileo Tools: ausführbare Reproduktionen veröffentlichter Arbeiten und Benchmarks, nach einer Durchsicht durch drei Gutachter überarbeitet, und kostenlose Rechner, die auf demselben Rechenkern laufen."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Wie Sicherheitshinweise funktionieren, und die ersten vierundzwanzig:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Verzeichnis der Sicherheitshinweise",
      "t": "Jeder Sicherheitshinweis mit Schweregrad, Issue und Korrektur:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Änderungsprotokoll",
      "t": "Die vollständige technische Dokumentation:"
    }
  ]
};

export default body;
