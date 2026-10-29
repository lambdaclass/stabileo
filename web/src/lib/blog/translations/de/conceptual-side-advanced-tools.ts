import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Was kostenlose Software rechnet und was sie nicht erklärt",
  "excerpt": "Es gibt kostenlose Statiksoftware, und sie ist gut: Sie modelliert, sie rechnet, sie zeigt Ergebnisse. Was wir nicht gefunden haben, ist eine, die sich den fortgeschrittenen Werkzeugen von der konzeptionellen Seite nähert.",
  "blocks": [
    {
      "k": "p",
      "t": "Es lohnt sich, mit dem zu beginnen, was es gibt: Es gibt viel davon, und es ist gut. Wer heute Statik oder Baustatik lehrt, hat erstklassige kostenlose Werkzeuge zur Verfügung, und mehrere davon erfüllen ihre Aufgabe besser als wir unsere."
    },
    {
      "k": "h",
      "t": "Was die kostenlosen Werkzeuge tatsächlich abdecken"
    },
    {
      "k": "table",
      "caption": "Kostenlose Werkzeuge zur Tragwerksberechnung und was sie über das Ergebnis hinaus zeigen.",
      "head": [
        "Werkzeug",
        "Kostenlos",
        "Was es sehr gut kann",
        "Konzeptionelle Seite"
      ],
      "rows": [
        [
          "Ftool",
          "Ja",
          "Ebene Rahmen modellieren und Zustandslinien und Einflusslinien ablesen, mit einer Leichtigkeit, die kaum ein anderes erreicht",
          "Zeigt das Verhalten, nicht die Überlegung dahinter"
        ],
        [
          "MASTAN2",
          "Ja (unter MATLAB oder dessen Laufzeitumgebung)",
          "Lineare und nichtlineare Matrizenberechnung, eng verbunden mit McGuire, Gallagher und Ziemian",
          "Die Theorie steht im Buch; das Programm führt die Berechnung aus"
        ],
        [
          "SkyCiv",
          "Kostenlose Stufe",
          "Handrechnungen Schritt für Schritt: Freikörperbilder, Gleichgewichtsbedingungen vor dem Einsetzen, Momentenausgleich für statisch unbestimmte Balken",
          "Zahlen in Formeln eingesetzt, für die grundlegende Statik"
        ],
        [
          "sectionproperties",
          "Ja, Open Source",
          "Verwölbung, Schubmittelpunkt und Saint-Venant-Torsionskonstante mit finiten Elementen",
          "Eine Python-Bibliothek: Sie liefert Zahlen, ohne Oberfläche und ohne Erklärung"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Von dieser Liste kommt SkyCiv dem am nächsten, was man üblicherweise „den Rechenweg zeigen“ nennt, und das sollte man klar sagen: Seine Handrechnungen sind gut. Es zeichnet das Freikörperbild, schreibt ΣM = 0, bevor irgendeine Zahl eingesetzt wird, und löst mit Momentenausgleich, wenn der Balken statisch unbestimmt ist. Wer behauptet, kein kostenloses Programm zeige seine Schritte, lässt sich mit SkyCiv in etwa einer Minute widerlegen."
    },
    {
      "k": "h",
      "t": "Die Schritte zu zeigen reicht nicht, wenn das Programm nicht sagt, wann die Formel nicht mehr gilt"
    },
    {
      "k": "p",
      "t": "Zahlen in eine richtige Formel einzusetzen und zu erklären, warum diese Formel die richtige ist, sind zwei verschiedene Dinge. Das Erste erspart Ihnen das Rechnen. Das Zweite bewahrt Sie vor dem Fehler, den die Rechnung nicht erkennen kann, weil er eine Ebene darüber liegt."
    },
    {
      "k": "p",
      "t": "Die Torsionsrechner, die man im Netz findet, zeigen das von der anderen Seite: Sie wählen den Querschnittstyp (Vollquerschnitt, geschlossenes Rohr, Rechteck), und das Programm wendet die passende Formel an. Keiner der Rechner, die wir gesehen haben, sagt Ihnen, dass Sie falsch gewählt haben, was die andere Theorie ergeben hätte oder auf welcher Seite des Fehlers Sie liegen."
    },
    {
      "k": "quote",
      "t": "Ein Programm, das nur rechnet, wird Sie nie warnen, dass Sie das Falsche rechnen."
    },
    {
      "k": "h",
      "t": "Drei Funktionen, für die wir keine Entsprechung gefunden haben"
    },
    {
      "k": "ul",
      "items": [
        "Kinematische Analyse, erklärt. Wir haben gesucht und kein kostenloses Werkzeug gefunden, das das kann: Was man findet, sind Vorlesungsunterlagen als PDF. Die „Lernsoftware für kinematische Analyse“, die wir gefunden haben, ist für Getriebe im Maschinenbau (Koppelgetriebe und Kurbeltriebe), nicht für die Einordnung von Tragwerken.",
        "Bewehrungsführung. Die einzige kostenlose Option, die wir gefunden haben, ist AutoRebar, und das ist eine Erweiterung für AutoCAD, sodass man für den kostenlosen Teil eine teure Lizenz braucht. Außerdem arbeitet es auf Ihrer Zeichnung: Sie setzen die Stäbe, es erstellt die Liste. Alles andere ist eine siebentägige Testversion oder kommerzielle Software. Eine Open-Source-Option haben wir nicht gefunden.",
        "Querschnittsanalyse, durchgerechnet. Hier gibt es eine ernsthafte kostenlose Option, sectionproperties, und bei der Verwölbung mit finiten Elementen ist sie uns wahrscheinlich überlegen. Aber es ist eine Bibliothek ohne Oberfläche: Sie liefert den Schubmittelpunkt, ohne zu erklären, warum er dort liegt, wo er liegt."
      ]
    },
    {
      "k": "p",
      "t": "Unter den Werkzeugen, die wir untersucht haben, deckt keines zwei der drei ab, und wir haben keines gefunden, das sich auch nur einer davon von der konzeptionellen Seite nähert. Das ist die Lücke, die wir sehen, und sie ist enger und genauer als „wir sind die Einzigen, die lehren“."
    },
    {
      "k": "h",
      "t": "Ein Bildschirm, auf dem sich der ganze Unterschied zeigt"
    },
    {
      "k": "p",
      "t": "Unten sehen Sie einen Zweifeldträger auf drei Auflagern. Alle drei halten nur die vertikale Bewegung. Es ist der Lehrbuchfall und zugleich der, den ich in Prüfungen am häufigsten als richtig akzeptiert gesehen habe."
    },
    {
      "k": "p",
      "t": "Die Formel für den Grad der statischen Unbestimmtheit ergibt g = 3·m + r − 3·n = 3×2 + 3 − 3×3 = 0. Null bedeutet statisch bestimmt, und jedes Programm, das bei der Formel stehen bleibt, wird genau das melden. Aber nichts hält den Balken in horizontaler Richtung: Er ist ein Mechanismus und kann nicht berechnet werden."
    },
    {
      "k": "table",
      "caption": "Was die kinematische Analyse für diesen Balken liefert, Schritt für Schritt.",
      "head": [
        "Schritt",
        "Was er untersucht",
        "Ergebnis"
      ],
      "rows": [
        [
          "2 · Statische Unbestimmtheit",
          "g = 3·m + r − 3·n",
          "0"
        ],
        [
          "3 · Steifigkeitsmatrix",
          "Erkannte Mechanismusformen",
          "1"
        ],
        [
          "3 · Steifigkeitsmatrix",
          "Ungehaltene Freiheitsgrade",
          "1"
        ],
        [
          "4 · Vorschläge",
          "Ergebnis auf dem Bildschirm",
          "Nicht berechenbar"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Die Anwendung meldet nicht einfach die Null und wäscht ihre Hände in Unschuld. Sie widerspricht ihr im selben Schritt 2, der sie geliefert hat: „Die Formel ergibt g = 0 (notwendige Bedingung für ein statisch bestimmtes Tragwerk), aber NICHT hinreichend“. Schritt 3 stellt die globale Steifigkeitsmatrix auf, hier 6×6, und meldet „1 Mechanismus-Mode erkannt“ trotz g = 0 ≥ 0. Er nennt Knoten 3 und seine horizontale Verschiebung, weist darauf hin, dass die Gleichung aus Schritt 2 die Bindungen zählt, ohne zu prüfen, wo sie liegen, und schließt mit „✗ Mechanismus — kann nicht berechnet werden“."
    },
    {
      "k": "embed",
      "query": "example=hidden-mechanism&kin=1",
      "label": "Der Balken auf drei vertikalen Auflagern, mit geöffnetem Bereich der kinematischen Analyse. Gehen Sie die vier Schritte durch: Der zweite ergibt g = 0, und der dritte findet den Mechanismus, den diese Null verbirgt. Ersetzen Sie ein Auflager durch ein festes Gelenklager und rechnen Sie erneut: Der Grad wird 1, und der Mechanismus verschwindet."
    },
    {
      "k": "h",
      "t": "Warum das für einen Lehrstuhl interessant sein kann"
    },
    {
      "k": "p",
      "t": "Wer die Abzählformel lernt und nie sieht, wie die hinreichende Bedingung versagt, geht mit einer unvollständigen Regel nach Hause und weiß es nicht. An der Tafel ist das schwer zu zeigen, weil das Beispiel, das sie widerlegt, wie ein Tippfehler aussieht. Hier steht es auf einem Bildschirm, mit der Zahl und dem Widerspruch nebeneinander."
    },
    {
      "k": "p",
      "t": "Es muss nichts installiert oder lizenziert werden, und der Lehrstuhl muss nichts kaufen. Es öffnet sich im Browser, und das Modell wird als Link geteilt."
    },
    {
      "k": "note",
      "t": "Um es klar zu sagen: Nichts davon bedeutet, dass wir besser sind. Ftool modelliert schneller und reibungsloser als wir. Hinter MASTAN2 steht ein Lehrbuch, das wir nicht geschrieben haben. Die Handrechnungen von SkyCiv sind besser aufbereitet als mehrere unserer Bereiche. Und sectionproperties löst die Verwölbung mit finiten Elementen, wo wir annähern. Was wir behaupten, ist enger und recht genau umrissen: Unter den kostenlosen Werkzeugen, die wir untersucht haben, nähert sich keines den fortgeschrittenen Werkzeugen von der konzeptionellen Seite. Wenn Sie ein kostenloses Werkzeug kennen, das die kinematische Analyse erklärt, eine Biegeliste erstellt oder die Querschnittsanalyse durchrechnet, schreiben Sie uns, und wir korrigieren diesen Beitrag."
    }
  ]
};

export default body;
