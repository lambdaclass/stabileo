import type { PostBody } from '../../types';
import { minimumSteelExampleRows, flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

const body: PostBody = {
  "title": "Biegenachweis nach CIRSOC 201, Schritt für Schritt",
  "excerpt": "Fast jeder erinnert sich an φMn ≥ Mu. Das ist die letzte Zeile des Nachweises, nicht der Nachweis. Das Ergebnis entscheidet sich vorher, und einer dieser Schritte kann φ unter 0,9 drücken.",
  "blocks": [
    {
      "k": "p",
      "t": "Die meisten haben den Biegenachweis als eine einzige Ungleichung im Kopf: φMn ≥ Mu. Das stimmt, und es ist die letzte Zeile. Was über das Ergebnis entscheidet, passiert vorher, in Schritten, die selten genau angesehen werden, weil sie nach Formalität aussehen."
    },
    {
      "k": "p",
      "t": "Das liefert das CIRSOC-201-Modul von Stabileo für einen Balken 20×40 cm aus Beton H-25, Stahl fy 420, 25 mm Betondeckung und Bügeln Ø8 mm unter einem Moment von 60 kN·m:"
    },
    {
      "k": "ol",
      "items": flexureExampleSteps("Zugbewehrung: 2 Ø20 (6,28 cm²)")
    },
    {
      "k": "p",
      "t": "Zehn Schritte. An den zehnten erinnert sich jeder. Über das Ergebnis entscheiden der dritte und der neunte."
    },
    {
      "k": "h",
      "t": "Schritt 3: Die Mindestbewehrung ist öfter maßgebend, als man denkt"
    },
    {
      "k": "p",
      "t": "Artikel 9.6.1.2 verlangt eine Mindestbiegebewehrung gleich dem größeren Wert aus 0.25·√f'c/fy·bw·d und 1.4/fy·bw·d. Meist wird sie als Untergrenze behandelt, die fast nie erreicht wird. Bei Balken im Wohnungsbau wird sie ständig erreicht."
    },
    {
      "k": "table",
      "caption": "Derselbe Balken 20×40 aus H-25 unter steigenden Momenten: was über die Bewehrung entscheidet.",
      "head": [
        "Mu [kN·m]",
        "As aus Tragfähigkeit [cm²]",
        "As,min [cm²]",
        "Maßgebend"
      ],
      "rows": minimumSteelExampleRows("Mindestbewehrung", "Tragfähigkeit", ",")
    },
    {
      "k": "p",
      "t": "Der Umschlagpunkt liegt bei Mu = 31,1 kN·m. Unterhalb dieses Moments bringt eine Bemessung auf Tragfähigkeit nichts: Der Querschnitt erhält so oder so 2,38 cm². Es lohnt sich zu wissen, auf welcher Seite des Umschlagpunkts ein Balken liegt, bevor man über seine Bewehrung diskutiert."
    },
    {
      "k": "h",
      "t": "Und die Mindestbewehrung hängt selten vom Beton ab"
    },
    {
      "k": "p",
      "t": "Von den beiden Ausdrücken des Artikels übersteigt der mit √f'c den anderen nur bei recht festem Beton."
    },
    {
      "k": "table",
      "caption": "Die beiden Ausdrücke für die Mindestbewehrung bei fy 420, in Promille.",
      "head": [
        "Beton",
        "0.25·√f'c/fy",
        "1.4/fy",
        "Maßgebend"
      ],
      "rows": [
        [
          "H-20",
          "2,6620",
          "3,3333",
          "1.4/fy"
        ],
        [
          "H-25",
          "2,9762",
          "3,3333",
          "1.4/fy"
        ],
        [
          "H-30",
          "3,2603",
          "3,3333",
          "1.4/fy"
        ],
        [
          "H-35",
          "3,5215",
          "3,3333",
          "√f'c"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Der Umschlagpunkt liegt bei f'c = 31,36 MPa. Im gesamten im Wohnungsbau üblichen Bereich (H-20, H-25, H-30) hängt die Mindestbewehrung nicht vom Beton ab: Sie ergibt sich aus 1.4/fy und aus nichts anderem. Der Wechsel von H-20 auf H-30 senkt die Mindestbewehrung um keinen einzigen Quadratzentimeter."
    },
    {
      "k": "h",
      "t": "Schritt 9: φ ist nicht automatisch 0,9"
    },
    {
      "k": "p",
      "t": "Der Abminderungsbeiwert wird für Biegung als 0,90 gelehrt und danach wie eine Konstante behandelt. Das ist er nicht. Er ergibt sich aus der Dehnung des Zugstahls im Grenzzustand der Tragfähigkeit, und das Modul sagt das in Schritt 9: εt ≥ 5‰ → zugbestimmt → φ = 0,90. Legt man mehr Stahl in den Querschnitt, sinkt εt und nimmt φ mit."
    },
    {
      "k": "table",
      "caption": "Derselbe Balken, jedes Mal stärker belastet. εt und φ stammen aus den Schritten 8 und 9.",
      "head": [
        "Mu [kN·m]",
        "Bewehrung",
        "εt [‰]",
        "φ",
        "φMn [kN·m]",
        "Duktilität"
      ],
      "rows": flexureExampleRows("Erfüllt", "Nicht erfüllt")
    },
    {
      "k": "p",
      "t": "Der Querschnitt mit 2 Ø32 erfüllt den Nachweis nicht: Die Zugdehnung liegt unter dem geforderten Mindestwert. Ein kleineres φ ersetzt den Duktilitätsnachweis nicht. Querschnitt oder Bewehrung müssen neu bemessen werden."
    },
    {
      "k": "quote",
      "t": "Der Querschnitt mit 2 Ø32 erfüllt den Nachweis nicht: Die Zugdehnung liegt unter dem geforderten Mindestwert. Ein kleineres φ ersetzt den Duktilitätsnachweis nicht. Querschnitt oder Bewehrung müssen neu bemessen werden."
    },
    {
      "k": "h",
      "t": "Warum Druckbewehrung eingelegt wird"
    },
    {
      "k": "p",
      "t": "Druckbewehrung kann bereits an der Duktilitätsgrenze erforderlich sein. Nicht erst warten, bis der Zugstahl nicht mehr fließt; den neu bemessenen Querschnitt mit den tatsächlichen Stabtiefen prüfen."
    },
    {
      "k": "p",
      "t": "Die Druckbewehrung ist also dazu da, dem Querschnitt seine Duktilität zurückzugeben und den Beiwert wiederherzustellen. Die Tragfähigkeit folgt daraus, als Ergebnis."
    },
    {
      "k": "note",
      "t": "Druckbewehrung kann bereits an der Duktilitätsgrenze erforderlich sein. Nicht erst warten, bis der Zugstahl nicht mehr fließt; den neu bemessenen Querschnitt mit den tatsächlichen Stabtiefen prüfen."
    },
    {
      "k": "h",
      "t": "Probieren Sie es an einem echten Balken aus"
    },
    {
      "k": "p",
      "t": "Unten finden Sie das Modell: einen Einfeldträger mit 5 m Spannweite, 20×40, H-25, mit 12 kN/m ständiger Last und 8 kN/m Nutzlast zuzüglich Eigengewicht. Es öffnet sich im Bemessungsablauf von PRO, mit CIRSOC 201 als geltender Bemessungsnorm."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-beam",
      "w": 1600,
      "h": 1000,
      "alt": "Bemessungsoberfläche von Stabileo PRO mit ausgewähltem 20×40-Balken.",
      "caption": "Diese Aufnahme entstand vor der Korrektur der Auflager. Das interaktive Beispiel unten zeigt das aktuelle Ergebnis."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "Der Balken in Stabileo, im Bemessungsablauf von PRO. Ist die Bemessung ausgeschaltet, klicken Sie im Hinweis auf „Bemessung für diesen Besuch einschalten“. Drei Schaltflächen, in dieser Reihenfolge: „Schnittgrößen ermitteln“, „Erforderliche Bewehrung berechnen“ und „Bemessen…“. Erst die dritte wählt die Stäbe, und solange es keine Stäbe gibt, gibt es nichts nachzuweisen: Die Tabelle zeigt „keine Bewehrung“. Das Feld von 5 m ist mit zwei Elementen modelliert; beide erfüllen den Nachweis bei einer Ausnutzung D/C = 0,91. Maßgebend ist die positive Biegung im Feld (My+). Ändern Sie die Last und berechnen Sie erneut. Die normgemäße Bemessung in PRO befindet sich noch in Entwicklung; das Betonmodul ist der Teil, der implementiert und getestet ist."
    },
    {
      "k": "h",
      "t": "Kurz gesagt"
    },
    {
      "k": "ol",
      "items": [
        "Prüfen Sie vor der Bemessung, ob das Moment über oder unter dem Umschlagpunkt zur Mindestbewehrung liegt. Darunter ist die Bewehrung bereits entschieden.",
        "Von H-20 bis H-30 hängt die Mindestbewehrung nicht vom Beton ab. Sie ergibt sich aus 1.4/fy.",
        "φ hängt von εt ab: Lesen Sie beide immer zusammen.",
        "Wenn Druckbewehrung auftaucht, dann weil der Querschnitt Duktilität verloren hat, nicht weil ihm Tragfähigkeit fehlt."
      ]
    },
    {
      "k": "note",
      "t": "Die statische Nutzhöhe für jeden gewählten Stabdurchmesser neu berechnen. Die Tragfähigkeitstabelle wird gegen den aktuellen Rechenkern geprüft; Tragfähigkeit allein ist kein vollständiger Nachweis."
    }
  ]
};

export default body;
