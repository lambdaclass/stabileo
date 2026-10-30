import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Sicherheitshinweise: welche Ergebnisse sich geändert haben und was zu tun ist",
  "excerpt": "Die Fehler in Stabileo, die falsche Ergebnisse oder Ergebnisse auf der unsicheren Seite liefern konnten: wen sie betreffen, wie man erkennt, ob ein Modell betroffen ist, was bis zur Korrektur zu tun ist und wann sie behoben wurden.",
  "blocks": [
    {
      "k": "p",
      "t": "Mit den Ergebnissen von Stabileo werden reale Tragwerke bemessen. Wenn wir einen Fehler finden, der ein falsches Ergebnis erzeugt haben könnte, und besonders eines auf der unsicheren Seite, veröffentlichen wir ihn als Sicherheitshinweis: was falsch war, welche Modelle betroffen sind, wie man sie erkennt, was zu tun ist, bis die Korrektur online ist, und was an bereits verwendeten Ergebnissen erneut zu prüfen ist."
    },
    {
      "k": "p",
      "t": "Fast alle dieser Fehler hat unser eigenes Verifikationsprogramm gefunden: Vergleich mit sieben anderen Finite-Elemente-Programmen, veröffentlichte Rechenbeispiele, Tests physikalischer Invarianten und eine Durchsicht der Herleitung jedes Elements. Sie zu veröffentlichen gehört zu dieser Arbeit: Ein Fehler, der nicht gemeldet wird, bleibt in den bereits abgegebenen Berechnungen."
    },
    {
      "k": "note",
      "t": "Stand 28. Oktober 2026: SA-2026-001 bis 020 sind in Version 0.3.0 behoben, SA-2026-021 bis 024 in Version 0.4.0 (online auf stabileo.com, SA-2026-021 und 022 seit dem 22. Oktober, SA-2026-023 und 024 seit dem 25. und 26. Oktober). Die Veröffentlichung gehört zu unserer Art, die Ergebnisse zu verifizieren, und ist kein Zeichen dafür, dass die Hinweise noch offen sind. Ein Sicherheitshinweis gilt als behoben, wenn die Korrektur auf stabileo.com online ist, nicht schon, wenn die Änderung existiert. Solange ein Hinweis offen ist, verwenden Sie die angegebene Umgehung und prüfen Sie das betroffene Ergebnis von Hand, bevor Sie unterschreiben."
    },
    {
      "k": "h",
      "t": "Übersicht"
    },
    {
      "k": "table",
      "caption": "Veröffentlichte Sicherheitshinweise. Schweregrad: kritisch, wenn Tragfähigkeit oder Beanspruchung ohne sichtbares Anzeichen weit auf der unsicheren Seite liegen konnten.",
      "head": [
        "Hinweis",
        "Was",
        "Schweregrad",
        "Status"
      ],
      "rows": [
        [
          "SA-2026-021",
          "Freistehende Dächer: kein Wind in Firstrichtung und quer dazu weniger als das Minimum nach §2.1.5 (17 % davon bei 20 m/s)",
          "Hoch",
          "Behoben in 0.4.0"
        ],
        [
          "SA-2026-022",
          "Bei Erddruck H fehlte die Kombination, in der die ständige Last ihm entgegenwirkt (in einem Beispiel 27 bis 45 % zu niedrig)",
          "Hoch",
          "Behoben in 0.4.0"
        ],
        [
          "SA-2026-023",
          "Stahlbetonstützen: Der Nachweis las nur ein Vorzeichen des Moments; ungleichmäßige Stabanordnungen (6, 10, 14…) bestanden auf der stärkeren Seite",
          "Kritisch",
          "Behoben in 0.4.0"
        ],
        [
          "SA-2026-024",
          "Fundamente, Knoten, Decken, Wände und der Stahloptimierer wurden für die Lasten ohne Teilsicherheitsbeiwerte bemessen, wenn Kombinationen definiert, aber nicht berechnet waren (Live-Berechnung, eine fehlgeschlagene Berechnung der Kombinationen oder eine leere Liste aktiver Kombinationen)",
          "Hoch",
          "Behoben in 0.4.0"
        ],
        [
          "SA-2026-013",
          "Gekrümmte Schalen: Biegemomente als null ausgegeben; Spannungen enthielten die freie Temperaturdehnung",
          "Hoch",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-014",
          "Plastischer Kollaps in 3D: Der Faktor hing von der Elementnummerierung ab (bis zum 2,4-Fachen der Traglast)",
          "Hoch",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-015",
          "Seile mit Eigengewicht erhielten in statisch unbestimmten Tragwerken zu wenig Zugkraft",
          "Hoch",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-011",
          "3D-Auflager, von Feder auf eingespannt oder gelenkig umgestellt, als Feder berechnet",
          "Hoch",
          "Behoben am 2026-10-20"
        ],
        [
          "SA-2026-017",
          "Boden-Bauwerk-Interaktion: Die Kennlinien p-y, t-z und q-z wichen von ihren Referenzen ab",
          "Hoch",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-008",
          "Antwortspektrum: Gesamterdbebenkraft unter CQC mit SRSS überlagert; Beteiligung ohne die an die Auflager gekoppelte Masse",
          "Hoch",
          "Behoben am 2026-10-21"
        ],
        [
          "SA-2026-007",
          "3D-Knicken ohne Drill- oder Biegedrillknickformen",
          "Hoch",
          "Behoben am 2026-10-21"
        ],
        [
          "SA-2026-006",
          "Ebenes Modell in 3D berechnet: Knotenmomente und eingeprägte Verdrehungen umgekehrt",
          "Hoch",
          "Behoben am 2026-10-21"
        ],
        [
          "SA-2026-005",
          "Geneigte Stäbe in 2D: Normalkraft ohne die Lastkomponente in Stablängsrichtung",
          "Hoch",
          "Behoben am 2026-10-21"
        ],
        [
          "SA-2026-019",
          "Temperaturlasten auf Stäben (Rechenkern und WASM; die App glich seit 2026-10-07 aus): α von Stahl und Höhe eines Vollrechtecks",
          "Mittel",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-012",
          "Materiell nichtlineare Berechnung (nur Rechenkern und WASM): elastische Stabschnittgrößen nach dem Fließen",
          "Mittel",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-016",
          "Bögen (gekrümmte Balken im Rechenkern, Bogenwerkzeug der App): Iy und Iz an nahezu senkrechten Segmenten vertauscht",
          "Mittel",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-018",
          "MITC9-Schalen (nur Rechenkern und WASM) auf gekrümmter Geometrie durch Starrkörperbewegung verzerrt",
          "Mittel",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-020",
          "Materiell nichtlineare Berechnung in 3D (nur Rechenkern und WASM): Fließfläche weniger konservativ als in 2D",
          "Mittel",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-010",
          "Spektrales Zertifikat ließ nicht endliche Ergebnisse durch",
          "Mittel",
          "Behoben am 2026-10-19"
        ],
        [
          "SA-2026-009",
          "Volumenschale SHB8 bei Biegung dünner Platten 22 % zu steif (Durchbiegungen 18 % zu niedrig)",
          "Mittel (höher in statisch unbestimmten Tragwerken)",
          "Behoben am 2026-10-19"
        ],
        [
          "SA-2026-004",
          "Berechnungen, die einen Teil des Modells ignorierten (Dynamik, Knicken, plastischer Kollaps)",
          "Kritisch",
          "Behoben in 0.2.0"
        ],
        [
          "SA-2026-003",
          "Nachweise für Stahl, kaltgeformte Profile und Anschlüsse überschätzten die Tragfähigkeit",
          "Kritisch",
          "Behoben in 0.2.0"
        ],
        [
          "SA-2026-002",
          "Betonnachweise (CIRSOC 201, ACI 318) überschätzten die Tragfähigkeit",
          "Kritisch",
          "Behoben in 0.2.0"
        ],
        [
          "SA-2026-001",
          "Erzeugte Kombinationen und Lasten (CIRSOC 101, 102, 103) auf der unsicheren Seite",
          "Hoch",
          "Behoben in 0.2.0"
        ]
      ]
    },
    {
      "k": "table",
      "caption": "In jedem Sicherheitshinweis dokumentierte Fälle: der richtige Wert und der Wert, den Stabileo ausgab.",
      "head": [
        "Hinweis",
        "Fall",
        "Richtig",
        "Ausgegeben",
        "Einheit"
      ],
      "rows": [
        [
          "SA-2026-024",
          "Rahmen 6 × 4 m, 20 kN/m ständige Last auf dem Riegel, 15 kN Wind, 1.2D + 1.6W, nach einer Bearbeitung mit eingeschalteter Live-Berechnung: vertikale Auflagerreaktion des luvseitigen Fundaments",
          "65,61",
          "56,01",
          "kN"
        ],
        [
          "SA-2026-023",
          "Stütze 30×30 cm, 6 Ø20 (drei an der Unterseite), Nu = 100 kN: φMn mit gedrückter Seite mit drei Stäben",
          "78,57",
          "101,57",
          "kN·m"
        ],
        [
          "SA-2026-013",
          "Kragarm aus vier gekrümmten Schalen, 4 × 1 × 0,2 m, 10 kN am freien Ende: mx im Element an der Einspannstelle",
          "35,0",
          "0",
          "kN·m/m"
        ],
        [
          "SA-2026-014",
          "Räumlicher Rahmen mit 10 Stäben (frame3d-2), umnummeriert: plastischer Traglastfaktor",
          "176,47",
          "424,3",
          "—"
        ],
        [
          "SA-2026-015",
          "Abgespannter Mast 20 m, Abspannseil aus Stahl 1 cm², 5 kN an der Spitze: Seilkraft",
          "5,18",
          "4,34",
          "kN"
        ],
        [
          "SA-2026-011",
          "Balken mit Auflagern bei 0, 4 und 8 m, Auflager bei 8 m als eingespannt gezeichnet: Durchbiegung an diesem Auflager",
          "0",
          "-14,4",
          "mm"
        ],
        [
          "SA-2026-017",
          "Weicher Ton c = 20 kPa, D = 1 m, z = 4 m: Grenzwiderstand des Bodens p_u",
          "124",
          "84",
          "kN/m"
        ],
        [
          "SA-2026-008",
          "Zwei Eigenformen bei ω und 1.1ω: Gesamterdbebenkraft bezogen auf den CQC-Wert",
          "1,00",
          "0,81",
          "—"
        ],
        [
          "SA-2026-007",
          "Stütze mit Kreuzquerschnitt 200×10 mm, 1,5 m: kritische Last",
          "2993",
          "5860",
          "kN"
        ],
        [
          "SA-2026-006",
          "Rahmen mit Knotenmomenten und Knotenkräften: Seitenverschiebung",
          "0,92",
          "2,52",
          "mm"
        ],
        [
          "SA-2026-005",
          "Sparren eines Satteldachs: Normalkraft am Fußpunkt",
          "-56,67",
          "-41,67",
          "kN"
        ],
        [
          "SA-2026-019",
          "IPE 300, beidseitig eingespannt, Temperaturgradient 20 °C: Endmoment",
          "14,04",
          "9,76",
          "kN·m"
        ],
        [
          "SA-2026-012",
          "Plastizierter Kragarm 4 m, Einzellast am Ende 1.2·Mp/L: Moment an der Einspannung",
          "1012,5",
          "101250",
          "kN·m"
        ],
        [
          "SA-2026-016",
          "Halbkreisbogen 5 m in der Y–Z-Ebene, 40 Segmente: Durchbiegung im Scheitel",
          "-7,29",
          "-6,18",
          "mm"
        ],
        [
          "SA-2026-018",
          "Zylindrisches MITC9-Feld 2×2 m, Stich 0,2 m, Stahl, 50 mm, Starrkörperdrehung um 1 mrad: größte Vergleichsspannung nach von Mises an den Knoten",
          "0",
          "101",
          "MPa"
        ],
        [
          "SA-2026-020",
          "3D-Kragarm 4 m, N = 0.5·Np, Einzellast am Ende: Last bei Fließbeginn",
          "158,2",
          "182,7",
          "kN"
        ],
        [
          "SA-2026-009",
          "Dünne Platte unter Biegung, ν = 0,3: Steifigkeit bezogen auf den richtigen Wert",
          "1,000",
          "1,225",
          "—"
        ]
      ]
    },
    {
      "k": "h",
      "t": "SA-2026-021: Mindestwindlast auf freistehenden Dächern"
    },
    {
      "k": "p",
      "t": "Ein freistehendes Dach (eine offene Halle, ein Carport, ein Vordach) erhielt nur die Nettodrücke der Abbildungen 2.4-4 bis 2.4-7, senkrecht zur Dachfläche. CIRSOC 102-2025 §2.1.5 verlangt außerdem, dass die Windkraft auf ein offenes Gebäude mindestens 0.75 kN/m² × Af beträgt, als eigener horizontaler Lastfall. Ohne dieses Minimum war die horizontale Kraft bei Wind in Firstrichtung null, und quer dazu lag sie bei niedrigen und mittleren Geschwindigkeiten unter dem Minimum. Jede Richtung hat jetzt diesen Lastfall."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-021-free-roof-wind-minimum.md",
      "label": "SA-2026-021 vollständig",
      "t": "Der Sicherheitshinweis mit den Messungen:"
    },
    {
      "k": "h",
      "t": "SA-2026-022: Erddruck, dem die ständige Last entgegenwirkt"
    },
    {
      "k": "p",
      "t": "Bei Lasten H verlangt CIRSOC 101-2025 die Auswirkungen nicht wirkender Lasten zu berücksichtigen. Die Kombinationen 0.9 D + 1.6 H und 1.2 D + 1.6 H wurden nie erzeugt, sodass dort, wo die ständige Last dem Erddruck entgegenwirkt (Kippen oder Gleiten einer Wand), die Auswirkung zu niedrig ausfiel. Sie werden jetzt erzeugt, mit oder ohne Wind oder Erdbeben im Modell."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-022-earth-pressure-dead-load-resisting.md",
      "label": "SA-2026-022 vollständig",
      "t": "Der Sicherheitshinweis mit dem Beispiel:"
    },
    {
      "k": "h",
      "t": "SA-2026-023: Stahlbetonstützen mit ungleichmäßiger Stabanordnung"
    },
    {
      "k": "p",
      "t": "Die Momente an den Auswertungsstellen gehen als Beträge in den Stützennachweis ein, die Tragfähigkeit unter Normalkraft und einachsiger Biegung wurde aber nur für ein Vorzeichen berechnet, mit gedrückter Oberseite. Bei 6, 10, 14, 18 oder 22 Stäben legt die Bemessung die zusätzlichen Stäbe an die Unterseite und die rechte Seite, das ist also das starke Vorzeichen: Bei umgekehrtem Moment ist die Tragfähigkeit geringer, und das wurde nie nachgewiesen. Eine Stütze 30×30 cm mit 6 Ø20 unter 100 kN Druck trägt in der einen Richtung 101,57 kN·m und in der anderen 78,57, und sie bestand bei Mu = 100 kN·m. Betroffen ist der Stützennachweis nach CIRSOC 201 bei einachsiger Biegung (für die vorhandenen Stäbe eines Bauteils, für die Bemessung und für die Nachprüfung im Rechenkern); der Nachweis für zweiachsige Biegung nahm bereits den ungünstigsten Quadranten."
    },
    {
      "k": "ul",
      "items": [
        "Wie Sie erkennen, ob Sie betroffen sind: Das Modell hat Betonstützen mit Nachweis nach CIRSOC 201, deren Stäbe nicht symmetrisch zur Biegeachse liegen: 6, 10, 14, 18 oder 22 Stäbe aus der Bemessung oder von Hand eingegebene Seiten mit unterschiedlicher Stabanzahl auf gegenüberliegenden Seiten.",
        "Was zu tun ist: Verwenden Sie in einer Version vor der Korrektur symmetrische Anordnungen (4, 8, 12, 16, 20 oder 24 Stäbe oder gleiche gegenüberliegende Seiten), oder weisen Sie die Stütze zusätzlich mit gespiegelten Stäben nach: Die kleinere der beiden Tragfähigkeiten ist maßgebend.",
        "Status: behoben in 0.4.0, online auf stabileo.com seit dem 25. Oktober 2026. Der Rechenkern berechnet beide Vorzeichen und nimmt das schwächere; symmetrische Anordnungen liefern genau dasselbe wie vorher."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-023-column-moment-sign.md",
      "label": "SA-2026-023 vollständig",
      "t": "Der Sicherheitshinweis mit dem Testfall:"
    },
    {
      "k": "h",
      "t": "SA-2026-024: Fundamente, Knoten, Decken und Wände für Lasten ohne Teilsicherheitsbeiwerte bemessen"
    },
    {
      "k": "p",
      "t": "Waren Kombinationen definiert, aber keine davon berechnet, lasen Fundamente und Knoten das Ergebnis auf dem Bildschirm, das dann alle Lasten mit dem Faktor 1 enthält: Sie wurden für die Gebrauchslasten statt für die Bemessungskombinationen bemessen. Das geschah bei eingeschalteter Live-Berechnung (nach einer Bearbeitung berechnet sie nur „Alle Lasten“ neu, solange die Einzelansicht angezeigt wird) oder wenn die Berechnung der Kombinationen fehlschlug und die Einzelberechnung an ihre Stelle trat. In einem Rahmen unter 1.2D + 1.6W fiel die Auflagerreaktion eines Fundaments 15 % zu niedrig aus; mit ständiger Last und Nutzlast 29 bis 38 %. Dasselbe geschah bei Decken und Wänden, beim Stahloptimierer und bei einer leeren Liste aktiver Kombinationen. Jede Bemessung verweigert jetzt die Ausführung und nennt den Grund, bis die Kombinationen berechnet sind."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-024-design-on-unfactored-results.md",
      "label": "SA-2026-024 vollständig",
      "t": "Der Sicherheitshinweis mit dem Beispiel:"
    },
    {
      "k": "h",
      "t": "SA-2026-014: Plastischer Kollaps in 3D hing von der Nummerierung ab"
    },
    {
      "k": "p",
      "t": "Bei zweiachsiger Biegung konnten die Prüfungen, die ein rückwärts drehendes Gelenk schließen und ein geschlossenes, aus der Fließfläche gedrücktes wieder öffnen, in einen Zyklus geraten. Der Gleichungslöser machte in dem Zustand weiter, in dem ihn die Elementreihenfolge zurückließ, und drückte einen geschlossenen Querschnitt durch die Fließfläche: Dasselbe Tragwerk ergab umnummeriert Traglastfaktoren von 75,9 bis 424,3, gegenüber einem zertifizierten Wert von 176,47. Die Berechnung hält jetzt beim letzten konsistenten Zustand an und gibt diesen Faktor als untere Schranke aus, mit einer Warnung, gleich für jede Nummerierung. Betroffen ist der 3D-Pushover im PRO-Tab."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-014-plastic-3d-element-order.md",
      "label": "SA-2026-014 vollständig",
      "t": "Der Sicherheitshinweis mit dem Testmodell und dem zertifizierten Wert:"
    },
    {
      "k": "h",
      "t": "SA-2026-011: 3D-Auflager von Feder auf eingespannt umgestellt"
    },
    {
      "k": "p",
      "t": "Wurde der Typ eines Auflagers mit Federn geändert, blieben seine Federkonstanten erhalten. Im 3D-Modus wurden sie zusammen mit der Festhaltung an den Gleichungslöser übergeben, und dieser behandelte den Freiheitsgrad als elastisch: Das als eingespannt gezeichnete Auflager wurde als Feder berechnet. Betroffen sind im 3D-Modus berechnete Modelle, einschließlich ebener Modelle, die in 3D berechnet wurden; der 2D-Modus ist nicht betroffen."
    },
    {
      "k": "ul",
      "items": [
        "Wie Sie erkennen, ob Sie betroffen sind: Ein Auflager war zunächst eine Feder (oder hatte Federkonstanten) und wurde dann auf eingespannt, gelenkig oder verschieblich umgestellt oder bekam einen Freiheitsgrad als festgehalten markiert. In den Ergebnissen zeigt dieses Auflager eine Verschiebung oder Verdrehung ungleich null.",
        "Was zu tun ist: Berechnen Sie auf stabileo.com die 3D-Modelle neu, deren Auflager von Federn auf starr umgestellt wurden, und vergleichen Sie die Ergebnisse in der Nähe dieser Auflager mit denen, die Sie bereits verwendet haben.",
        "Status: auf stabileo.com am 20. Oktober 2026 behoben. Jeder festgehaltene Freiheitsgrad wird als festgehalten berechnet, auch in zuvor gespeicherten Projekten."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-011-springs-on-fixed-supports.md",
      "label": "SA-2026-011 vollständig",
      "t": "Der Sicherheitshinweis mit der Reproduktion und dem Testmodell:"
    },
    {
      "k": "h",
      "t": "SA-2026-013: Momente und Temperaturspannungen gekrümmter Schalen"
    },
    {
      "k": "p",
      "t": "Gekrümmte Schalen (als gekrümmt markierte Vierecke) gaben unabhängig von der Biegung mx = my = mxy = 0 aus, und unter einer Temperaturlast enthielten ihre Spannungen die freie Temperaturdehnung: Eine frei dehnbare Schale ergab E·α·ΔT/(1−ν), eine behinderte keine. Außerdem übergab die App die Temperatur eines gekrümmten Vierecks wie die eines ebenen, und der Rechenkern verwarf sie: Die Schale wurde ohne Erwärmung berechnet. Diese Ergebnisse lasen die Isoliniendarstellungen der Schalen (auch in exportierten Abbildungen), die Ergebnistabelle und der PDF-Bericht von PRO sowie die Deckenbemessung, wenn ein Feld ein gekrümmtes Viereck war; die Ergebnis-Arbeitsmappe und die CSV-Dateien ließen diese Momente bereits leer."
    },
    {
      "k": "ul",
      "items": [
        "Wie Sie erkennen, ob Sie betroffen sind: Das Modell hat gekrümmte Vierecke und Sie haben deren Momente verwendet (Isolinien, Tabelle oder Bericht von PRO, Deckenbemessung), oder es hat eine Temperaturlast auf einem gekrümmten Viereck.",
        "Was zu tun ist: Berechnen Sie diese Modelle neu und wiederholen Sie jede Bemessung oder jeden Nachweis, der ihre Momente oder ihre Spannungen unter Temperatur verwendet hat. Bis dahin modellieren Sie die Fläche mit ebenen Vierecken (MITC4).",
        "Status: behoben in 0.3.0, online auf stabileo.com seit dem 21. Oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-013-curved-shell-moments-and-thermal.md",
      "label": "SA-2026-013 vollständig",
      "t": "Der Sicherheitshinweis mit dem Test-Kragarm und den Temperaturfällen:"
    },
    {
      "k": "h",
      "t": "SA-2026-017: Bodenkennlinien in der Boden-Bauwerk-Interaktion"
    },
    {
      "k": "p",
      "t": "Die Bodenkennlinien folgten nicht den Referenzen, die sie angaben. Bei weichem Ton fehlte der J-Term nach Matlock (Grenzwiderstand nahe der Oberfläche um ein Drittel bis die Hälfte zu niedrig); bei Sand wurde immer der zyklische Faktor A = 0,9 und eine gestufte k-Tabelle verwendet; bei steifem Ton sprang der Widerstand bei y50 von der Hälfte auf den vollen Wert und fiel danach auf 70 %. Bei den Kennlinien t-z und q-z (nur Rechenkern und WASM) fehlten der Schaftumfang und die Fußfläche. Betroffen ist PRO → Erweitert → Boden-Bauwerk-Interaktion. Das Fenster fragt jetzt nach J und der Belastungsart des Sandes, und der Rechenkern weist eine Kennlinie mit fehlender Eingabe zurück, statt sie anzunehmen. Was zu tun ist: Berechnen Sie diese Modelle neu und prüfen Sie Durchbiegungen und Momente der Pfähle erneut."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-017-soil-curves.md",
      "label": "SA-2026-017 vollständig",
      "t": "Der Sicherheitshinweis mit Werten vorher und nachher für jede Kennlinie:"
    },
    {
      "k": "h",
      "t": "SA-2026-019: Temperaturlasten auf Stäben"
    },
    {
      "k": "p",
      "t": "Der Rechenkern berechnete die Temperaturlast jedes Stabs mit α = 12·10⁻⁶ /°C (dem Wert von Stahl) und mit der Höhe des äquivalenten Vollrechtecks, √(12·I/A). Bei einem IPE fiel ein Moment aus Temperaturgradient 30 % zu niedrig aus, und bei Aluminium die Normalkraft aus Temperatur fast um die Hälfte. Die App glich beides seit dem 7. Oktober 2026 aus; betroffen sind daher die direkte Nutzung des Rechenkerns oder seiner WASM-API sowie Temperaturmodelle, die vor diesem Datum in der App berechnet wurden."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-019-frame-thermal-alpha-depth.md",
      "label": "SA-2026-019 vollständig",
      "t": "Der Sicherheitshinweis mit den Testfällen:"
    },
    {
      "k": "h",
      "t": "SA-2026-012: Stabschnittgrößen in der materiell nichtlinearen Berechnung"
    },
    {
      "k": "p",
      "t": "Nachdem ein Stab plastiziert war, brachte der Gleichungslöser die Lasten mit der abgeminderten Steifigkeit ins Gleichgewicht, gab aber Schnittgrößen aus, die mit der elastischen Steifigkeit berechnet waren. Verschiebungen und Auflagerreaktionen waren richtig, Stabschnittgrößen und Ausnutzung nicht: An einem Kragarm war das ausgegebene Moment 100-mal so groß wie das tatsächliche. Dieser Gleichungslöser ist nur über den Rechenkern oder seine WASM-API erreichbar: Kein Bildschirm der App ruft ihn auf, daher sind auf stabileo.com erhaltene Ergebnisse nicht betroffen."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-012-material-nonlinear-member-forces.md",
      "label": "SA-2026-012 vollständig",
      "t": "Der Sicherheitshinweis mit dem Test-Kragarm:"
    },
    {
      "k": "h",
      "t": "SA-2026-016: Querschnittsachsen an den nahezu senkrechten Segmenten eines Bogens"
    },
    {
      "k": "p",
      "t": "Die geraden Segmente eines Bogens übernahmen die standardmäßigen lokalen Achsen eines geraden Stabs, die bei einem Stab mit weniger als 2,56° Abweichung von der Senkrechten die globale X-Achse als Bezug nehmen. In einem Bogen außerhalb der X–Z-Ebene drehte das den Querschnitt der nahezu senkrechten Segmente an den Kämpfern um 90°: Iy und Iz waren dort vertauscht. Bei einem Halbkreis aus 40 Segmenten in der Y–Z-Ebene fiel die Durchbiegung im Scheitel 15 % zu niedrig aus. Betroffen sind gekrümmte Balken im Rechenkern und Bögen, die mit dem Bogenwerkzeug im Tab Stäbe (PRO) gezeichnet wurden, wenn ein Segment nahezu senkrecht ist; Kurven im Grundriss sind nicht betroffen. Zuvor gespeicherte Bögen erhalten beim Öffnen des Projekts die korrigierten Achsen."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-016-curved-member-axes.md",
      "label": "SA-2026-016 vollständig",
      "t": "Der Sicherheitshinweis mit dem Testbogen:"
    },
    {
      "k": "h",
      "t": "SA-2026-015: Zugkraft in Seilen mit Eigengewicht"
    },
    {
      "k": "p",
      "t": "Die Seilberechnung verwendete den Ernst-Modul, die Tangente des Sehnengesetzes eines unter Eigengewicht durchhängenden Seils, als wäre er eine Sekante ausgehend von der geraden Sehne. Der Durchhang verbraucht Sehnenlänge, daher braucht ein Seil für eine gegebene Dehnung mehr Zugkraft als EA·ε, nicht weniger. Wo das Gleichgewicht allein die Seilkraft festlegt, war die Zugkraft richtig; wo das Seil die Last mit anderen Stäben teilt (ein abgespannter Mast, ein Seil, das einen Rahmen aussteift), erhielt das Seil zu wenig Zugkraft und die benachbarten Stäbe zu viel: im Testmast 4,34 kN statt 5,18 kN, und bei kleineren Lasten konvergierte die Iteration nicht. In der App betrifft das 3D-Modelle mit Stäben, deren Verhalten „Seil“ ist und deren Material eine Dichte hat."
    },
    {
      "k": "ul",
      "items": [
        "Wie Sie es erkennen: Das Modell hat Stäbe mit dem Verhalten „Seil“, ihr Material hat eine Dichte, und das Seil ist nicht der einzige Lastpfad.",
        "Was zu tun ist: Prüfen Sie die maßgebenden Seil- und Verankerungskräfte von Hand, oder berechnen Sie ohne Dichte im Seilmaterial (ohne Gewicht war das Gesetz richtig); sobald die Korrektur veröffentlicht ist, berechnen Sie neu.",
        "Status: behoben in 0.3.0. Die Seilberechnung löst jetzt das Sehnengesetz selbst mit einer Newton-Iteration."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-015-cable-tension-chord-law.md",
      "label": "SA-2026-015 vollständig",
      "t": "Der Sicherheitshinweis mit dem Testmast und seiner geschlossenen Lösung:"
    },
    {
      "k": "h",
      "t": "SA-2026-018: MITC9-Schalen auf gekrümmter Geometrie"
    },
    {
      "k": "p",
      "t": "Das MITC9-Element ist eben: Es projiziert seine neun Knoten auf eine Ebene. Lagen die Seitenmitten- oder Mittelknoten außerhalb dieser Ebene (jedes gekrümmte MITC9-Netz), fehlte der Projektion die Korrektur über starre Kopplungen des MITC4, sodass eine Starrkörperdrehung das Element verzerrte: Ein gekrümmtes Netz widerstand den Drehungen seiner Elemente und gab dafür Spannungen aus (101 MPa an einem Testfeld, das um 1 mrad gedreht wurde). Dieses Element wird nur über den Rechenkern oder seine WASM-API verwendet: Die App erzeugt keine Elemente mit neun Knoten, daher sind auf stabileo.com erhaltene Ergebnisse nicht betroffen."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-018-mitc9-curved-rigid-motion.md",
      "label": "SA-2026-018 vollständig",
      "t": "Der Sicherheitshinweis mit dem Testfeld und der Halbkugel:"
    },
    {
      "k": "h",
      "t": "SA-2026-020: Fließfläche der materiell nichtlinearen Berechnung in 3D"
    },
    {
      "k": "p",
      "t": "In 2D fließt ein Stab, wenn (N/Np)² + |M|/Mp den Wert 1 überschreitet. In 3D verwendete der Gleichungslöser (N/Np)² + (My/Mpy)² + (Mz/Mpz)², mit quadrierten Momentenverhältnissen, sodass ein 3D-Stab unter Normalkraft oder zweiachsiger Biegung später fließt als derselbe Stab in 2D und die ausgegebene Ausnutzung zu niedrig war: Bei N = 0.5·Np fiel die Last bei Fließbeginn 15 % zu hoch aus. In 3D gilt jetzt (N/Np)² + |My|/Mpy + |Mz|/Mpz, was bei einachsiger Biegung der 2D-Fläche entspricht. Dieser Gleichungslöser ist nur über den Rechenkern oder seine WASM-API erreichbar: Kein Bildschirm der App ruft ihn auf, daher sind auf stabileo.com erhaltene Ergebnisse nicht betroffen."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-020-material-nonlinear-3d-yield-surface.md",
      "label": "SA-2026-020 vollständig",
      "t": "Der Sicherheitshinweis mit den Testfällen:"
    },
    {
      "k": "h",
      "t": "SA-2026-008: Gesamterdbebenkraft und modale Beteiligung in der Antwortspektrenberechnung"
    },
    {
      "k": "p",
      "t": "Bei der CQC-Regel wurde die ausgegebene Gesamterdbebenkraft weiterhin mit SRSS überlagert. Die modalen Gesamterdbebenkräfte in einer Richtung haben dasselbe Vorzeichen, daher liefert CQC mehr als SRSS: Bei zwei nahe beieinanderliegenden Eigenformen war der ausgegebene Wert 19 % zu niedrig. Außerdem fehlte in den Beteiligungsfaktoren die Masse, die die konsistente Massenmatrix an die Auflager koppelt, was die Antwort in Modellen mit wenigen Elementen je Stütze unterschätzte."
    },
    {
      "k": "ul",
      "items": [
        "Wie Sie erkennen, ob Sie betroffen sind: Sie haben eine Antwortspektrenberechnung mit CQC durchgeführt und die ausgegebene Gesamterdbebenkraft verwendet (zum Beispiel, um sie auf die statische Gesamterdbebenkraft zu skalieren), oder Sie haben eine konsistente Masse mit Stützen aus einem oder zwei Elementen verwendet.",
        "Was zu tun ist: Berechnen Sie die betroffenen Modelle auf stabileo.com neu und vergleichen Sie mit den Ergebnissen, die Sie bereits verwendet haben. Die Umgehung, die dieser Hinweis vor der Korrektur angab, gilt nicht mehr.",
        "Status: auf stabileo.com am 21. Oktober 2026 behoben."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-008-spectral-combination.md",
      "label": "SA-2026-008 vollständig",
      "t": "Der Sicherheitshinweis mit den beiden Fehlern getrennt dargestellt:"
    },
    {
      "k": "h",
      "t": "SA-2026-007: Drill- und Biegedrillknicken in 3D"
    },
    {
      "k": "p",
      "t": "Die geometrische Steifigkeit von 3D-Stäben enthielt nur die Biegeterme: keinen Wagner-Term und keine Kopplung über den Schubmittelpunkt. Drill- und Biegedrillknicken traten nie auf, stattdessen wurde die Euler-Last ausgegeben. Bei einer Stütze mit Kreuzquerschnitt lag die ausgegebene Last 96 % über der maßgebenden."
    },
    {
      "k": "ul",
      "items": [
        "Wie Sie erkennen, ob Sie betroffen sind: Sie haben den 3D-Knickfaktor oder 3D-P-Delta für Tragwerke mit offenen dünnwandigen Querschnitten geringer Torsionssteifigkeit verwendet: Kreuzquerschnitte, Einzel- oder Doppelwinkel, T-Profile, U-Profile. Doppeltsymmetrische I-Profile, bei denen Biegeknicken maßgebend ist, sind nicht betroffen. Bemessungsnachweise, die das Drillknicken selbst berechnen (CIRSOC 301 E.4, seit 0.2.0), sind ebenfalls nicht betroffen.",
        "Was zu tun ist: Berechnen Sie die betroffenen Modelle auf stabileo.com neu und vergleichen Sie mit den Ergebnissen, die Sie bereits verwendet haben. Die Umgehung, die dieser Hinweis vor der Korrektur angab, gilt nicht mehr.",
        "Status: auf stabileo.com am 21. Oktober 2026 behoben."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-007-torsional-buckling.md",
      "label": "SA-2026-007 vollständig",
      "t": "Der Sicherheitshinweis mit der durchgerechneten Stütze mit Kreuzquerschnitt:"
    },
    {
      "k": "h",
      "t": "SA-2026-006: Ebenes Modell in 3D mit Knotenmomenten berechnet"
    },
    {
      "k": "p",
      "t": "Ein vom 3D-Gleichungslöser berechnetes ebenes Modell liegt in der X–Z-Ebene, in der die Verdrehung in der Ebene eine Drehung um −Y ist. Knotenmomente und eingeprägte Verdrehungen hätten das Vorzeichen wechseln müssen, taten es aber nicht, sodass sie als ihr Spiegelbild wirkten. Zusammen mit Kräften können sie sich addieren, statt sich aufzuheben."
    },
    {
      "k": "ul",
      "items": [
        "Wie Sie erkennen, ob Sie betroffen sind: Das Modell ist eben (alle Knoten in einer Ebene), wurde im 3D-Modus berechnet und hat Knotenmomente oder eingeprägte Auflagerverdrehungen. Drehfedern sind nicht betroffen.",
        "Was zu tun ist: Berechnen Sie die betroffenen Modelle auf stabileo.com neu und vergleichen Sie mit den Ergebnissen, die Sie bereits verwendet haben. Die Umgehung, die dieser Hinweis vor der Korrektur angab, gilt nicht mehr.",
        "Status: auf stabileo.com am 21. Oktober 2026 behoben."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-006-mirrored-moments-2d-in-3d.md",
      "label": "SA-2026-006 vollständig",
      "t": "Der Sicherheitshinweis mit den drei Testfällen:"
    },
    {
      "k": "h",
      "t": "SA-2026-005: Normalkraft in geneigten 2D-Stäben"
    },
    {
      "k": "p",
      "t": "Der 2D-Lastaufbau verschob die Komponente einer Last in Stablängsrichtung auf einem geneigten Stab zu dessen Endknoten. Auflagerreaktionen und Verschiebungen waren richtig, aber der Stab sah diese Last nicht in seinem Feld, sodass seine Normalkraft konstant auf dem Mittelwert ihrer tatsächlichen Endwerte blieb: am Fußpunkt eines Sparrens 26 % zu niedrig. Das Diagramm, der Inspektor, der Bericht, der Excel-Export und die Bemessung verwendeten alle diesen Wert. Außerdem ging ein auf einen Stab aufgebrachtes Kräftepaar verloren, wenn ein ebenes Modell in 3D berechnet wurde."
    },
    {
      "k": "ul",
      "items": [
        "Wie Sie erkennen, ob Sie betroffen sind: ein seit dem 25.09.2026 berechnetes 2D-Modell mit geneigten Stäben (Sparren, Treppen, Verbände, als Segmente gezeichnete Bögen), die Strecken-, Einzel- oder Eigengewichtslasten mit einer Komponente in Stablängsrichtung tragen; oder ein ebenes Modell mit einem Kräftepaar auf einem Stab, das in 3D berechnet wurde. Am stärksten gefährdet sind auf Druck bemessene Stäbe.",
        "Was zu tun ist: Berechnen Sie die betroffenen Modelle auf stabileo.com neu und vergleichen Sie mit den Ergebnissen, die Sie bereits verwendet haben. Die Umgehung, die dieser Hinweis vor der Korrektur angab, gilt nicht mehr.",
        "Status: auf stabileo.com am 21. Oktober 2026 behoben."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-005-inclined-member-loads.md",
      "label": "SA-2026-005 vollständig",
      "t": "Der Sicherheitshinweis mit dem Sparren und dem 3-4-5-Stab:"
    },
    {
      "k": "h",
      "t": "Behoben am 19. Oktober 2026"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-009: Das Volumenschalenelement SHB8 war bei Biegung dünner Platten 22 % zu steif (Querdehnungs-Locking in Dickenrichtung) und unterschätzte daher Durchbiegungen um etwa 18 %. Prüfen Sie Schlussfolgerungen zu Durchbiegung und Schwingungen bei Modellen mit Volumenschalen-Platten, die vor diesem Datum berechnet wurden, erneut; MITC4, MITC9, DKT und die gekrümmte Schale waren nicht betroffen.",
        "SA-2026-010: Das Zertifikat der Antwortspektrenberechnung konnte nicht endliche Ergebnisse (NaN) durchlassen. Die Zahlen waren sichtbar ungültig; falsch war die Aussage der Verifikation. Nichts muss erneut geprüft werden, es sei denn, ein abgegebenes Ergebnis zeigte nicht endliche Werte."
      ]
    },
    {
      "k": "h",
      "t": "Behoben in Version 0.2.0"
    },
    {
      "k": "p",
      "t": "Version 0.2.0 vom 18. Oktober 2026 hat die vier rückwirkenden Sicherheitshinweise behoben. Sie betreffen alle Projekte, die vor dem 17. Oktober 2026 berechnet wurden, und die Empfehlung ist für jeden dieselbe: Lasten und Kombinationen neu erzeugen, berechnen und die Bemessungsnachweise durchsehen sowie jedes mit einer früheren Version erstellte Dokument erneut prüfen."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001: erzeugte Kombinationen und Lasten nach CIRSOC 101, 102 und 103 auf der unsicheren Seite (in einem Beispiel war die Normalkraft einer Stütze 29 % zu niedrig).",
        "SA-2026-002: Betonnachweise nach CIRSOC 201 und ACI 318 überschätzten die Tragfähigkeit (φMn bis zu 18 % zu hoch).",
        "SA-2026-003: Nachweise für Stahl, kaltgeformte Profile und Anschlüsse überschätzten die Tragfähigkeit (Querkrafttragfähigkeit des Stegs bis zu 60 % zu hoch).",
        "SA-2026-004: Berechnungen, die einen Teil des Modells ignorierten (Zeitverlaufsberechnung mit Bodenbewegung verlor bis zur Hälfte der Erdbebenlast; plastischer Kollaps in 3D bis zum 2,3-Fachen auf der unsicheren Seite)."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Alle Sicherheitshinweise",
      "t": "Die vollständige Liste mit jedem Sicherheitshinweis, seiner Korrektur und seinem Schweregrad:"
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Wie wir diese Fehler gefunden haben und was keine Verifikation garantieren kann:"
    }
  ]
};

export default body;
