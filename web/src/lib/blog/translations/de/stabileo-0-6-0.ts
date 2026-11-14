import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.0: Berechnen Sie betroffene Projekte neu",
  "excerpt": "Berechnen Sie betroffene Analysen neu und prüfen Sie bereits verwendete Ergebnisse. SA-2026-048 bis SA-2026-063 erklären, was zu prüfen ist; SA-2026-056 bleibt ungelöst.",
  "blocks": [
    {
      "k": "p",
      "t": "Berechnen Sie betroffene Lastfälle, Kombinationen sowie vollständige nichtlineare oder Bauphasenverläufe erneut. Vergleichen Sie Verschiebungen, Stabkräfte, Auflagerreaktionen und Bemessungsbeanspruchungen mit den bereits verwendeten Ergebnissen. Prüfen Sie abgegebene Berechnungen und darauf beruhende Dimensionierungen. Jeder Sicherheitshinweis nennt betroffene Eingaben und Maßnahmen. Eine Ablehnung oder nicht verfügbare Größe liefert keinen Ersatzwert: Sie bedeutet weder eine Beanspruchung von null noch einen bestandenen Nachweis."
    },
    {
      "k": "note",
      "t": "Die Hinweise SA-2026-048 bis SA-2026-063 kamen nach v0.5.0 hinzu. Die folgenden Korrekturen sind in 0.6.0 enthalten, außer SA-2026-056, das weiterhin ungelöst ist. Prüfen Sie die genannten Funktionen auch dann, wenn die frühere Berechnung konvergierte oder ihre Verschiebungen plausibel erschienen."
    },
    {
      "k": "h",
      "t": "Sicherheitshinweise"
    },
    {
      "k": "table",
      "caption": "Sicherheitshinweise SA-2026-048 bis SA-2026-063",
      "head": [
        "Hinweis",
        "Schweregrad",
        "Änderung und erforderliche Maßnahme"
      ],
      "rows": [
        [
          "SA-2026-048",
          "Hoch",
          "CIRSOC 301 ließ Endmomente in Mmax bei allen Querschnitten mit verkürztem ungestütztem Abschnitt aus; U- und T-Profile bei doppelter Krümmung konnten außerdem einen Vorzeichenwechsel übersehen. Prüfen Sie alle CIRSOC-301-Stäbe mit einem angegebenen Lb unterhalb der Stablänge erneut, einschließlich Stahlprüfungen und Optimierervorschlägen."
        ],
        [
          "SA-2026-049",
          "Hoch",
          "Eine starre Halterung mit Feder konnte in 3D zum elastischen Auflager werden. Legen Sie die beabsichtigte Randbedingung ausdrücklich fest und berechnen Sie erneut."
        ],
        [
          "SA-2026-050",
          "Mittel",
          "Eine fehlgeschlagene Schlankheitsberechnung konnte null liefern; Mehrlastfall-Ergebnisse konnten nicht endliche Zahlen enthalten. Verwerfen Sie diese Werte, prüfen Sie Eingaben und berechnen Sie erneut."
        ],
        [
          "SA-2026-051",
          "Hoch",
          "3D-Wanderlasten übersahen innere Spitzen und axiale Anteile der Achslasten. Berechnen Sie Einhüllende erneut und prüfen Sie Dimensionierung und Beanspruchungen."
        ],
        [
          "SA-2026-052",
          "Hoch",
          "Axiale Wanderlast-Einhüllende in 2D/3D übersahen Grenzen verteilter Lasten. Berechnen Sie erneut und prüfen Sie innere Axialextrema; ein kleinerer Zugschritt allein genügt nicht."
        ],
        [
          "SA-2026-053",
          "Niedrig",
          "Wanderlast-Einhüllende enthielten äußere Kraftgrenzwerte bei Lasten an Stabenden. Berechnen Sie Axial- und Querkrafteinhüllende erneut und prüfen Sie die Dimensionierung einschließlich Auflagerreaktionen im Gleichgewicht."
        ],
        [
          "SA-2026-054",
          "Hoch",
          "Lineare Berechnungen konnten unaufgelöste Steifigkeitsantworten liefern oder eine Lastkomponente übersehen. Berechnen Sie statische Fälle und Kombinationen erneut; prüfen Sie Beanspruchungen unabhängig, wenn der korrigierte Solver ablehnt."
        ],
        [
          "SA-2026-055",
          "Hoch",
          "P-Delta unterschätzte die Verstärkung bei axialen Stablasten entlang der Spannweite. Berechnen Sie betroffene Analysen und Nachweise erneut, prüfen Sie Netzkonvergenz und bewerten Sie die Stabilität neu."
        ],
        [
          "SA-2026-056",
          "Hoch",
          "Ungelöst: Dynamische Ergebnisse gemischter Rahmen-Schalen-Modelle mit Zwangsbedingungen ändern sich bei gleichwertigen Modellbeschreibungen. Prüfen Sie betroffene Beanspruchungen vor Verwendung unabhängig; ein konservativer Korrekturfaktor ist nicht bekannt."
        ],
        [
          "SA-2026-057",
          "Mittel",
          "Die plastische Anzeige konnte einen außerhalb liegenden Faktor als innerhalb des Intervalls einstufen. Berechnen Sie Zertifikate erneut und vergleichen Sie exakte Endpunkte. Ressourcenablehnung beweist nicht das Fehlen eines Mechanismus."
        ],
        [
          "SA-2026-058",
          "Hoch",
          "Große harmonische Modelle behielten ungenaue Antworten ausgelassener Moden. Berechnen Sie Frequenzläufe erneut und prüfen Sie Amplitude, Phase und Spitzen, auch außerhalb der Abdeckungsgrenze der Abschneidewarnung."
        ],
        [
          "SA-2026-059",
          "Hoch",
          "Erweiterte Webanalysen gaben Seilen Drucktragfähigkeit. Verwenden Sie den unterstützten Seilsolver oder eine unabhängige Analyse; erweiterte Seilabläufe lehnen nun ausdrücklich ab."
        ],
        [
          "SA-2026-060",
          "Hoch",
          "Künstliche Drehsteifigkeit in Bauphasen änderte Verschiebungen und Stabkräfte. Berechnen Sie vollständige Verläufe mit Freigaben oder Auflagerfedern erneut und prüfen Sie abgeleitete Bemessungsbeanspruchungen."
        ],
        [
          "SA-2026-061",
          "Hoch",
          "Pfadreaktionen fehlten oder wurden bei falscher Last ermittelt; Bauphasen- und dynamische Kräfte konnten fehlen. Berechnen Sie erneut und prüfen Sie Auflager-, Anschluss- und Fundamentbeanspruchungen. Nicht verfügbare Kräfte sind nicht null; gesamte dynamische Reaktionen bleiben unverfügbar."
        ],
        [
          "SA-2026-062",
          "Hoch",
          "Eine anfängliche elastische Ablehnung konnte als erfolgreicher roher 3D-Kollapsfaktor null erscheinen. Berechnen Sie betroffene plastische Analysen erneut; eine numerische Ablehnung belegt keinen Kollaps bei Last null."
        ],
        [
          "SA-2026-063",
          "Hoch",
          "Zwangsbedingungen verloren vorgegebene Bewegungen gehaltener Masterknoten. Berechnen Sie vollständige Verläufe erneut und prüfen Sie Verschiebungen, Stabkräfte und Reaktionen zusammen mit SA-2026-061. Nicht unterstützte Auflagerbewegung bei Seil- oder Zeitverlaufsanalysen wird nun abgelehnt."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Verzeichnis der Sicherheitshinweise",
      "t": "Lesen Sie jeden zutreffenden Hinweis zu betroffenen Eingaben und erforderlichen Maßnahmen:"
    },
    {
      "k": "h",
      "t": "Weitere Änderungen an Ergebnissen"
    },
    {
      "k": "p",
      "t": "Das Ergebnisregister endet in 0.5.0 bei Version 49 und erreicht in 0.6.0 Version 78. Die Tabelle zeigt weitere Änderungen, die neben den obigen Sicherheitshinweisen zu prüfen sind. Berechnen Sie jede von einem zutreffenden Hinweis erfasste Analyse neu und vergleichen Sie ihre Ergebnisse. Die vollständige Liste einschließlich ersetzter und zurückgezogener Prüfungen steht in den Versionshinweisen."
    },
    {
      "k": "table",
      "caption": "Ausgewählte Hinweise zu Ergebnisänderungen seit 0.5.0",
      "head": [
        "Ergebnisversion",
        "Geändertes Ergebnis"
      ],
      "rows": [
        [
          "50",
          "2D: Verdrehungen, die nur Verbindungselemente halten und frei lassen, werden abgelehnt"
        ],
        [
          "52",
          "3D: Knotenverdrehungen, die ein Verbindungselement koppelt, aber frei lässt, werden abgelehnt"
        ],
        [
          "53",
          "Knicken bildet keine geometrische Steifigkeit mehr aus Normalkräften, die nur Rundungsfehler sind. In 2D und 3D gilt: Stäbe, deren Normalkräfte nicht von Rundungsfehlern unterscheidbar sind, tragen keine geometrische Steifigkeit bei. Die Analyse wird abgelehnt, wenn deren möglicher Druck den kritischen Faktor um mehr als 1 % senken könnte."
        ],
        [
          "54",
          "Die Nettofläche eines versetzt verschraubten Anschlusses nimmt die ungünstigste Risslinie, und ein Anschluss aller Querschnittsteile braucht Schrauben im Steg"
        ],
        [
          "56",
          "Geneigte 3D-Lager zählen Bindungen in einem gemeinsamen Bezugssystem"
        ],
        [
          "58",
          "Modalbasen verwenden die Rundungsskala jedes Eintrags der Massen-Gram-Matrix"
        ],
        [
          "59",
          "Geprüfte plastische 3D-Analyse liefert die zertifizierte Untergrenze"
        ],
        [
          "61",
          "Laststeuerung für Betonfasern verfeinert das Abbruchintervall"
        ],
        [
          "63",
          "Die lineare Berechnung weist einen Mechanismus oder eine nicht auflösbare Steifigkeit zurück, statt sie mit einer Warnung zu lösen"
        ],
        [
          "65",
          "Ungültige eingefrorene Kontakte und Seilberechnungen als Stäbe werden zurückgehalten"
        ],
        [
          "66",
          "Rundungsschranken beim Knicken folgen der tatsächlichen Zwangskopplung"
        ],
        [
          "67",
          "Knicklastfaktoren verwenden die ursprünglichen Steifigkeitsmatrizen"
        ],
        [
          "68",
          "Plastisches Gleichgewicht nutzt Modell-IDs und Zertifikate begrenzen einzelne Kandidaten"
        ],
        [
          "69",
          "Nichtlineare Konvergenz folgt dem physikalischen Gleichgewicht"
        ],
        [
          "71",
          "Querlasten von Fachwerkstäben in der bedingten Gleichgewichtsprüfung berücksichtigen"
        ],
        [
          "72",
          "Bogenlängenfortsetzung gruppiert die Referenzlastarithmetik neu"
        ],
        [
          "73",
          "Die Modalanalyse erhält den physikalischen Massenraum"
        ],
        [
          "75",
          "SSI korrigiert stagnierende elastische Residuen"
        ],
        [
          "76",
          "Die Zwangsreduktion erhält die richtungsabhängige Rundungsunsicherheit"
        ],
        [
          "78",
          "Verträgliche Lasten an freigegebenen Drehungen"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.md",
      "label": "Vollständige Versionshinweise zu 0.6.0",
      "t": "Alle Hinweise zu Ergebnisänderungen mit Links zu Geltungsbereich und Nachweisen:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Ein Dialog zur erneuten Ergebnisprüfung in Stabileo Basic mit Änderungen, die ein früher gespeichertes Projekt betreffen.",
      "caption": "Der im Artikel zu 0.5.0 gezeigte Dialog zur erneuten Ergebnisprüfung."
    },
    {
      "k": "h",
      "t": "Zwei Hinweise beschreiben bereits in 0.5.0 enthaltenes Verhalten"
    },
    {
      "k": "p",
      "t": "Diese beiden Hinweise wurden später registriert. Die zugrunde liegenden Änderungen waren bereits in v0.5.0 enthalten und sind daher keine neuen numerischen Änderungen dieser Version. Sie können dennoch in einer Aufforderung zur Neuberechnung erscheinen."
    },
    {
      "k": "table",
      "caption": "Spätere Hinweise zu bereits in 0.5.0 enthaltenen Änderungen",
      "head": [
        "Ergebnisversion",
        "Geändertes Ergebnis"
      ],
      "rows": [
        [
          "72",
          "Das öffentliche Plattenbeispiel verwendet harte einfache Randlager auf Wänden"
        ],
        [
          "72",
          "SSI liefert Auflagerreaktionen und berücksichtigt Bodenfedern in Zwangskräften"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Bekannte Einschränkungen"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-056 bleibt ungelöst: Prüfen Sie dynamische Beanspruchungen gemischter Rahmen-Schalen-Modelle mit Zwangsbedingungen unabhängig, wenn sie sich durch Umnummerierung, Rotation oder Einheitenumrechnung wesentlich ändern. Ein konservativer Korrekturfaktor ist nicht bekannt.",
        "Plastischer Kollaps in 2D bleibt bis zur Lösung von #758 abgelehnt, siehe SA-2026-044. Eine zertifizierte untere Schranke in 3D zertifiziert nicht den rohen Gelenkverlauf.",
        "Zeitverlaufsanalysen liefern keine gesamten dynamischen Auflagerbeanspruchungen. Verwenden Sie eine unabhängige Analyse mit Trägheit, Dämpfung und Auflagerlasten. Nicht unterstützte Seilanalysen und vorgegebene Auflagerbewegungen ungleich null bei Seil- oder Zeitverlaufsanalysen werden ausdrücklich abgelehnt.",
        "Räumliche Bogenlängen- und Wegsteuerungssolver werden nicht hinzugefügt. Bestehende Warnungen und Einschränkungen gelten weiter."
      ]
    },
    {
      "k": "h",
      "t": "Weitere Änderungen"
    },
    {
      "k": "ul",
      "items": [
        "Erzeugte ebene Tragwerke erhalten ausdrückliche Halterungen; Hallen verwenden standardmäßig reale Aussteifungen. Erzeugen Sie die Modelle erneut und prüfen Sie Auflager und Aussteifungen; gespeicherte Modelle bleiben unverändert.",
        "Das Experiment zur Formsteuerung eines gebogenen Streifens von Fehér, Sipos und Várkonyi bietet einen interaktiven Solver, Aktuatorpfade und einen Vergleich mit der Veröffentlichung auf Englisch, Spanisch und Portugiesisch. Die Zusammenfassung zum geschnittenen Streifen ist ebenfalls auf Spanisch und Portugiesisch verfügbar.",
        "Der Blogartikel zur Version 0.5.0 ist vollständig auf Deutsch, Französisch und Türkisch übersetzt. Warnungen zu plastischen Zertifikaten und Ablehnungen wegen Ressourcenlimits sind in allen angebotenen Sprachen verfügbar."
      ]
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
