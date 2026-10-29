import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stäbe oder finite Elemente? Zwei Modelle, nicht zwei Methoden",
  "excerpt": "Für einen prismatischen Stab ist das Weggrößenverfahren der exakte Sonderfall der Finite-Elemente-Methode. Was sich ändert, ist das Modell, und bei einem wandartigen Träger liefert das Stabmodell eine um 19 bis 34 % zu kleine Durchbiegung.",
  "blocks": [
    {
      "k": "p",
      "t": "„Soll ich das Weggrößenverfahren oder finite Elemente verwenden?“ Diese Frage kommt in jedem Hörsaal und in jedem Ingenieurbüro, und sie ist falsch gestellt. Das Problem ist, dass sie beides als austauschbare Alternativen behandelt, und das sind sie nicht."
    },
    {
      "k": "p",
      "t": "Das Weggrößenverfahren ist die Finite-Elemente-Methode, angewendet auf Stäbe. Was ein „Stabwerksprogramm“ von einem „Finite-Elemente-Programm“ unterscheidet, ist das Modell. Ein Stabelement trägt eine eindimensionale Theorie darüber, wie sich ein Stab verformt; ein Schalennetz ist ein diskretisiertes zweidimensionales Kontinuum. Die Wahl zwischen beiden ist eine ingenieurtechnische Entscheidung, und dieser Beitrag handelt davon, wann man sie trifft und was es kostet, sich zu irren."
    },
    {
      "k": "h",
      "t": "Ein gerader Stab braucht kein Netz"
    },
    {
      "k": "p",
      "t": "Bei finiten Elementen wird die Verschiebung innerhalb jedes Elements mit Ansatzfunktionen angenähert. Für einen Stab unter Biegung sind das üblicherweise kubische Hermite-Polynome. Und die Lösung der Euler-Bernoulli-Balkengleichung ohne Last im Feld ist selbst ein kubisches Polynom, also fällt die Näherung mit der exakten Lösung zusammen."
    },
    {
      "k": "p",
      "t": "Deshalb ist die Steifigkeitsmatrix eines prismatischen Stabs, die aus jedem Lehrbuch der Matrizenstatik, exakt, und deshalb verbessert es nichts, einen Stab in mehr Elemente zu teilen. Bei einer Streckenlast gilt dasselbe an den Knoten, solange die äquivalenten Knotenlasten konsistent berechnet werden."
    },
    {
      "k": "table",
      "caption": "Einfeldträger 6 m, Querschnitt 20×60, 10 kN/m, E = 30000 MPa. Durchbiegung in Feldmitte bei unterschiedlicher Anzahl von Stabelementen im Balken.",
      "head": [
        "Stabelemente im Balken",
        "Durchbiegung in Feldmitte [mm]"
      ],
      "rows": [
        [
          "2",
          "1,5625"
        ],
        [
          "4",
          "1,5625"
        ],
        [
          "10",
          "1,5625"
        ],
        [
          "50",
          "1,5625"
        ],
        [
          "Geschlossene Lösung 5qL⁴/384EI",
          "1,5625"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Ob zwei Elemente oder fünfzig, der Rechenkern liefert dieselbe Zahl, und sie stimmt mit der geschlossenen Lösung überein."
    },
    {
      "k": "quote",
      "t": "Einen geraden Stab zu vernetzen, macht ihn nicht genauer, nur langsamer."
    },
    {
      "k": "note",
      "t": "Diese Exaktheit gilt innerhalb der Balkentheorie. Die Matrix löst die Euler-Bernoulli-Gleichung exakt, aber wenn sich der Stab nicht wie ein Euler-Bernoulli-Balken verhält, hilft eine exakte Lösung dieser Gleichung nicht weiter. Um diese Fälle geht es im Rest des Beitrags."
    },
    {
      "k": "h",
      "t": "Wo sich die Wege trennen"
    },
    {
      "k": "p",
      "t": "Die Euler-Bernoulli-Theorie setzt voraus, dass ebene Querschnitte eben und senkrecht zur Achse bleiben, was bedeutet, die Schubverformung zu vernachlässigen. Für einen schlanken Balken ist das eine sehr gute Näherung. Für einen wandartigen Träger nicht."
    },
    {
      "k": "p",
      "t": "Wir haben denselben 6-m-Balken unter derselben Last genommen und seine Höhe schrittweise vergrößert. Jeder Fall wurde zweimal berechnet: mit Stabelementen, wie im Basismodus, und als MITC4-Schale, vernetzt in der Ebene des Balkens, was der PRO-Modus kann."
    },
    {
      "k": "table",
      "caption": "Einfeldträger 6 m, 20 cm breit, 10 kN/m, E = 30000 MPa, ν = 0,2. Durchbiegung in Feldmitte, auf der Achse.",
      "head": [
        "L/h",
        "Höhe h [m]",
        "Stabelemente [mm]",
        "Schalen [mm]",
        "Stabmodell zu klein um"
      ],
      "rows": [
        [
          "20",
          "0,30",
          "12,500",
          "12,567",
          "0,5 %"
        ],
        [
          "10",
          "0,60",
          "1,5625",
          "1,5961",
          "2,1 %"
        ],
        [
          "5",
          "1,20",
          "0,19531",
          "0,21206",
          "7,9 %"
        ],
        [
          "3",
          "2,00",
          "0,042188",
          "0,052145",
          "19,1 %"
        ],
        [
          "2",
          "3,00",
          "0,012500",
          "0,019017",
          "34,3 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bei L/h = 10, einem gewöhnlichen Balken, beträgt der Unterschied 2 %. Bei L/h = 5 sind es fast 8 %. Bei L/h = 3 liefert das Stabmodell eine um 19 % kleinere Durchbiegung, und bei L/h = 2 eine um ein Drittel kleinere."
    },
    {
      "k": "quote",
      "t": "Das Stabmodell macht den Balken immer steifer, als er wirklich ist."
    },
    {
      "k": "h",
      "t": "Mit dem Taschenrechner nachprüfen"
    },
    {
      "k": "p",
      "t": "Sie müssen sich nicht auf die Schale verlassen. Die Timoshenko-Balkentheorie berücksichtigt die Schubverformung, und für einen Einfeldträger unter Gleichlast fügt sie der Durchbiegung einen Term hinzu: q·L² / (8·κ·G·A), mit κ = 5/6 für einen Rechteckquerschnitt und G = E / (2·(1+ν))."
    },
    {
      "k": "table",
      "caption": "Balken mit L/h = 3 (6 m Spannweite, 2 m hoch): vier Antworten auf dieselbe Frage.",
      "head": [
        "Modell",
        "Durchbiegung in Feldmitte [mm]"
      ],
      "rows": [
        [
          "Stabelemente (Euler-Bernoulli)",
          "0,0422"
        ],
        [
          "Stabelemente plus Schubterm, von Hand",
          "0,0530"
        ],
        [
          "MITC4-Schalen",
          "0,0521"
        ],
        [
          "Ebene Elastizitätstheorie, geschlossene Lösung",
          "0,0523"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bei L/h = 3 beträgt dieser Term 0,0108 mm; zu den 0,0422 mm aus Euler-Bernoulli addiert, ergibt er 0,0530 mm. Die Schale liefert 0,0521 mm, und die geschlossene Lösung der ebenen Elastizitätstheorie von Timoshenko und Goodier 0,0523 mm. Die drei Antworten, die den Schub berücksichtigen, stimmen auf 2 % überein. Die eine, die ihn vernachlässigt, liegt 19 % zu tief."
    },
    {
      "k": "note",
      "t": "Die Durchbiegung ist nicht alles. Bei dieser Höhe ist die Normalspannungsverteilung nicht mehr linear, also gilt auch die Formel von Navier nicht. Deshalb behandelt ACI 318, die Grundlage von CIRSOC 201, jeden Stab mit einer lichten Spannweite bis zum Vierfachen seiner Höhe als wandartigen Träger und verlangt eine Bemessung, die die nichtlineare Dehnungsverteilung berücksichtigt, zum Beispiel mit einem Stabwerkmodell."
    },
    {
      "k": "h",
      "t": "Spielen ein paar Hundertstel Millimeter eine Rolle?"
    },
    {
      "k": "p",
      "t": "Bei diesem Balken für sich allein nicht viel. In einem statisch bestimmten Tragwerk wirkt sich ein Steifigkeitsfehler nur auf die Durchbiegung aus, und ein 2 m hoher Balken biegt sich ohnehin kaum durch. Wichtig wird der Fehler, wenn die Steifigkeit entscheidet, wie sich die Lasten verteilen, und das geschieht in jedem statisch unbestimmten Tragwerk."
    },
    {
      "k": "p",
      "t": "Der typische Fall ist die Wandscheibe. In einem Stabmodell ist eine Wand eine sehr breite Stütze: Sie erhält das Trägheitsmoment der Wand und liegt auf der Mittellinie der Wand. Bei einer gedrungenen Wand, die im Verhältnis zu ihrer Höhe lang ist, macht das Stabelement sie deutlich steifer, als sie wirklich ist."
    },
    {
      "k": "table",
      "caption": "Wand mit 20 cm Dicke, am Fuß eingespannt, mit 100 kN horizontal am Kopf. Verschiebung des oberen Rands.",
      "head": [
        "Wand, Länge × Höhe [m]",
        "Höhe / Länge",
        "Stabelement [mm]",
        "Schale [mm]",
        "Stabelement steifer um"
      ],
      "rows": [
        [
          "4 × 3",
          "0,75",
          "0,0281",
          "0,0627",
          "Faktor 2,23"
        ],
        [
          "3 × 3",
          "1,00",
          "0,0667",
          "0,1129",
          "Faktor 1,69"
        ],
        [
          "2 × 3",
          "1,50",
          "0,2250",
          "0,2943",
          "Faktor 1,31"
        ],
        [
          "3 × 6",
          "2,00",
          "0,533",
          "0,625",
          "Faktor 1,17"
        ],
        [
          "3 × 9",
          "3,00",
          "1,800",
          "1,937",
          "Faktor 1,08"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Eine Wand von 4 m Länge und 3 m Höhe, ein Geschoss hoch, wird mit einem Stabelement modelliert 2,2-mal so steif. Eine von 3 m Länge und 9 m Höhe, drei Geschosse, ist nur 8 % steifer. Am stärksten wirkt sich der Unterschied bei gedrungenen Wänden aus."
    },
    {
      "k": "p",
      "t": "Und das verändert, wie sich die Querkraft aufteilt. Nehmen wir zwei Wände in derselben Achse, eine 4 m und eine 2 m lang, beide 3 m hoch und über die Decke miteinander gekoppelt. Mit Stabelementen nimmt die kurze Wand 11,1 % der Querkraft auf. Mit Schalen sind es 17,6 %, 58 % mehr, als das Stabmodell vorhersagt. Die zusätzliche Last, die das Stabmodell der langen Wand zuweist, fehlt bei der kurzen, die am Ende für weniger Querkraft bemessen wird, als sie tatsächlich aufnehmen muss."
    },
    {
      "k": "h",
      "t": "Fragen, die ein Stabmodell nicht beantworten kann"
    },
    {
      "k": "p",
      "t": "Bisher ging es um Fälle, in denen Stabelemente die falsche Zahl liefern. In anderen können sie überhaupt keine Zahl liefern, weil die Frage im Modell keinen Platz hat."
    },
    {
      "k": "ul",
      "items": [
        "Eine Flachdecke. Wie sich das Moment auf Gurtstreifen und Feldstreifen aufteilt und wie viel davon sich über jeder Stütze konzentriert, ist eine zweidimensionale Information. Ein Trägerrost kann sie annähern, aber im Modell ist diese Information nicht enthalten.",
        "Eine Wand mit Öffnungen. Ein Stabelement hat an jeder Stelle seiner Achse einen einzigen Querschnitt, also hat ein Fenster in der Mitte der Wand keinen Platz.",
        "Der Rahmenknoten. Im Stabmodell ist der Knoten zwischen Balken und Stütze ein Punkt, also tritt das Spitzenmoment auf der Achse auf. In Wirklichkeit ist der Knoten so groß wie die Stütze, und bemessen wird der Querschnitt am Stützenanschnitt.",
        "Eine Einzellast nahe einem Auflager. In diesem Bereich bleiben ebene Querschnitte nicht eben, aus demselben Grund wie beim wandartigen Träger."
      ]
    },
    {
      "k": "h",
      "t": "Wo sie übereinstimmen müssen"
    },
    {
      "k": "p",
      "t": "Die andere Hälfte des Arguments ist genauso wichtig. Beim schlanken Balken in der ersten Zeile, bei L/h = 20, unterscheiden sich Stabelemente und Schalen um 0,5 %. Das ist nicht null, weil der Schub immer vorhanden ist, aber vernachlässigbar. Und so sollte es sein: Wenn die beiden Modelle bei einem schlanken Stab nicht übereinstimmen, prüfen Sie zuerst das Finite-Elemente-Modell, insbesondere das Netz."
    },
    {
      "k": "note",
      "t": "Das Schub-Locking ist ein klassisches Beispiel für ein Element, das versagt. Ein naiv formuliertes Viereckelement für dicke Platten wird bei dünnen Platten weit steifer, als es sein sollte, und die Decke verhält sich, als wäre sie dicker. Das MITC4-Element in Stabileo gibt es, um das zu verhindern: Es interpoliert die Schubverzerrungen anders, sodass das Element nicht versteift."
    },
    {
      "k": "link",
      "slug": "torsion-bredt-saint-venant",
      "t": "Die Theorie nach der Wanddicke zu wählen, und was eine falsche Wahl kostet, ist dieselbe Frage, die die Torsion aufwirft:"
    },
    {
      "k": "h",
      "t": "Beide Modelle in einem Programm"
    },
    {
      "k": "p",
      "t": "Stabelemente und Schalen im selben Programm zu haben, ist nichts Neues. SAP2000, ETABS, Robot und midas kombinieren beides in einem Modell, und das ist der Standard professioneller Software. Aber sie sind nicht dafür gebaut, zu erklären, was sie rechnen. Am anderen Ende vermitteln Lehrwerkzeuge wie Ftool und MASTAN2 die Stabwerksberechnung sehr gut, hören aber vor den finiten Elementen auf."
    },
    {
      "k": "p",
      "t": "Stabileo hat beide Modi in einem Programm. Der Basismodus rechnet mit Stabelementen und führt in neun Schritten durch das Weggrößenverfahren: Nummerierung der Freiheitsgrade, lokale Matrizen, Transformation, Zusammenbau, Lastvektor, Randbedingungen, Lösung, Auflagerreaktionen und Schnittgrößen. Der PRO-Modus rechnet mit finiten Elementen und verwendet MITC4-Schalen und DKT-Platten neben Stabelementen. Unter den Werkzeugen, die wir untersucht haben, haben wir kein anderes Programm gefunden, mit dem man lernen kann, wie die Berechnung funktioniert, und sie dann auf ein vollständigeres Modell anwenden kann, ohne das Werkzeug zu wechseln."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-bar",
      "label": "Der Balken mit L/h = 3 im Basismodus: 6 m Spannweite, Querschnitt 20×200 cm und 10 kN/m, modelliert als zwei Stabelemente. Fahren Sie mit der Maus über die Balkenmitte, dort steht „uz: -0.042 mm“, passend zur Euler-Bernoulli-Formel."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-shell",
      "mode": "pro",
      "label": "Derselbe Balken im PRO-Modus, modelliert als Schale mit 192 MITC4-Elementen zu 25 cm. Unter Berechnung → Verschiebungen zeigt Knoten 113 (Feldmitte, auf halber Höhe) „-5.19e-5“ m, also 0,0519 mm. Die Tabelle oben verwendet ein feineres Netz und ergibt 0,0521 mm. PRO ist in der Beta-Phase."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Was die kostenlosen Werkzeuge erklären und was nicht, Werkzeug für Werkzeug:"
    },
    {
      "k": "h",
      "t": "Kurz gesagt"
    },
    {
      "k": "ol",
      "items": [
        "Für einen prismatischen Stab ist das Weggrößenverfahren der exakte Sonderfall der finiten Elemente. Was Sie wählen, ist das Modell.",
        "Ein gerader Stab braucht kein Netz. Wenn das Teilen das Ergebnis verändert, stimmt etwas anderes nicht.",
        "Unterhalb von L/h ≈ 5 unterschätzt das Stabmodell die Durchbiegung um mehr als 8 %, unterhalb von 3 um mehr als 19 %. Es macht den Balken immer steifer.",
        "In einem statisch unbestimmten Tragwerk verändert dieser Fehler die Lastverteilung. Prüfen Sie gedrungene Wände vor den Balken.",
        "Flachdecken, Wände mit Öffnungen und Lasten nahe Auflagern werfen Fragen auf, die ein Stabmodell nicht beantworten kann.",
        "Wo der Stab schlank ist, müssen die beiden Modelle übereinstimmen. Tun sie es nicht, prüfen Sie das Netz."
      ]
    },
    {
      "k": "note",
      "t": "Wie die Zahlen berechnet wurden: Alle stammen aus dem Rechenkern von Stabileo, demselben, den die Anwendung verwendet. Stabelemente: Euler-Bernoulli, mit Auflagern auf der Achse. Schalen: MITC4 in der Ebene des Balkens, mit 24 Elementen über die Höhe (16 ändern die vierte Stelle), der Last am oberen Rand und den Auflagern über die volle Höhe der Endquerschnitte verteilt. Wände: dieselbe Formulierung, mit dem Fuß über die ganze Länge eingespannt und der Horizontallast entlang des oberen Rands verteilt. Der Schubterm und die Lösung der ebenen Elastizitätstheorie sind geschlossene Formeln, die Sie von Hand nachprüfen können."
    }
  ]
};

export default body;
