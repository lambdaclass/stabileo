import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "CIRSOC-Nachweise kostenlos im Browser: was es gibt und was nicht",
  "description": "Stabileo weist Beton (CIRSOC 201) und Stahl (CIRSOC 301, experimentell) nach, erzeugt Lasten nach CIRSOC 101–104, kostenlos im Browser. Was es gibt, was nicht.",
  "eyebrow": "CIRSOC",
  "lead": "Stabileo ist eine Open-Source-Software für die Tragwerksberechnung, die Stahlbetonbauteile nach CIRSOC 201 (Ausgabe 2025) und Stahlbauteile nach CIRSOC 301-2018 nachweist und Lasten und Kombinationen nach CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (Teil I) und CIRSOC 104-2005 erzeugt, den argentinischen Tragwerksnormen. Stabileo verwendet dasselbe Modell und denselben Rechenkern, mit denen Sie berechnen, läuft im Browser und braucht weder Installation noch Lizenz. Die normgemäße Bemessung gehört zum PRO-Modul, das noch in Entwicklung ist und so lange kostenlos bleibt.",
  "blocks": [
    {
      "k": "h",
      "t": "Was verfügbar ist und wie weit es verifiziert ist"
    },
    {
      "k": "p",
      "t": "Zertifiziert heißt, dass jedes Ergebnis eine in Intervallarithmetik berechnete Schranke für seinen numerischen Fehler trägt; es heißt nicht, dass das Modell richtig ist oder dass ein Ingenieur es geprüft hat. Die veröffentlichten Beispiele sind die Rechenbeispiele von INTI-CIRSOC."
    },
    {
      "k": "table",
      "caption": "Was Stabileo heute nach CIRSOC nachweist, mit dem Verifikationsstand jedes Teils.",
      "head": [
        "Norm",
        "Was es leistet",
        "Status"
      ],
      "rows": [
        [
          "CIRSOC 201 — Stahlbeton",
          "Balken und Stützen: Biegung, Biegung mit Normalkraft, Querkraft und Mindestbewehrung; Querschnitte, Interaktionsdiagramme und Decken aus dem Rechenkern",
          "Verfügbar in PRO. Biegung und Querkraft von Balken zertifiziert; Biegung mit Normalkraft und Decken getestet, nicht zertifiziert. 3 von 5 Abschnitten anhand der Beispiele von INTI-CIRSOC 201-2005 geprüft"
        ],
        [
          "CIRSOC 201-2025 — Bewehrungsführung",
          "Verankerung, Begrenzung der Rissbreite, Stababstände und Anordnung der Bewehrung",
          "Verfügbar in PRO. Getestet"
        ],
        [
          "CIRSOC 301-2018 — Stahl",
          "Zug, Druck (Biegeknicken und Biegedrillknicken), Biegung und Querkraft",
          "Verfügbar, bis zu einer unabhängigen Prüfung als experimentell gekennzeichnet. Zertifiziert; 10 von 14 Abschnitten anhand der Beispiele von INTI-CIRSOC 301-2018 geprüft"
        ],
        [
          "CIRSOC 301-2018 J — Anschlüsse",
          "Kehlnähte und Schraubenverbindungen",
          "In Entwicklung; 2 von 4 Abschnitten anhand veröffentlichter Beispiele geprüft"
        ],
        [
          "CIRSOC 201 — Einzelfundamente",
          "Bodenpressung, Querkraft, Durchstanzen und Biegung",
          "In Entwicklung; mit einer zweiten Implementierung verglichen"
        ],
        [
          "CIRSOC 101-2025 — Lasten und Kombinationen",
          "Die sieben Kombinationen nach §2.3.2, ständige Lasten und Nutzlasten",
          "Was implementiert ist, ist Abschnitt für Abschnitt gegen den amtlichen Text verifiziert; Eis, außergewöhnliche Einwirkungen und einige Bestimmungen nicht abgedeckt"
        ],
        [
          "CIRSOC 102-2025 — Wind",
          "Winddrücke und Kombinationen für den Gebrauchszustand",
          "Was implementiert ist, ist gegen den amtlichen Text verifiziert; einige Fälle nicht abgedeckt"
        ],
        [
          "INPRES-CIRSOC 103-2018 Teil I — Erdbeben",
          "Spektrum, Verfahren nach Zone, seismisch wirksames Gewicht und Erdbebenkombination",
          "Was implementiert ist, ist verifiziert; einige Bestimmungen nicht abgedeckt"
        ],
        [
          "CIRSOC 104-2005 — Schnee",
          "Schneelasten nach Ort",
          "Gegen die Tabellen verifiziert"
        ]
      ]
    },
    {
      "k": "h",
      "t": "So funktioniert es"
    },
    {
      "k": "ul",
      "items": [
        "Ein Modell: Sie zeichnen oder importieren das Tragwerk (DXF, IFC oder eine Excel-Vorlage), und die Nachweise verwenden dieselben Schnittgrößen wie die Berechnung, ohne dass etwas von Hand in eine andere Tabelle übertragen wird.",
        "Lasten und Kombinationen nach CIRSOC 101, 102, 103 und 104 werden aus den Projektdaten erzeugt.",
        "Für jeden Stab ergeben sich das Verhältnis von Beanspruchung zu Tragfähigkeit und der maßgebende Abschnitt, und jeder Schritt lässt sich einsehen.",
        "Der Rechenkern läuft auf Ihrem Computer: Das Modell wird zum Berechnen an keinen Server gesendet. Der Code ist offen (AGPL-3.0).",
        "Dasselbe Modell liefert immer dieselben Zahlen, und jeder Bericht hält die Version und die Daten fest, aus denen er entstanden ist."
      ]
    },
    {
      "k": "link",
      "slug": "verificacion-flexion-cirsoc-201",
      "t": "Ein durchgerechnetes Beispiel Schritt für Schritt, mit dem Modell zum Öffnen im Editor:"
    },
    {
      "k": "h",
      "t": "Wie wir es validieren und wo die Validierung endet"
    },
    {
      "k": "ul",
      "items": [
        "Die Bemessungsnachweise werden Abschnitt für Abschnitt mit den Rechenbeispielen von INTI-CIRSOC verglichen, die Lasten mit den amtlichen Texten; jeder Unterschied wird mit seiner Ursache dokumentiert.",
        "Die Berechnung wird mit sieben anderen Finite-Elemente-Programmen verglichen.",
        "Eine unabhängige Prüfung durch einen zugelassenen Tragwerksplaner hat es noch nicht gegeben, und Stahl ist weiterhin als experimentell gekennzeichnet.",
        "Kein Programm prüft das Modell: Lasten, Auflager und Idealisierung sind Entscheidungen des Ingenieurs."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Wenn wir einen Fehler finden, der bereits verwendete Ergebnisse beeinflusst haben könnte, veröffentlichen wir ihn mit dem, was erneut zu prüfen ist:"
    }
  ],
  "faqTitle": "Häufige Fragen",
  "faq": [
    {
      "q": "Welche Software weist die Tragwerksbemessung nach den CIRSOC-Normen nach?",
      "a": "Stabileo weist Stahlbeton nach CIRSOC 201 und Stahl nach CIRSOC 301-2018 (als experimentell gekennzeichnet) nach und erzeugt Lasten und Kombinationen nach CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 und CIRSOC 104-2005. Es ist Open Source, läuft im Browser und ist kostenlos, solange das Bemessungsmodul in Entwicklung ist."
    },
    {
      "q": "Ist Stabileo für CIRSOC-Nachweise kostenlos?",
      "a": "Ja, derzeit schon. Die Berechnung (Basis) ist kostenlos. Das Modul für die normgemäße Bemessung ist in Entwicklung und so lange kostenlos; danach bleibt es kostenlos für öffentliche Universitäten und für alle, die sich an seiner Entwicklung beteiligen."
    },
    {
      "q": "Kann ich Stabileo für eine Berechnung verwenden, die ich unterschreibe?",
      "a": "Die Verantwortung für eine Bemessung trägt der unterzeichnende Ingenieur, mit jedem Programm. Stabileo veröffentlicht, was verifiziert ist und in welchem Umfang; eine unabhängige Prüfung durch einen zugelassenen Ingenieur gab es noch nicht, und Stahl ist als experimentell gekennzeichnet. Prüfen Sie daher die maßgebenden Bauteile von Hand."
    },
    {
      "q": "Welche Ausgabe der CIRSOC 201 wird verwendet?",
      "a": "Die Ausgabe 2025. Für ältere Projekte lässt sich in den Normen des Projekts die Ausgabe 2005 wählen, die Bemessung von Balken und Stützen nach dieser Ausgabe ist aber noch nicht verfügbar. Die Nachweise des Rechenkerns werden mit den Rechenbeispielen von INTI-CIRSOC 201-2005 verglichen."
    }
  ]
};

export default body;
