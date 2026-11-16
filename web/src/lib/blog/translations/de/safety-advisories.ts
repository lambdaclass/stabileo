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
      "t": "Stand 12. November 2026: SA-2026-001 bis 020 sind in Version 0.3.0 behoben, SA-2026-021 bis 024 in Version 0.4.0 und SA-2026-025 bis 047 in Version 0.5.0 (SA-2026-040 eingedämmt: Die Prüfung ist als unvollständig gekennzeichnet), außer SA-2026-044: Der plastische Kollaps in 2D bleibt abgelehnt, bis #758 geschlossen ist. SA-2026-048 wurde nach Version 0.5.0 behoben und ist seit dem 8. November 2026 auf stabileo.com online. SA-2026-049, SA-2026-050, SA-2026-051, SA-2026-052 und SA-2026-053 wurden nach Version 0.5.0 behoben und sind seit dem 9. November 2026 auf stabileo.com online. Die Veröffentlichung gehört zu unserer Art, die Ergebnisse zu verifizieren, und ist kein Zeichen dafür, dass die Hinweise noch offen sind. Ein Sicherheitshinweis gilt als behoben, wenn die Korrektur auf stabileo.com online ist, nicht schon, wenn die Änderung existiert. Solange ein Hinweis offen ist, verwenden Sie die angegebene Umgehung und prüfen Sie das betroffene Ergebnis von Hand, bevor Sie unterschreiben. SA-2026-054 — Entwurf: Korrektur noch nicht zusammengeführt oder veröffentlicht. SA-2026-055 — Entwurf: Korrektur noch nicht zusammengeführt oder veröffentlicht. SA-2026-056 — Entwurf: ungelöst; keine Korrektur integriert oder veröffentlicht. SA-2026-057 — Entwurf: Korrektur noch nicht zusammengeführt oder veröffentlicht. SA-2026-059 — In PR #1921 behoben, Veröffentlichung ausstehend. SA-2026-060 — Entwurf: lokale Korrektur wartet auf Prüfung und Veröffentlichung. SA-2026-062 — Entwurf: lokale Korrektur wartet auf Prüfung und Veröffentlichung."
    },
    {
      "k": "note",
      "t": "SA-2026-058 — In PR #1922 behoben, Veröffentlichung ausstehend."
    },
    {
      "k": "note",
      "t": "SA-2026-061 — Behoben in PR #1952, Veröffentlichung ausstehend."
    },
    {
      "k": "note",
      "t": "SA-2026-063 — In PR #2009 behoben, Veröffentlichung ausstehend."
    },
    {"k": "note", "t": "SA-2026-064 — Behoben in 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-064-steel-cb-combination.md", "label": "SA-2026-064", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-065 — Behoben in 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-065-snow-roof-step.md", "label": "SA-2026-065", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-066 — Behoben in 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-066-cirsoc201-transverse-cm.md", "label": "SA-2026-066", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-067 — Behoben in 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-067-snow-roof-rotation.md", "label": "SA-2026-067", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-068 — Behoben in 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-068-provided-torsion-stirrups.md", "label": "SA-2026-068", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-069 — Entwurf 2026-11-15; in PR #2169 behoben, Zusammenführung und Veröffentlichung ausstehend."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-069-torsion-secondary-shear.md", "label": "SA-2026-069", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-070 — Behoben in PR #2170, Veröffentlichung ausstehend."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-070-interior-member-couples.md", "label": "SA-2026-070", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-072 — In PR #2175 behoben, Veröffentlichung ausstehend."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-072-snow-ridge-subdivision.md", "label": "SA-2026-072", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-076 — In PR #2220 behoben, Zusammenführung und Veröffentlichung ausstehend."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-076-wind-enclosure.md", "label": "SA-2026-076", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-077 — In PR #2220 behoben, Zusammenführung und Veröffentlichung ausstehend."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-077-wind-wall-height-transfer.md", "label": "SA-2026-077", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "note", "t": "SA-2026-078 — In PR #2220 behoben, Zusammenführung und Veröffentlichung ausstehend."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-078-wind-roof-pressure-zones.md", "label": "SA-2026-078", "t": "Betroffene Eingaben und erforderliche Maßnahmen."},
    {"k": "img", "base": "blog/recheck-stale", "w": 1600, "h": 1000, "alt": "Stabileo PRO mit einem Stahlbetonrahmen, gespeichert, bevor Ergebnisse versioniert wurden. Ein Hinweis unten meldet veraltete Ergebnisse: Das Projekt wurde mit einer älteren Version gelöst, und 19 registrierte Änderungen betreffen es; daneben die Schaltflächen, um die Änderungen zu sehen und neu zu rechnen.", "caption": "Wie eine Korrektur ein gespeichertes Projekt erreicht: Bis es neu gelöst ist, bleiben seine Ergebnisse als veraltet markiert, und die Änderungen, die es betreffen, sind einen Klick entfernt."},
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
          "SA-2026-001",
          "Erzeugte Kombinationen und Lasten (CIRSOC 101, 102, 103) auf der unsicheren Seite",
          "Hoch",
          "Behoben in 0.2.0"
        ],
        [
          "SA-2026-002",
          "Betonnachweise (CIRSOC 201, ACI 318) überschätzten die Tragfähigkeit",
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
          "SA-2026-004",
          "Berechnungen, die einen Teil des Modells ignorierten (Dynamik, Knicken, plastischer Kollaps)",
          "Kritisch",
          "Behoben in 0.2.0"
        ],
        [
          "SA-2026-005",
          "Geneigte Stäbe in 2D: Normalkraft ohne die Lastkomponente in Stablängsrichtung",
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
          "SA-2026-007",
          "3D-Knicken ohne Drill- oder Biegedrillknickformen",
          "Hoch",
          "Behoben am 2026-10-21"
        ],
        [
          "SA-2026-008",
          "Antwortspektrum: Gesamterdbebenkraft unter CQC mit SRSS überlagert; Beteiligung ohne die an die Auflager gekoppelte Masse",
          "Hoch",
          "Behoben am 2026-10-21"
        ],
        [
          "SA-2026-009",
          "Volumenschale SHB8 bei Biegung dünner Platten 22 % zu steif (Durchbiegungen 18 % zu niedrig)",
          "Mittel (höher in statisch unbestimmten Tragwerken)",
          "Behoben am 2026-10-19"
        ],
        [
          "SA-2026-010",
          "Spektrales Zertifikat ließ nicht endliche Ergebnisse durch",
          "Mittel",
          "Behoben am 2026-10-19"
        ],
        [
          "SA-2026-011",
          "3D-Auflager, von Feder auf eingespannt oder gelenkig umgestellt, als Feder berechnet",
          "Hoch",
          "Behoben am 2026-10-20"
        ],
        [
          "SA-2026-012",
          "Materiell nichtlineare Berechnung (nur Rechenkern und WASM): elastische Stabschnittgrößen nach dem Fließen",
          "Mittel",
          "Behoben in 0.3.0"
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
          "SA-2026-016",
          "Bögen (gekrümmte Balken im Rechenkern, Bogenwerkzeug der App): Iy und Iz an nahezu senkrechten Segmenten vertauscht",
          "Mittel",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-017",
          "Boden-Bauwerk-Interaktion: Die Kennlinien p-y, t-z und q-z wichen von ihren Referenzen ab",
          "Hoch",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-018",
          "MITC9-Schalen (nur Rechenkern und WASM) auf gekrümmter Geometrie durch Starrkörperbewegung verzerrt",
          "Mittel",
          "Behoben in 0.3.0"
        ],
        [
          "SA-2026-019",
          "Temperaturlasten auf Stäben (Rechenkern und WASM; die App glich seit 2026-10-07 aus): α von Stahl und Höhe eines Vollrechtecks",
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
          "SA-2026-025",
          "AISC 360 G2 Querkraft (nur Rechenkern und WASM): ohne Stegfläche mit Ausnutzung 0 bestanden, und zertifiziert",
          "Mittel",
          "Behoben auf stabileo.com (#1234)"
        ],
        [
          "SA-2026-026",
          "EC3 6.2.6 Querkraft (nur Rechenkern und WASM): ohne Schubfläche Av = 0,5·A angesetzt, Vpl,Rd bei HEB 300 57 % zu hoch, und zertifiziert",
          "Mittel",
          "Behoben auf stabileo.com (#1234)"
        ],
        [
          "SA-2026-027",
          "Schalen-Umhüllende: übernahm die Kombination mit der größten Von-Mises-Spannung statt des Extremwerts jeder Komponente (mx in einem Beispiel 14 % zu niedrig)",
          "Hoch",
          "Korrektur in Prüfung"
        ],
        [
          "SA-2026-028",
          "Biegung nach EN 1992-1-1 (andere Normen in PRO, zertifiziert): nahm an, dass der Zugstahl fließt, und iterierte die obere Bewehrung nicht; MRd bis zu 22 % zu hoch",
          "Hoch",
          "Behoben nach 0.4.0"
        ],
        [
          "SA-2026-029",
          "3D: CIRSOC-201-Stützen in der App wurden mit Mz über die Querschnittshöhe bemessen (36 % zu wenig Bewehrung in einem Beispiel); die zertifizierten 3D-Nachweise des Rechenkerns lasen die Querkraft Vy als Stegquerkraft",
          "Kritisch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-030",
          "CIRSOC 301 Druck: ein Querschnitt mit einer Fläche kleiner als seine Bleche ergab ein negatives Qa und eine Tragfähigkeit über der vollplastischen Normalkraft und galt als nachgewiesen",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-031",
          "Zeitverlaufsberechnung: eine bei t = 0 auf einen masselosen Freiheitsgrad aufgebrachte Last ging im ersten Schritt verloren (Reziprozität bis zum 33-Fachen verletzt, eine Kette mit zwei Freiheitsgraden um 24 % von ihrer geschlossenen Lösung abweichend)",
          "Mittel",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-032",
          "Modalanalyse: die Eigenform mit Frequenz null eines Mechanismus wurde verworfen und die übrigen Eigenformen als vollständig ausgegeben",
          "Mittel",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-033",
          "Lastgenerator: eine Decke mit einem einzigen niedrigen Stab über einem Teil davon verlor ihre gesamte Flächenlast (36 m² einer 6 × 6 m großen Decke in einem Beispiel); Fachwerke zählten nicht als Dachtragwerk",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-034",
          "Die Gleichgewichtsprüfung meldete Lasten und Auflagerkräfte als übereinstimmend für Lastfälle, deren Prüfung Lasten ausließ; Bearbeitungen ähnlicher Geschosse erreichten Stäbe des anderen Typs, und Kopien verloren ihre Gelenke",
          "Mittel",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-035",
          "Wechsel von 3D zu 2D: Der Schnitt bog Stäbe um die falsche Querschnittsachse (ein Rahmen in der Y–Z-Ebene 13,5-mal zu steif)",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-036",
          "Wechsel von 3D zu 2D auf Y–Z oder X–Y: Zwangsbedingungen wurden gelesen, als stünde der Rahmen in X–Z (Verschiebungskopplungen verloren oder außerhalb der Ebene angesetzt)",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-037",
          "Korotationale 3D-Analyse: Rotationsvektoren wurden subtrahiert (der Bathe–Bolourchi-Bogen 1,3 % daneben, ohne Besserung bei Netzverfeinerung)",
          "Mittel",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-038",
          "3D-Knicken: Der Faktor von Stäben, deren Druck unter Lasten entlang ihrer Achse zunimmt, kam zu hoch heraus (+43 % bei einem Stab), und ein nur zwischen seinen Enden gedrückter Stab wurde abgelehnt",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-039",
          "Excel- und IFC-Import: Iy und Iz von Rechtecken und Rohren vertauscht (ein Kragträger 20 × 40 viermal zu weich, einer 40 × 20 viermal zu steif)",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-040",
          "ACI-318- und EN-1992-Nachweise: Stahlbetonstäbe bestanden, ohne dass ihre Torsion nachgewiesen wurde",
          "Hoch",
          "In der nächsten Version eingedämmt"
        ],
        [
          "SA-2026-041",
          "Stahlbetonstützen: das größte Moment wurde nur mit der größten Druckkraft nachgewiesen",
          "Hoch",
          "In der nächsten Version behoben"
        ],
        [
          "SA-2026-042",
          "2D-Knicken: Der Faktor von Stäben, deren Druck unter Lasten entlang ihrer Achse zunimmt, kam zu hoch heraus (+43 % bis +68 % bei einem Stab)",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-043",
          "Harmonische Analyse: Die Korrektur der weggelassenen Moden verlor ihre Stellen, wenn eine Mode viel weicher war als die übrigen (79-fach bei 2,3 Hz in einem Beispiel)",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-044",
          "2D-Plastischer Kollaps: Der Kollapsfaktor änderte sich mit Knotennummerierung, Stabrichtung und Einheiten (bis zum 4,6-Fachen bei derselben Struktur)",
          "Hoch",
          "Traglastberechnung in der nächsten Version behoben; der ebene plastische Kollaps bleibt zurückgehalten, bis #758 geschlossen ist"
        ],
        [
          "SA-2026-045",
          "3D-Plastischer Kollaps: Ein Stab ohne verwendbares plastisches Moment wurde behandelt, als würde er nie plastifizieren (6-fach zu hoch in einem Beispiel, und zertifiziert)",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-046",
          "Harmonische Analyse: Wählte je Last zwischen Modalsuperposition und direkter Lösung, sodass Superposition und Reziprozität versagten (107 % an einem Knoten in einem Beispiel); stabileo.com und Engine-/WASM-Builds von main, vom 5. November 2026 bis zur Korrektur",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-047",
          "Schalen: Ein Lastfall mit eingeprägter Auflagerverschiebung verlor seine Schalenspannungen, und Kombinationen und Umhüllende summierten nur die der anderen Lastfälle (möglicherweise unsicher, ohne Warnung); 0.2.0 bis 0.4.0",
          "Hoch",
          "Behoben in der nächsten Version"
        ],
        [
          "SA-2026-048",
          "CIRSOC-301-Stahl: Cb übersah einen Vorzeichenwechsel an den Enden einer angegebenen nicht ausgesteiften Länge, die kürzer als der Stab ist (ein U-Profil mit doppelter Krümmung erhielt Cb = 2,55 statt 1, die Biegedrillknick-Tragfähigkeit wurde überschätzt); 0.2.0 bis 0.5.0, die Desktop-Alphas und stabileo.com bis zum 8. November 2026",
          "Hoch",
          "Behoben nach 0.5.0; auf stabileo.com seit dem 8. November 2026"
        ],
        [
          "SA-2026-049",
          "Auflager mit positiver Feder und starrer Bindung am selben Freiheitsgrad: In 3D hob die Feder die Bindung auf und änderte die Randbedingung; Engine-Code in 0.2.0 bis 0.5.0",
          "Hoch",
          "Behoben nach 0.5.0; auf stabileo.com seit dem 9. November 2026"
        ],
        [
          "SA-2026-050",
          "Knicken konnte eine fehlgeschlagene Schlankheitsberechnung in null umwandeln, und Lastfallkombinationen konnten nicht endliche Werte in einem erfolgreichen Ergebnis liefern",
          "Mittel",
          "Behoben nach 0.5.0; auf stabileo.com seit dem 9. November 2026"
        ],
        [
          "SA-2026-051",
          "3D-Wanderlasten: Hüllkurven übersahen innere Schnittgrößenextrema und verloren die axiale Komponente des Achsgewichts bei geneigten Stäben, wodurch die Beanspruchung ohne Warnung unterschätzt werden konnte; 0.2.0 bis 0.5.0 und desktop-v0.1.0-alpha.1 bis alpha.3",
          "Hoch",
          "Behoben nach 0.5.0; auf stabileo.com seit dem 9. November 2026"
        ],
        [
          "SA-2026-052",
          "2D- und 3D-Wanderlasten im Rechenkern: Normalkrafthüllkurven mit ständigen axialen Teilstreckenlasten übersahen Extrema an Lastabschnittsgrenzen zwischen Auswertestellen, wodurch die Beanspruchung ohne Warnung unterschätzt werden konnte; keine Grenze veröffentlichter Versionen wird behauptet",
          "Hoch",
          "Behoben nach 0.5.0; auf stabileo.com seit dem 9. November 2026"
        ],
        [
          "SA-2026-053",
          "2D- und 3D-Wanderlasten: Punktlasten an Stabenden nahmen Kräfte außerhalb des Stabs in die Hüllkurven auf, erzeugten dadurch falsche Normal- und Querkraftextrema und überschätzten die Beanspruchung; keine Grenze veröffentlichter Versionen wird behauptet",
          "Niedrig",
          "Behoben nach 0.5.0; auf stabileo.com seit dem 9. November 2026"
        ],
        [
          "SA-2026-054",
          "Die lineare Analyse konnte bei nicht auflösbarer Steifigkeit oder von PCG übersehenen Lastkomponenten ohne Warnung ungenaue Ergebnisse liefern",
          "Hoch",
          "Entwurf: Korrektur noch nicht zusammengeführt oder veröffentlicht"
        ],
        ["SA-2026-055", "P-Delta in 2D und 3D konnte Vergrößerungen unterschätzen und Stabilität melden, wenn die Normalkraft unter Strecken- oder Einzellasten entlang eines Rahmenstabs variierte", "Hoch", "Entwurf: Korrektur noch nicht zusammengeführt oder veröffentlicht"],
        [
          "SA-2026-056",
          "3D-Modelle mit Rahmen, Schalen und Zwangsbedingungen: harmonische und erzwungene Zeitverlaufsanalysen liefern bei gleichwertigen Beschreibungen unterschiedliche Ergebnisse; der Umfang über das gespeicherte Modell hinaus ist nicht geklärt",
          "Hoch",
          "Entwurf: ungelöst; keine Korrektur integriert oder veröffentlicht"
        ],
        [
          "SA-2026-057",
          "Die Anzeige plastischer Zertifikate konnte Faktoren außerhalb des zertifizierten Intervalls als innerhalb einstufen; die exakte Mechanismenermittlung verwarf Ressourcenablehnungen in Builds von PR #1888 vor der Korrektur",
          "Mittel",
          "Entwurf: Korrektur noch nicht zusammengeführt oder veröffentlicht"
        ],
        [
          "SA-2026-058",
          "Große harmonische 2D/3D-Modelle mit mehr als 3000 unabhängigen freien Freiheitsgraden konnten außerhalb von q ≤ 1/16 ungenaue Antworten ausgelassener Moden bei Frequenzen außerhalb der Abschneidewarnung behalten (gemessener komplexer Fehler der Zielantwort: 8,079 %)",
          "Hoch",
          "In PR #1922 behoben, Veröffentlichung ausstehend"
        ],
        [
          "SA-2026-059",
          "Erweiterte Webanalysen konnten Seilen ohne Warnung Drucktragfähigkeit zuweisen (P-Delta-Reproduktion: −4,599884347090908 kN); Beanspruchungen aus erweiterten Analysen, direkter Analyse und Lehrassistenten für Seilmodelle prüfen",
          "Hoch",
          "In PR #1921 behoben, Veröffentlichung ausstehend"
        ],
        [
          "SA-2026-061",
          "Bogenlängen- und Verschiebungssteuerung ließen Reaktionen weg und verwendeten unskalierte Stablasten; auch fehlende Ergebnisse bei 2D/3D-Zwangsbedingungen, Guyan, Bauphasen und Zeitverläufen prüfen. Betroffene Ergebnisse neu berechnen oder unabhängig prüfen; 0.2.0–0.5.0 und spätere betroffene main-Builds.",
          "Hoch",
          "Behoben in PR #1952, Veröffentlichung ausstehend"
        ],
        ["SA-2026-060", "Die Bauphasenanalyse konnte reale Drehungen nach Einheitenwechseln oder an freigegebenen Enden mit Auflagerfedern ohne Warnung versteifen; Bauphasenmodelle mit Freigaben erneut prüfen", "Hoch", "Entwurf: lokale Korrektur wartet auf Prüfung und Veröffentlichung"],
        ["SA-2026-062", "Die rohe plastische 3D-Analyse konnte beim Scheitern des elastischen Anfangszustands ohne Warnung null melden; ältere zertifizierte Versionen behielten diesen Faktor. Main liefert bereits eine positive zertifizierte Schranke mit Warnung; PR #1943 gibt die anfängliche Ablehnung weiter", "Hoch", "Entwurf: lokale Korrektur wartet auf Prüfung und Veröffentlichung"],
        ["SA-2026-063", "Bauphasen- und nichtlineare Analysen mit Zwangsbedingungen verloren vorgegebene Masterbewegungen; Seil- und Zeitverlaufsanalysen lehnen nicht unterstützte Auflagerbewegungen nun ab. Bestehende allgemeine Dynamikwarnungen benannten diese Auslassung nicht", "Hoch", "In PR #2009 behoben, Veröffentlichung ausstehend"],
        ["SA-2026-064", "Cb für Stahl konnte aus einer anderen Kombination oder einem kurzen Abschnitt ohne bekannte Halterungspositionen stammen (#1316, #2088). CIRSOC-301-Nachweise erneut ausführen und Biegetragfähigkeit, Interaktionsausnutzung und maßgebende Kombinationen prüfen.", "Hoch", "Behoben in 0.6.1"],
        ["SA-2026-065", "Schneeverwehungen an Dachstufen konnten auf geneigten aufnehmenden Dachflächen fehlen (#2082). CIRSOC-104-Schneelasten neu erzeugen und betroffene Analysen und Nachweise wiederholen.", "Hoch", "Behoben in 0.6.1"],
        ["SA-2026-066", "Cm für Beton konnte trotz Querlast zwischen den Auflagern durch Endmomente reduziert werden (#2089). Schlanke Stützen und Wände, vergrößerte Momente und Bewehrung erneut prüfen.", "Hoch", "Behoben in 0.6.1"],
        ["SA-2026-067", "Eine Grundrissdrehung konnte erzeugte Schneelasten ändern (#2093). Lasten mit der tatsächlichen Dachgeometrie neu erzeugen und Analysen und Nachweise wiederholen; Zurückdrehen repariert alte Ergebnisse nicht.", "Hoch", "Behoben in 0.6.1"],
        ["SA-2026-068", "Der Torsionsnachweis konnte mit unzureichenden bemessenen Bügeln bestehen (#2141). Betonnachweise erneut ausführen und tatsächliche Querbewehrungstragfähigkeit, Bügelabstände und Torsionsversagen prüfen. Ungeprüfte Längsbewehrung bedeutet keinen bestandenen Bewehrungskorb.", "Hoch", "Behoben in 0.6.1"],
        ["SA-2026-069", "Die Torsionsquerschnittsgrenze ließ die gleichzeitige sekundäre Querkraft aus (#2142). Betonbemessungen erneut ausführen und Querschnittsversagen sowie fehlende Bügel prüfen; zusätzliche Bügel beheben eine überschrittene Querschnittsgrenze nicht.", "Hoch", "Entwurf 2026-11-15; in PR #2169 behoben, Zusammenführung und Veröffentlichung ausstehend"],
        ["SA-2026-070", "Innere Stabdurchbiegung und Rotation ließen Stablasten aus (#2143). Verformte Linien, Lernanzeigen und Gebrauchstauglichkeitsprüfungen für Stahl und Beton prüfen, einschließlich voller und partieller Trapezlasten. Belastete Stäbe ohne ausreichendes EI werden nun ausdrücklich abgelehnt.", "Hoch", "Behoben in PR #2170, Veröffentlichung ausstehend"],
        ["SA-2026-072", "Eine ungleiche Unterteilung der Dachränder konnte den First verschieben und erzeugte Schneelasten ändern (#2144). Schneelasten neu erzeugen und Analysen, Kombinationen und Nachweise wiederholen. Erneutes Lösen gespeicherter Lasten allein korrigiert sie nicht.", "Hoch", "In PR #2175 behoben, Veröffentlichung ausstehend"],
