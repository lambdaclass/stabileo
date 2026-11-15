import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.1: korrigierte Bauteilnachweise und Schneelasten",
  "excerpt": "Führen Sie betroffene Beton- und Stahlnachweise erneut aus. Bei erzeugten Schneelasten zuerst die Lasten neu erzeugen, dann betroffene Lastfälle, Kombinationen, Umhüllende und abgeleitete Bemessungsnachweise neu berechnen.",
  "blocks": [
    {
      "k": "p",
      "t": "Führen Sie betroffene Beton- und Stahlnachweise erneut aus. Bei erzeugten Schneelasten zuerst die Lasten neu erzeugen, dann betroffene Lastfälle, Kombinationen, Umhüllende und abgeleitete Bemessungsnachweise neu berechnen. Eine erneute Lösung mit alten gespeicherten Lasten korrigiert diese nicht. Vergleichen Sie Beanspruchungen, Tragfähigkeiten, Bewehrung, Ausnutzung, maßgebende Kombinationen und Zertifikate mit bereits verwendeten Ergebnissen. Prüfen Sie ausgelieferte Berechnungen und darauf beruhende Bemessungen. Eine Ablehnung, eine nicht verfügbare Größe oder ungeprüfte Bewehrung bedeutet weder einen bestandenen Nachweis noch eine Beanspruchung von null."
    },
    {
      "k": "note",
      "t": "Die folgenden fünf Hinweise mit Schweregrad Hoch sind in 0.6.1 behoben. Beachten Sie die betroffenen Eingaben und Maßnahmen jedes Hinweises, auch wenn frühere Ergebnisse bestanden oder zertifiziert wurden."
    },
    {
      "k": "h",
      "t": "Sicherheitshinweise"
    },
    {
      "k": "table",
      "caption": "Sicherheitshinweise",
      "head": [
        "Hinweis",
        "Schweregrad",
        "Änderung und erforderliche Maßnahme"
      ],
      "rows": [
        [
          "SA-2026-064",
          "Hoch",
          "Cb für Stahl konnte aus einer anderen Kombination oder einem kurzen Abschnitt ohne bekannte Halterungspositionen stammen (#1316, #2088). CIRSOC-301-Nachweise erneut ausführen und Biegetragfähigkeit, Interaktionsausnutzung und maßgebende Kombinationen prüfen."
        ],
        [
          "SA-2026-065",
          "Hoch",
          "Schneeverwehungen an Dachstufen konnten auf geneigten aufnehmenden Dachflächen fehlen (#2082). CIRSOC-104-Schneelasten neu erzeugen und betroffene Analysen und Nachweise wiederholen."
        ],
        [
          "SA-2026-066",
          "Hoch",
          "Cm für Beton konnte trotz Querlast zwischen den Auflagern durch Endmomente reduziert werden (#2089). Schlanke Stützen und Wände, vergrößerte Momente und Bewehrung erneut prüfen."
        ],
        [
          "SA-2026-067",
          "Hoch",
          "Eine Grundrissdrehung konnte erzeugte Schneelasten ändern (#2093). Lasten mit der tatsächlichen Dachgeometrie neu erzeugen und Analysen und Nachweise wiederholen; Zurückdrehen repariert alte Ergebnisse nicht."
        ],
        [
          "SA-2026-068",
          "Hoch",
          "Der Torsionsnachweis konnte mit unzureichenden bemessenen Bügeln bestehen (#2141). Betonnachweise erneut ausführen und tatsächliche Querbewehrungstragfähigkeit, Bügelabstände und Torsionsversagen prüfen. Ungeprüfte Längsbewehrung bedeutet keinen bestandenen Bewehrungskorb."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Verzeichnis der Sicherheitshinweise",
      "t": "Sicherheitshinweise:"
    },
    {
      "k": "h",
      "t": "Alle Hinweise auf Ergebnisänderungen seit v0.6.0"
    },
    {
      "k": "p",
      "t": "Das Register von v0.6.0 endet bei Ergebnisversion 78; diese Version erreicht 80. Die Tabelle enthält alle 24 neuen Hinweise. Mehrere teilen sich eine Version. Alle zutreffenden Nachweise wiederholen; bei Schnee die Lasten vor der Neuberechnung neu erzeugen."
    },
    {
      "k": "table",
      "caption": "Alle Hinweise auf Ergebnisänderungen seit v0.6.0",
      "head": [
        "Ergebnisversion",
        "Geändertes Ergebnis"
      ],
      "rows": [
        [
          "79",
          "Schneeverwehungen folgen durchgehenden Dachkanten"
        ],
        [
          "79",
          "Schneelasten bewahren ungleichmäßige Seiten und Dachabschnitte"
        ],
        [
          "79",
          "Schneeachsen flacher Dächer folgen verbundenen Stabzügen"
        ],
        [
          "79",
          "Schneelasten berücksichtigen lokale Positionen und Grenzen"
        ],
        [
          "79",
          "Schneelastfaktoren folgen jeder Dachrichtung"
        ],
        [
          "79",
          "Schneelastfälle erfassen jede Firstrichtung"
        ],
        [
          "79",
          "Schnee verwendet durchgehende Dächer und ausgewählte Geometrie"
        ],
        [
          "79",
          "Schneelasten behalten bei Grundrissdrehung ihre Größe"
        ],
        [
          "79",
          "Schneeverwehungen an Dachstufen verwenden die aufnehmende Dachebene"
        ],
        [
          "79",
          "Schneelasten folgen jeder verbundenen Dachfläche"
        ],
        [
          "79",
          "Schneelasteinzugsflächen folgen dem Dachinneren"
        ],
        [
          "80",
          "Bauteilnachweise benötigen jede aktive Kombination"
        ],
        [
          "80",
          "Bauteilnachweise benötigen vollständige Stationsdaten"
        ],
        [
          "80",
          "Gleichzeitige Nachweise behalten maßgebende Schnittgrößen"
        ],
        [
          "80",
          "Bemessung verwendet gewählte Bewehrung und bekannte Querlasten"
        ],
        [
          "80",
          "Interaktionsnachweise verwenden gleichzeitige Schnittgrößen"
        ],
        [
          "80",
          "Betonnachweise behalten die Nebenschlankheit"
        ],
        [
          "80",
          "Gleichzeitige Lastfälle behalten die gesamte erforderliche Torsionsbewehrung"
        ],
        [
          "80",
          "Feste Bewehrung behält die Prüfung der praktischen Obergrenze bei"
        ],
        [
          "80",
          "Bemessung berücksichtigt Stabverhalten und Flanschlängen"
        ],
        [
          "80",
          "Torsion prüft jede ausgegebene Bügelbewehrung"
        ],
        [
          "80",
          "Gemeinsame Balken behalten ihre Achsen; Torsionsbewehrung muss angegeben werden"
        ],
        [
          "80",
          "Cb im Stahl-Interaktionsnachweis verwendet das Diagramm der eigenen Kombination"
        ],
        [
          "80",
          "Stahlstationen verwenden physische Längen und behalten Querkräfte"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.de.md",
      "label": "Vollständige Versionshinweise zu 0.6.1",
      "t": "Alle Hinweise auf Ergebnisänderungen seit v0.6.0:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Ein Dialog zur erneuten Ergebnisprüfung in Stabileo Basic mit Änderungen, die ein früher gespeichertes Projekt betreffen.",
      "caption": "Ihre Ergebnisse können sich ändern: betroffene Projekte neu berechnen"
    },
    {
      "k": "h",
      "t": "Weitere Änderungen"
    },
    {
      "k": "p",
      "t": "Beton- und Stahlnachweise behalten Kräfte derselben Kombination und Station bei. Unvollständige Kombinations- oder Stationsdaten werden abgelehnt, statt Ergebnisse an den Enden einzusetzen. Erforderliche und vorhandene Bewehrungszustände bleiben getrennt; fehlende Angaben zur vorhandenen Torsionslängsbewehrung werden ausdrücklich gemeldet."
    },
    {
      "k": "h",
      "t": "Bekannte Einschränkungen"
    },
    {
      "k": "ul",
      "items": [
        "Bekannte falsche Ergebnisse bleiben offen: #2096, #2142, #2143 und #2144. Diese Version behebt sie nicht. Den jeweiligen Geltungsbereich prüfen und betroffene Ergebnisse vor Verwendung unabhängig verifizieren.",
        "SA-2026-056 bleibt ungelöst: dynamische Beanspruchungen gekoppelter Stab-Schalen-Modelle mit Zwangsbedingungen unabhängig prüfen, wenn sie sich nach Umnummerierung, Drehung oder Einheitenwechsel wesentlich ändern. Ein konservativer Korrekturfaktor ist nicht belegt.",
        "Der plastische Kollaps in 2D bleibt bis zur Lösung von #758 abgelehnt, siehe SA-2026-044. Eine zertifizierte untere 3D-Schranke zertifiziert nicht den rohen Gelenkverlauf.",
        "Die Zeitverlaufsanalyse liefert keine gesamten dynamischen Auflagerbeanspruchungen. Eine unabhängige Analyse mit Trägheit, Dämpfung und Auflagerlasten verwenden. Nicht unterstützte Seilanalysen und von null verschiedene eingeprägte Auflagerbewegungen bei Seil- und Zeitverlaufsverfahren werden ausdrücklich abgelehnt.",
        "Räumliche Bogenlängen- und Verschiebungssteuerungsverfahren werden nicht ergänzt. Bestehende Warnungen und Einschränkungen gelten weiter."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Änderungsprotokoll",
      "t": "Änderungsprotokoll:"
    }
  ]
};

export default body;
