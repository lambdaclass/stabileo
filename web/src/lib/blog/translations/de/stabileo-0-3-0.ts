import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.3.0: sechzehn weitere Korrekturen und alle Sicherheitshinweise veröffentlicht",
  "excerpt": "Was sich seit 0.2.0 geändert hat: sechzehn Fehler, die ein falsches Ergebnis liefern konnten, behoben und als Sicherheitshinweise veröffentlicht; Zertifikate, die das Ergebnis gegen das Modell prüfen; und bei jeder Berechnung dieselben Zahlen.",
  "blocks": [
    {
      "k": "p",
      "t": "Version 0.3.0 ist am 21. Oktober 2026 erschienen. Seit 0.2.0 haben wir den Rechenkern weiter auf mehreren unabhängigen Wegen geprüft und sechzehn weitere Fehler gefunden, die ein falsches Ergebnis liefern konnten. Sie sind behoben, und zu jedem gibt es einen veröffentlichten Sicherheitshinweis, der sagt, was falsch war, wer betroffen ist und was erneut zu prüfen ist."
    },
    {
      "k": "note",
      "t": "stabileo.com veröffentlicht jede Änderung, sobald sie gemergt ist; diese Korrekturen sind daher seit dem 19., 20. oder 21. Oktober online. Die App weist einmal darauf hin, dass sich Ergebnisse geändert haben können, und Projekte, die vor einer sie betreffenden Änderung gespeichert wurden, fordern beim Öffnen eine erneute Prüfung an."
    },
    {
      "k": "h",
      "t": "Berechnen Sie Ihre Projekte neu"
    },
    {
      "k": "p",
      "t": "Das sind die Fälle, die ein Bemessungsergebnis am stärksten verschieben können. Jeder Sicherheitshinweis enthält das vollständig durchgerechnete Beispiel und sagt, was mit bereits abgegebenen Ergebnissen zu tun ist."
    },
    {
      "k": "table",
      "caption": "Einige der Korrekturen in 0.3.0: der richtige Wert und der Wert, den die vorherige Version lieferte.",
      "head": [
        "Hinweis",
        "Fall",
        "Richtig",
        "Vorher"
      ],
      "rows": [
        [
          "SA-2026-005",
          "Sparren eines Satteldachs: Normalkraft am Fußpunkt (kN)",
          "-56,67",
          "-41,67"
        ],
        [
          "SA-2026-007",
          "Stütze mit Kreuzquerschnitt, 1,5 m: kritische Last (kN)",
          "2993",
          "5860"
        ],
        [
          "SA-2026-014",
          "Umnummeriertes räumliches Rahmentragwerk: plastischer Traglastfaktor",
          "176,47",
          "424,3"
        ],
        [
          "SA-2026-015",
          "Abgespannter Mast: Zugkraft im Abspannseil (kN)",
          "5,18",
          "4,34"
        ],
        [
          "SA-2026-013",
          "Kragarm aus gekrümmten Schalen: Moment an der Einspannstelle (kN·m/m)",
          "35,0",
          "0"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Die übrigen Sicherheitshinweise betreffen das Antwortspektrum mit CQC, ebene Modelle, die in 3D mit Knotenmomenten berechnet werden, Auflager, die von Feder auf starr umgestellt wurden, Bögen außerhalb der X–Z-Ebene, die Bodenkennlinien p-y, t-z und q-z, die Volumenschale in dünnen Platten und, für alle, die den Rechenkern oder seine API direkt nutzen, die materiell nichtlineare Berechnung, gekrümmte MITC9-Elemente und Temperaturlasten auf Stäben."
    },
    {
      "k": "h",
      "t": "Gewarnt statt stillschweigend falsch"
    },
    {
      "k": "ul",
      "items": [
        "Ein Ergebnis, das ein noch offener Fehler beeinflussen könnte, trägt eine Warnung, die ihn benennt, in Ihrer Sprache. Einer bleibt: Die materiell nichtlineare Berechnung ist ein Sekantenmodell über den ganzen Stab.",
        "Wenn eine Temperaturlast weder den Wärmeausdehnungskoeffizienten noch die Querschnittshöhe angibt, nennt das Ergebnis den angenommenen Wert.",
        "Was keine Lösung hat, wird abgewiesen: ein Moment auf einem Knoten, den nichts verdrehen kann, eine Schalenlast auf einem Element eines anderen Typs, eine Bodenkennlinie ohne die Eingaben, die ihre Referenz verlangt."
      ]
    },
    {
      "k": "h",
      "t": "Gründlicher geprüft"
    },
    {
      "k": "ul",
      "items": [
        "Durchgängige Zertifikate für Rahmen und Fachwerke: Ein unabhängiger Prüfer baut Steifigkeit und Lasten aus dem Modell neu auf und zertifiziert die Verschiebungen gegen das Modell, nicht nur gegen die Matrizen, die der Rechenkern aufgestellt hat. Er hat bereits drei Fälle gefunden, in denen Rechenkern und Modell nicht übereinstimmten.",
        "Dasselbe Modell liefert immer dieselben Zahlen, Bit für Bit, und jede Statische Berechnung, jede Arbeitsmappe und jede CSV-Datei hält fest, welche Version und welche Daten sie erzeugt haben.",
        "Die Stahlbetonbemessung nach CIRSOC 201 stammt aus einer einzigen Implementierung im Rechenkern.",
        "Schätzungen des Diskretisierungsfehlers für Platten und Schalen, als Schätzungen ausgewiesen, nie als zertifiziert."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Die vollständige Liste der Sicherheitshinweise, jeweils mit dem, was erneut zu prüfen ist:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.3.0.md",
      "label": "Versionshinweise 0.3.0",
      "t": "Die vollständigen Hinweise, mit den bekannten Einschränkungen:"
    }
  ]
};

export default body;
