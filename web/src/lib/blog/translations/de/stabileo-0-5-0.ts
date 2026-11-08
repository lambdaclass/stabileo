import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0: 23 weitere Sicherheitshinweise; alle offenen Ergebnisfehler mit Warnung oder Verweigerung",
  "excerpt": "Seit 0.4.0: dreiundzwanzig Fehler, die falsche Ergebnisse oder Ergebnisse auf der unsicheren Seite liefern konnten, als Sicherheitshinweise dokumentiert und bis auf einen behoben; eine Warnung oder Verweigerung bei jedem noch offenen Fehler; und der Schritt-für-Schritt-Kurs in Basic.",
  "blocks": [
    {
      "k": "p",
      "t": "Seit 0.4.0 haben wir Stabileo weiter auf mehreren Wegen gleichzeitig geprüft: den Solver anhand veröffentlichter Lösungen und anderer Programme, die Bemessungsnachweise anhand durchgerechneter Beispiele, dasselbe Tragwerk mit geänderter Nummerierung, Skalierung und Lage sowie die Dateien, die frühere Versionen gespeichert haben. Dabei fanden wir dreiundzwanzig weitere Fehler, die falsche Ergebnisse oder Ergebnisse auf der unsicheren Seite liefern konnten. Zu jedem gibt es einen Sicherheitshinweis, der beschreibt, was falsch war, wer betroffen ist und was erneut geprüft werden muss. Zweiundzwanzig sind behoben; die plastische Traglastberechnung in 2D (SA-2026-044) bleibt verweigert, bis #758 behoben ist."
    },
    {
      "k": "note",
      "t": "stabileo.com veröffentlicht jede Änderung, sobald sie gemergt ist. Die meisten dieser Korrekturen sind daher bereits online, jeweils seit dem Tag ihrer Übernahme. Projekte, die vor einer sie betreffenden Änderung gespeichert wurden, fordern beim Öffnen eine erneute Prüfung an, in der Sprache des Lesers. Bei zwei Korrekturen ist das nicht möglich: Ein vor #1295 aus 3D ausgeschnittenes 2D-Modell öffnet sich ohne Hinweis, weil das Modell selbst falsch war (SA-2026-035). Erstellen Sie den Schnitt erneut aus 3D oder berechnen Sie das Modell in 3D. Dasselbe gilt für einen vor #1310 aus Excel oder IFC importierten Rechteck- oder Rohrquerschnitt (SA-2026-039): Importieren Sie ihn erneut."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic beim Öffnen eines ebenen Rahmens aus den Beispielen, der als berechnet mit Ergebnisversion 15 gespeichert wurde. Ein Dialog mit dem Titel „Die Ergebnisse haben sich seit der letzten Berechnung dieses Projekts geändert“ listet die betreffenden Änderungen auf, darunter die Korrektur des 2D-Knickens für Stäbe mit veränderlicher Normalkraft und den am tatsächlichen Extremwert abgelesenen maßgebenden Wert, jeweils mit Erklärung. Vor dem Fortfahren oder einer erneuten Berechnung muss „Ich habe diese Änderungen gelesen“ bestätigt werden.",
      "caption": "Ein Projekt, das vor einer es betreffenden Änderung gespeichert wurde, fordert beim Öffnen eine erneute Prüfung an und listet jede Änderung auf."
    },
    {
      "k": "h",
      "t": "Berechnen Sie Ihre Projekte neu"
    },
    {
      "k": "p",
      "t": "Diese Fälle verändern ein Bemessungsergebnis am stärksten. Jeder Sicherheitshinweis enthält das durchgerechnete Beispiel und erklärt, was mit bereits abgegebenen Ergebnissen zu tun ist."
    },
    {
      "k": "table",
      "caption": "Einige Korrekturen in 0.5.0, wie sie in den jeweiligen Sicherheitshinweisen dokumentiert sind, mit der Ergebnisversion, die sie eingeführt hat; SA-2026-035 hat keine, daher ist der Sicherheitshinweis die einzige Benachrichtigung.",
      "head": [
        "Sicherheitshinweis",
        "Ergebnisversion",
        "Was falsch war",
        "Schweregrad"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "Die 3D-Bemessungsnachweise lasen das seitliche Moment oder die seitliche Querkraft: Eine um Mz gebogene Stütze nach CIRSOC 201 wurde über ihre Querschnittshöhe nachgewiesen, mit 36 % zu wenig Bewehrung in einem Beispiel",
          "Kritisch"
        ],
        [
          "SA-2026-028",
          "8",
          "Die Biegebemessung nach EN 1992-1-1 setzte voraus, dass die Zugbewehrung fließt: MRd um bis zu 22 % zu hoch",
          "Hoch"
        ],
        [
          "SA-2026-030",
          "12",
          "Druck nach CIRSOC 301: Ein Querschnitt mit Qa ≤ 0 erhielt eine Tragfähigkeit oberhalb seiner plastischen Normalkrafttragfähigkeit und bestand den Nachweis",
          "Hoch"
        ],
        [
          "SA-2026-041",
          "19",
          "Der Nachweis für Stahlbetonstützen kombinierte das größte Moment nur mit der größten Druckkraft: in einem Beispiel um bis zu 15 % auf der unsicheren Seite",
          "Hoch"
        ],
        [
          "SA-2026-042",
          "23",
          "Die 2D-Knickberechnung überschätzte den Faktor von Stäben, deren Druckkraft entlang des Stabes zunimmt: +43 % bis +68 % für einen Stab",
          "Hoch"
        ],
        [
          "SA-2026-038",
          "35",
          "Die 3D-Knickberechnung verwendete die mittlere Normalkraft jedes Stabes: +43 % beim Faktor eines Stabes mit einer Last entlang des Stabes",
          "Hoch"
        ],
        [
          "SA-2026-043",
          "32",
          "In der harmonischen Analyse ging die Korrektur der nicht berücksichtigten Eigenformen verloren, wenn eine Eigenform viel weicher war als die übrigen: in einem Beispiel bei 2.3 Hz um den Faktor 79 falsch",
          "Hoch"
        ],
        [
          "SA-2026-035",
          "—",
          "Ein Schnitt von 3D nach 2D bog Stäbe um die falsche Querschnittsachse: ein Y–Z-Portalrahmen war 13.5-mal zu steif",
          "Hoch"
        ],
        [
          "SA-2026-033",
          "20",
          "Der Lastgenerator ließ die gesamte Flächenlast eines Geschosses weg, wenn ein tief liegender Stab über einem Teil der Fläche lag",
          "Hoch"
        ],
        [
          "SA-2026-027",
          "11",
          "Die Schalenhüllkurve behielt die Kombination mit der größten Von-Mises-Spannung statt des Extremwerts jeder Komponente: mx in einem Beispiel um 14 % zu niedrig",
          "Hoch"
        ],
        [
          "SA-2026-047",
          "49",
          "In einem Modell mit Schalen verlor ein Lastfall mit vorgegebener Auflagerverschiebung sämtliche Schalenspannungen. Kombinationen und Hüllkurven summierten deshalb nur die Schalenspannungen der übrigen Lastfälle: Die kombinierten Schalenspannungen konnten ohne Warnung auf der unsicheren Seite liegen. In 0.2.0, 0.3.0 und 0.4.0 (#1676)",
          "Hoch"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Jedes Projekt mit Schalen, das vor #1676 berechnet wurde, nennt beim Öffnen SA-2026-047 (#1691): als betroffen, wenn das Modell einen Lastfall mit vorgegebener Auflagerverschiebung und Lastkombinationen enthält, andernfalls als möglicherweise betroffen, weil ein gespeichertes Projekt nicht belegen kann, dass es nie einen solchen Lastfall enthielt. Eine erneute Berechnung entfernt den Hinweis; vergleichen Sie anschließend die Schalenspannungen der Kombinationen, die diesen Lastfall enthalten."
    },
    {
      "k": "p",
      "t": "Die übrigen Sicherheitshinweise betreffen Betonstäbe unter Torsion nach ACI 318 und EN 1992 (SA-2026-040), die Zwangsbedingungen eines aus einer Y–Z- oder X–Y-Ebene nach 2D ausgeschnittenen Modells (SA-2026-036), die korotationale 3D-Analyse mit großen Verdrehungen (SA-2026-037), eine Last bei t = 0 an einem masselosen Knoten in der Zeitverlaufsanalyse (SA-2026-031), die Nullmode eines Mechanismus in der Modalanalyse (SA-2026-032), die Gleichgewichtsprüfung des Berichts nach der Berechnung (SA-2026-034), die plastische Traglastberechnung in 2D, die bis zur Behebung von #758 verweigert bleibt (SA-2026-044), die plastische Traglastberechnung in 3D mit einem Stab ohne nutzbares plastisches Moment, die jetzt verweigert wird (SA-2026-045), die harmonische Analyse, die je Last zwischen modaler Superposition und direkter Lösung wählte und dadurch die Superposition verletzte (SA-2026-046), aus Excel oder IFC importierte Rechteck- und Rohrquerschnitte mit vertauschtem Iy und Iz (SA-2026-039) sowie, für direkte Aufrufe des Rechenkerns, den Querkraftnachweis von Stahl ohne Schubfläche nach AISC 360 und EN 1993 (SA-2026-025 und 026)."
    },
    {
      "k": "h",
      "t": "Weitere Änderungen, die Ergebnisse verändern"
    },
    {
      "k": "p",
      "t": "Auch weitere Änderungen verändern Zahlenwerte und stehen deshalb jeweils im Hinweis zur erneuten Prüfung; die meisten haben keinen eigenen Sicherheitshinweis, und die modale Nullmode ist oben unter SA-2026-032 aufgeführt:"
    },
    {
      "k": "ul",
      "items": [
        "Der maßgebende Wert eines Stabes und die 2D-Hüllkurve lesen den tatsächlichen Extremwert des Schnittgrößenverlaufs statt der nächstgelegenen von 21 Auswertestellen: Die Werte können steigen, in den dokumentierten Fällen um 0.23 % bei einer Dreieckslast und um 1.05 % bei einer kurzen Teilstreckenlast, und sinken nie.",
        "Mechanismen werden verweigert statt berechnet: hinter einem starren Verbindungselement oder einer Deckenscheibe in 2D, hinter einem Verbindungselement in 2D (#1415) und in der Modalanalyse, die zuvor die Nullmode verwarf und die übrigen Eigenformen als vollständig zurückgab; darunter fällt auch ein Mechanismus, der entlang geneigter Auflager gleitet.",
        "Die materiell nichtlineare 3D-Analyse berechnet Stabtragwerke, in denen Stäbe mit und ohne Wölbkonstante gemeinsam vorkommen, sowie Knoten, an die nur Fachwerkstäbe anschließen, statt abzustürzen oder sie zu verweigern; bereits zuvor berechenbare Modelle liefern dieselben Zahlen.",
        "Mehrfache Eigenwerte behalten ihre Vielfachheit, und statische sowie modale Ergebnisse prüfen vor der Anzeige ihr eigenes Gleichgewicht und ihre Orthogonalität.",
        "In Basic unterteilen P-Δ und die kritische Last jeden Stab in Elemente, die plastische Traglastberechnung schließt sich entlastende Gelenke, und die Einflusslinie des Biegemoments setzt ein Moment mit Zug an der Unterseite positiv an, wie alle anderen Momente in Basic.",
        "Ein nicht auswertbarer Bemessungsnachweis wird verweigert, statt als erfüllt zu gelten. Eine weiche, aber reale Knotenverdrehung wird nicht mehr gesperrt, wenn das Modell einen wesentlich steiferen Teil enthält.",
        "Die lineare Analyse warnt, wenn eine Verdrehung 0.1 rad überschreitet, auch innerhalb der Stablänge (einschließlich der Neigung, die die Schubverformung zur Stabachse beiträgt, und der Krümmung aus einem Temperaturgradienten an einem freigegebenen Ende, #1569) sowie anhand der eigenen Verschiebungen einer Kombination. Sie warnt auch, wenn Druckkräfte die Momente um mehr als 10 % vergrößern können; solange diese zweite Warnung erscheint, werden die Nachweise nach CIRSOC 301 zurückgehalten. Bei einer Verdrehungswarnung ist eine geometrisch nichtlineare Analyse mit großen Verdrehungen durchzuführen; bei einer Vergrößerungswarnung eine P-Δ-Analyse oder eine andere Berechnung nach Theorie zweiter Ordnung."
      ]
    },
    {
      "k": "h",
      "t": "Warnung oder Verweigerung, bis die jeweilige Korrektur vorliegt"
    },
    {
      "k": "p",
      "t": "Jeder offene Fehler, der ein falsches Ergebnis liefern kann, hat jetzt an jeder Stelle, über die er den Ingenieur erreichen kann, eine Warnung oder Verweigerung (#807). Eine Warnung zeigt das Ergebnis weiterhin an und nennt daneben den Fehler; eine Verweigerung hält das Ergebnis zurück und erklärt den Grund. Ein Verzeichnis im Repository führt jeden offenen Sicherheitsfehler mit seiner Warnung oder Verweigerung, der auslösenden Bedingung und dem Test auf, der die Auslösung belegt. Ein Test hält dieses Verzeichnis mit dem Rechenkern im Einklang."
    },
    {
      "k": "ul",
      "items": [
        "Verweigert: der plastische Traglastfaktor in 2D, der sich mit der Nummerierung, der Stabrichtung und den Einheiten um bis zu Faktor 4.6 ändern kann (#758); ein Knickfaktor außerhalb der Grenzen seines eigenen Zertifikats (#741); MITC4-Schalen auf verzerrten Netzen bei erheblicher Biegung in der Ebene (#798); sowie MITC4- und MITC9-Schalen auf verwundener Geometrie (#1057).",
        "Mit Warnung: unter anderem Zeitverlaufsanalyse, modale Superposition in 3D, nahezu singuläre Modelle, Kontakt, materiell nichtlineare Analyse und Verbindungselemente mit ungleichen Steifigkeiten.",
        "Abgesehen von den verweigerten Ergebnissen verändert diese Absicherung gegen offene Fehler genau einen Zahlenwert: Die 2D-Auflagerreaktion eines Auflagers mit vorgegebener Setzung und einer Feder in Setzungsrichtung enthält jetzt die Kraft dieser Feder. Alle übrigen der 145.515 Werte im Ergebniskorpus sind identisch."
      ]
    },
    {
      "k": "note",
      "t": "Zwei Verweigerungen entziehen Ergebnisse, die einige Leser verwenden. Plastische Traglastfaktoren ebener Rahmen werden zurückgehalten, bis #758 behoben ist. Auch einige verzerrte Schalennetze, deren Ergebnisse innerhalb von 2 % ihrer Referenzwerte lagen, werden zurückgehalten: Wir haben uns für eine Verweigerung zu viel statt einer ohne Warnung angezeigten falschen Steifigkeit entschieden; die Einschränkung dieser Verweigerung steht auf der Roadmap."
    },
    {
      "k": "h",
      "t": "Außerdem in 0.5.0"
    },
    {
      "k": "ul",
      "items": [
        "Basic vermittelt Baustatik Schritt für Schritt: Statik, Kraftgrößen- und Weggrößenverfahren, Einflusslinien, Theorie zweiter Ordnung und Knicken, plastische Analyse und Dynamik, jeweils Schritt für Schritt in der App erklärt. Die Lerneinheit zur plastischen Traglast bleibt zusammen mit der übrigen plastischen Traglastberechnung in 2D zurückgehalten, bis #758 behoben ist.",
        "Deutsch, Französisch und Türkisch werden in 0.5.0 nicht angeboten: Sie kehren zurück, sobald ein Muttersprachler sie geprüft hat; bis dahin öffnen sich ihre Seiten auf Englisch.",
        "Der KI-Assistent arbeitet mit Ihrem eigenen Anthropic- oder OpenAI-Schlüssel, der nur in Ihrem Browser gespeichert wird. Unter /examples gibt es interaktive Modelle, die der Rechenkern beim Bewegen eines Schiebereglers erneut berechnet.",
        "PRO: Mastergeschosse und ähnliche Geschosse, Plattenergebnisse pro Breiteneinheit mit Hauptmomenten und Hauptrichtungen, der Bericht nach der Berechnung, ein schreibgeschützter Betrachter mit „Duplizieren und bearbeiten“ sowie ein verknüpftes IFC als dargestellte 3D-Referenz.",
        "Mit 0.2.0, 0.3.0 und 0.4.0 gespeicherte Dateien werden bei jeder Änderung geöffnet, migriert und mit denselben Ergebnissen berechnet, außer wenn eine registrierte Ergebnisänderung greift; eine mit einer neueren Version gespeicherte Datei wird mit einer entsprechenden Meldung verweigert.",
        "Dasselbe Tragwerk muss nach Skalierung, Umnummerierung, Umkehrung oder Verschiebung dieselbe Antwort liefern. Das wird bei jeder Änderung für 17 Analysearten und jede Nacht an 8.192 erzeugten Modellen geprüft.",
        "Ebenfalls korrigiert: Die Boden-Bauwerk-Interaktion gibt ihre Auflagerreaktionen aus, die zuvor leer zurückgegeben wurden (#1675); Schalen zweier Familien mit gleicher Nummerierung werden bei Kombinationen und Hüllkurven verweigert, statt eine anstelle der anderen zu kombinieren (#1669); und Von-Mises- und Hauptspannungen von Schalen verursachen bei extremen Größenordnungen keine Über- oder Unterläufe mehr, wobei die Ergebnisse im normalen Bereich bitidentisch bleiben (#1688).",
        "Ein Projekt, das mit einer Version berechnet wurde, die in einer von ihm genutzten Funktion einen bekannten Ergebnisfehler enthielt, nennt bis zur erneuten Berechnung den Sicherheitshinweis (#1657). Projekte protokollieren jede durchgeführte Analyse, sodass ein Hinweis zu einer Analyse bestehen bleibt, bis diese Analyse erneut ausgeführt wird (#1663).",
        "Schneller: Die automatische Speicherung alle 30 s überspringt ein unverändertes Projekt (#1664), ein großer 3D-Arbeitsbereich öffnet sich mit weniger Aufwand für die Speicherbereinigung erneut (#1668), und veröffentlichte 3D-Ergebnisse werden unveränderlich gemacht, sodass die Verweigerungsprüfung auf bekannte Fehler einmal pro Ergebnis läuft (#1689).",
        "Weitere Prüfungen des Rechenkerns: Reziprozität mit Momenten, faktorisierte Kombinationen und Superposition jeder Schalenspannungskomponente (#1665) sowie ein Ergebnisdatensatz pro Knoten, Auflager, Element und Schale für jede Analyse (#1674). Damit wurden die oben genannten Fehler bei der Boden-Bauwerk-Interaktion und den Schalenkombinationen gefunden.",
        "Stabileo Research und Stabileo Tools: ausführbare Reproduktionen veröffentlichter Fachartikel und Benchmarks, nach einem Prüfdurchgang durch drei Gutachter überarbeitet, sowie kostenlose Rechner auf demselben Rechenkern."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Wie Sicherheitshinweise funktionieren und die ersten vierundzwanzig:"
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
      "t": "Die vollständige technische Dokumentation der Änderungen:"
    }
  ]
};

export default body;
