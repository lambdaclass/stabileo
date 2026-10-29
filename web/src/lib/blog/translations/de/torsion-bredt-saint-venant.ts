import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bredt oder Saint-Venant: welche Torsionstheorie gilt und was die falsche Wahl kostet",
  "excerpt": "Drei Formeln, ein Querschnitt, drei verschiedene Zahlen. Welche gilt, hängt von der Wand ab; wo zwei zugleich gelten, liegt Bredt 2 bis 15 % zu tief.",
  "blocks": [
    {
      "k": "p",
      "t": "Drei verschiedene Formeln liefern die Schubspannung aus Torsion. Für denselben Querschnitt können sie sich um Größenordnungen unterscheiden, und welche gilt, hängt von der Art der Wand ab, die der Querschnitt hat."
    },
    {
      "k": "p",
      "t": "So viel steht in jedem Lehrbuch. Was selten erklärt wird, ist, was passiert, wenn zwei der drei für denselben Querschnitt gelten: Sie liefern unterschiedliche Antworten, und der Unterschied geht immer in dieselbe Richtung."
    },
    {
      "k": "h",
      "t": "Die drei Formeln"
    },
    {
      "k": "ul",
      "items": [
        "Cauchy, τ = T·r / Iₚ. Nur für Kreisquerschnitte, und dort ist sie exakt: Es ist der einzige Fall, in dem ebene Querschnitte eben bleiben. Die Spannung wächst linear mit dem Radius, von einem Minimum am inneren Rand bis zu einem Maximum am äußeren Rand.",
        "Bredt, τ = T / (2·Aₘ·t). Für geschlossene dünnwandige Querschnitte. Das Torsionsmoment wird von einem Schubfluss getragen, der um die eingeschlossene Fläche umläuft. Aₘ ist die von der Mittellinie der Wand eingeschlossene Fläche, nicht die von ihrem äußeren Rand; beides zu verwechseln, ist ein häufiger Fehler.",
        "Saint-Venant, τ = T·t / J mit J = (1/3)·Σb·t³. Für offene dünnwandige Querschnitte. Ohne geschlossenen Weg muss der Fluss über die Dicke auf sich selbst zurückkehren, deshalb geht die Dicke in der dritten Potenz ein."
      ]
    },
    {
      "k": "note",
      "t": "Saint-Venant wird oft als „die Theorie für offene Querschnitte“ dargestellt, ist aber die allgemeine Theorie, und die anderen beiden sind Sonderfälle davon mit geschlossenen Lösungen. Bei einem Kreisquerschnitt stimmt ihre Lösung exakt mit Cauchy überein, weil sich der Querschnitt wegen der Kreissymmetrie nicht verwölbt. Bei einer dünnen geschlossenen Wand ist ihre Lösung die von Bredt."
    },
    {
      "k": "h",
      "t": "Wenn zwei gelten, widersprechen sie sich"
    },
    {
      "k": "p",
      "t": "Nehmen wir ein Kreisrohr. Cauchy gilt und ist exakt. Bredt gilt ebenfalls: Die Wand ist geschlossen, und ein Schubfluss läuft um sie herum. Aber Bredt nimmt an, dass die Spannung über die Dicke konstant ist, während sie bei Cauchy mit dem Radius wächst. Bredt liefert also den Mittelwert und Cauchy das Maximum."
    },
    {
      "k": "table",
      "caption": "Kreisförmiges Hohlrohr: wie weit Bredt unter dem exakten Wert liegt, nach relativer Wanddicke.",
      "head": [
        "t / rₘ",
        "Beispiel (rₘ = 50 mm)",
        "τ Bredt / τ exakt",
        "Bredt zu tief um"
      ],
      "rows": [
        [
          "0,05",
          "Wand 2,5 mm",
          "0,976",
          "2,4 %"
        ],
        [
          "0,10",
          "Wand 5,0 mm",
          "0,955",
          "4,5 %"
        ],
        [
          "0,20",
          "Wand 10,0 mm",
          "0,918",
          "8,2 %"
        ],
        [
          "0,50",
          "Wand 25,0 mm",
          "0,850",
          "15,0 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bredt liegt in allen vier Fällen zu tief. Bei einem Rohr mit 5 mm Wand und 50 mm mittlerem Radius, das nach der üblichen Faustregel noch als dünnwandig gilt, ist die tatsächliche Spannung 4,5 % höher als die berechnete. Bei 10 mm Wand sind es 8,2 %."
    },
    {
      "k": "quote",
      "t": "Der Fehler hat immer dasselbe Vorzeichen: Bredt liegt zu tief."
    },
    {
      "k": "p",
      "t": "Ein Unterschied von 4,5 % fällt bei einem Bemessungsnachweis nicht auf, also kann ein Stab, der den Nachweis nicht erfüllt, so aussehen, als würde er ihn erfüllen."
    },
    {
      "k": "embed",
      "query": "example=torsion-tube&inspect=1&open=torsion",
      "label": "Dasselbe Rohr in Stabileo: ein Kragarm CHS 105×5 unter einem Torsionsmoment von 1 kN·m. Der Bereich öffnet sich auf Torsion und zeigt Cauchy 13,34 MPa und Bredt 12,73 MPa, die 95 % aus der Tabelle oben. Verschieben Sie den Punkt oder ändern Sie den Querschnitt, und alle drei Werte werden aktualisiert."
    },
    {
      "k": "h",
      "t": "Eine offene Wand ändert die Größenordnung"
    },
    {
      "k": "p",
      "t": "Zwischen sich überschneidenden Theorien beträgt der Unterschied einige Prozent. Zwischen einer geschlossenen und einer offenen Wand sind es Größenordnungen. Nehmen Sie ein Quadratrohr 100×100 mm mit 5 mm Wand und schlitzen Sie es in Längsrichtung auf: Es behält seine Fläche, sein Gewicht und fast seine gesamte Biegesteifigkeit."
    },
    {
      "k": "table",
      "caption": "Dasselbe Quadratrohr 100×100×5, geschlossen und mit Längsschlitz, unter einem Torsionsmoment von 1 kN·m.",
      "head": [
        "",
        "Geschlossen",
        "Geschlitzt",
        "Faktor"
      ],
      "rows": [
        [
          "J [mm⁴]",
          "4286875",
          "15833",
          "271"
        ],
        [
          "τ [MPa]",
          "11,08",
          "315,79",
          "29"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Die Torsionssteifigkeit sinkt um den Faktor 271, und die Spannung steigt um den Faktor 29. Ein U-Profil und ein Quadratrohr gleichen Gewichts verhalten sich bei Torsion sehr unterschiedlich."
    },
    {
      "k": "note",
      "t": "Es gibt noch einen Term, der oft vergessen wird: die Verwölbung. Wenn sich ein offener Querschnitt nicht frei verwölben kann, weil er eingespannt ist oder weil sich das Torsionsmoment entlang des Stabs ändert, tritt zur Saint-Venant-Torsion die Wölbkrafttorsion hinzu. Sie zu vernachlässigen, führt ebenfalls zu einer Unterschätzung."
    },
    {
      "k": "h",
      "t": "Was Stabileo damit macht"
    },
    {
      "k": "p",
      "t": "Stabileo zeigt alle drei, jede mit ihrer Formel, ihren Termen und ihrem Wert. Die nicht anwendbaren werden ebenfalls gezeigt, mit Begründung. Und wenn zwei für denselben Querschnitt gelten, zeigt es den Unterschied zwischen ihnen, statt stillschweigend eine auszuwählen."
    },
    {
      "k": "p",
      "t": "Schwerpunkt, Schubmittelpunkt und Querschnittskern werden genauso behandelt: Schritt für Schritt und vollständig sichtbar berechnet, am tatsächlichen Polygon des Querschnitts statt mit einer Formel für jede Form."
    },
    {
      "k": "note",
      "t": "Um es zu sehen, öffnen Sie den Editor, zeichnen oder wählen Sie einen Stab und gehen Sie zu Erweitert → Querschnittsanalyse → Torsion. Bei einem Kreisrohr sehen Sie Cauchy und Bredt nebeneinander, mit dem prozentualen Unterschied zwischen ihnen. Bei einem U-Profil sehen Sie Bredt als nicht anwendbar gekennzeichnet, mit Begründung."
    },
    {
      "k": "h",
      "t": "Kurz gesagt"
    },
    {
      "k": "ol",
      "items": [
        "Bildet die Wand einen geschlossenen Umlauf? Bredt, mit Aₘ auf der Mittellinie gemessen.",
        "Ist sie offen? Saint-Venant, und die Dicke geht in der dritten Potenz ein: Die dickste Wand ist maßgebend.",
        "Ist sie kreisförmig? Cauchy, und das ist exakt. Wenn Sie zusätzlich Bredt verwenden, rechnen Sie mit einem zu tiefen Wert.",
        "Ist die Verwölbung behindert? Dann reicht Saint-Venant allein nicht aus."
      ]
    },
    {
      "k": "p",
      "t": "In jedem Fall halten Sie neben dem Wert fest, welche Theorie Sie verwendet haben."
    },
    {
      "k": "link",
      "slug": "bars-or-finite-elements",
      "t": "Dieselbe Frage (welche Theorie gilt und was die falsche Wahl kostet) stellt sich bei der Wahl zwischen Stäben und finiten Elementen:"
    },
    {
      "k": "note",
      "t": "Die Zahlen in diesem Beitrag stammen aus geschlossenen Lösungen für die genannten Querschnitte: ein kreisförmiges Hohlrohr mit Aₘ auf der Mittellinie und ein Quadratrohr 100×100×5 mit dem geschlossenen J nach Bredt und dem offenen J nach Saint-Venant. Sie können sie in Stabileo mit denselben Querschnitten nachvollziehen."
    }
  ]
};

export default body;
