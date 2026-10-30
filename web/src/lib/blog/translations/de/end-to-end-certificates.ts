import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Durchgängige Zertifikate: das Ergebnis gegen das Modell prüfen",
  "excerpt": "Ein Zertifikat, das beweist, dass ein falsch aufgestelltes System korrekt gelöst wurde, ist nicht viel wert. Wie Stabileo jedes Rahmenmodell eigenständig neu aufbaut und das Ergebnis gegen das Modell zertifiziert, was dabei gefunden wurde und was außen vor bleibt.",
  "blocks": [
    {
      "k": "p",
      "t": "Seit Wochen durchläuft jede lineare statische Berechnung in Stabileo ein Zertifikat, das, wenn es zustande kommt, eine maschinell geprüfte Schranke für den Fehler liefert, mit dem das Gleichungssystem K·u = f gelöst wurde. Dieses System stellt der Rechenkern aber selbst auf. Enthielte die Assemblierung einen Fehler, ein falsches Vorzeichen in einer Transformation, einen fehlenden Timoshenko-Term, eine falsche Volleinspannkraft, dann würde das Zertifikat mit voller Strenge beweisen, dass das falsche System korrekt gelöst wurde."
    },
    {
      "k": "p",
      "t": "Durchgängige Zertifikate schließen diese Lücke für Rahmen und Fachwerke in 2D und 3D: Das Ergebnis wird gegen das Modell geprüft, wie es eingegeben wurde, nicht gegen die Matrizen, die der Rechenkern aufgestellt hat."
    },
    {
      "k": "h",
      "t": "Eine zweite, unabhängige Assemblierung"
    },
    {
      "k": "p",
      "t": "Ein separat geschriebener Prüfer baut Steifigkeit und Lasten aus den Modelldaten neu auf, ohne eine einzige Element- oder Assemblierungsfunktion des Rechenkerns aufzurufen. Er verwendet eigene Formeln und eine eigene Nummerierung der Freiheitsgrade:"
    },
    {
      "k": "ul",
      "items": [
        "die Biegung jedes Stabs aus der Nachgiebigkeit des Kragarms, invertiert, und das andere Ende über das Gleichgewicht, mit Timoshenko-Schubverformung;",
        "Gelenke durch statische Kondensation, jeweils eine freigegebene Verdrehung nach der anderen;",
        "Stablasten als Arbeit an den exakten Biegelinien des unbelasteten Stabs, mit den Integralen in geschlossener Form;",
        "lokale Achsen, schräge Auflager, Federn, starre Kopplungen, Scheiben und Mehrpunktbindungen, abgeleitet aus den Konventionen des Modells."
      ]
    },
    {
      "k": "p",
      "t": "Alles wird in Intervallarithmetik berechnet, Sinus und Kosinus eingeschlossen, mit strengen Schranken: Jede Modelleingabe geht als die Dezimalzahl ein, als die sie eingegeben wurde, eingeschlossen in ein Intervall. Hängt eine Entscheidung von einem Schwellenwert ab, den das Intervall nicht klären kann, verweigert der Prüfer das Ergebnis, statt zu raten."
    },
    {
      "k": "h",
      "t": "Was das Zertifikat aussagt"
    },
    {
      "k": "p",
      "t": "Mit dieser exakten Steifigkeit beweist der Prüfer, dass das Modell eine eindeutige Lösung hat, und schränkt den Abstand zwischen den vom Rechenkern gelieferten Verschiebungen und dieser Lösung ein, und zwar über alle Freiheitsgrade, die das Modell bestimmt. Die Matrizen des Rechenkerns spielen für diese Aussage keine Rolle. Sie werden getrennt verglichen: Sie müssen mit den neu aufgebauten bis auf einen Teil in 10¹⁰ übereinstimmen, und die Verschiebungen müssen die Auflager und Bindungen des Modells bis auf einen Teil in 10⁹ erfüllen. Ist das nicht der Fall, wird das Ergebnis als nicht durchgängig geprüft gemeldet, mit Angabe des Grundes."
    },
    {
      "k": "p",
      "t": "Der Satz hinter der Schranke ist in Lean bewiesen. In der App zeigt das Ergebnisfenster die Zeile „Durchgängig geprüft“ mit der Schranke für den Verschiebungsfehler oder den Grund, warum nicht geprüft werden konnte."
    },
    {
      "k": "h",
      "t": "Was gefunden wurde"
    },
    {
      "k": "table",
      "caption": "In der kontinuierlichen Integration durchgängig geprüfte Modelle: In allen stimmt die Assemblierung des Rechenkerns mit der neu aufgebauten überein.",
      "head": [
        "Satz",
        "Modelle",
        "Zertifiziert"
      ],
      "rows": [
        [
          "2D-Testmodelle",
          "82",
          "82"
        ],
        [
          "3D-Testmodelle",
          "32",
          "32"
        ],
        [
          "Zufällige 2D-Rahmen",
          "200",
          "200"
        ],
        [
          "Zufällige 3D-Rahmen",
          "150",
          "150"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Alle Testmodelle und Hunderte zufällig erzeugter Rahmen stimmen überein und sind zertifiziert, und absichtlich in den Rechenkern eingebaute Assemblierungsfehler lassen die Prüfung scheitern. Sie hat auch echte Probleme gefunden:"
    },
    {
      "k": "ul",
      "items": [
        "eine 3D-Scheibe in der XZ-Ebene koppelte die Knoten mit einer Verdrehung des falschen Vorzeichens;",
        "in 2D wurde ein Moment auf einem Knoten, an dem alle Stäbe gelenkig angeschlossen sind, von einer künstlichen Feder aufgenommen, und das Zertifikat des aufgestellten Systems ließ es durchgehen, obwohl das Modell keine Lösung hat;",
        "eine starre Kopplung, die von einem solchen Knoten ausging, verdeckte einen echten Mechanismus."
      ]
    },
    {
      "k": "p",
      "t": "Die ersten beiden sind behoben: Die Scheibe folgt der Starrkörperdrehung, und dieses Moment wird vor der Berechnung abgewiesen. Und als der Rechenkern änderte, was eine Scheibe bedeutet, sodass sich die ganze Decke als ein Körper dreht, ließ der Prüfer nichts Falsches durch: Er blieb ehrlich, mit nutzlosen Schranken, bis seine Konventionen angepasst waren. Genau dafür ist eine unabhängige Prüfung da."
    },
    {
      "k": "h",
      "t": "Was außen vor bleibt"
    },
    {
      "k": "ul",
      "items": [
        "Schalen, Volumenelemente, Verbindungselemente, gekrümmte Balken und Wölbkrafttorsion werden noch nicht neu aufgebaut: Sie werden als außerhalb des Geltungsbereichs gemeldet, nie als geprüft.",
        "Die Formeln des Prüfers bilden die Mechanik des Modells ab. Sie sind getrennt vom Rechenkern geschrieben und werden mit ihm verglichen, aber sie sind nicht bewiesen.",
        "Wie bei jedem Zertifikat ist nicht bewiesen, dass die Rust-Implementierung dem Lean-Algorithmus entspricht.",
        "Ein Zertifikat sagt, dass das Ergebnis zum Modell gehört. Es sagt nicht, dass das Modell das Tragwerk gut abbildet: Das bleibt Aufgabe des Ingenieurs."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Die anderen Wege, auf denen wir nach Fehlern suchen, und ihre Grenzen:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/CERTIFY.md",
      "label": "CERTIFY.md, Abschnitt „End-to-end certificates“",
      "t": "Die vollständige technische Beschreibung mit den Formeln und den Tests:"
    }
  ]
};

export default body;
