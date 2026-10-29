import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Gleiches Modell, gleiche Zahlen: Determinismus und Herkunftsnachweis",
  "excerpt": "Zwei Berechnungen desselben Modells in einer Sitzung konnten sich in den letzten Stellen unterscheiden. Warum das passierte, wie wir es behoben haben und wie jede Statische Berechnung jetzt angibt, welche Version und welche Daten sie erzeugt haben, damit jeder sie reproduzieren kann.",
  "blocks": [
    {
      "k": "p",
      "t": "Eine unterschriebene Statische Berechnung muss reproduzierbar sein. Wenn jemand das Projekt in einem Jahr wieder öffnet oder ein anderer Ingenieur es prüft, muss dasselbe Modell dieselben Zahlen liefern, und es muss klar sein, welche Version des Programms sie erzeugt hat."
    },
    {
      "k": "p",
      "t": "Als wir das gemessen haben, stellten wir fest, dass es nicht immer galt: Zwei Berechnungen desselben Modells in einer Sitzung konnten sich in den letzten Stellen unterscheiden, und manche Ergebnisse erschienen in anderer Reihenfolge. Die Abweichungen waren winzig, aber eine Zahl, die sich ändert, obwohl sich nichts geändert hat, ist eine Zahl, die sich nicht prüfen lässt."
    },
    {
      "k": "h",
      "t": "Woher die Abweichung kam"
    },
    {
      "k": "p",
      "t": "Der Rechenkern hält Knoten, Stäbe, Auflager und Lasten in Hashtabellen, und jede Tabelle wird mit einem zufälligen Startwert angelegt: Dieselbe Datei, zweimal eingelesen, wird in zwei verschiedenen Reihenfolgen durchlaufen. Gleitkommazahlen in anderer Reihenfolge zu addieren kann das letzte Bit ändern, weil die Addition im Rechner nicht assoziativ ist. Die 3D-Assemblierer sortierten die Stäbe bereits, die 2D-Assemblierer, die Schleifen über Lasten und Auflager und die meisten anderen Berechnungen dagegen nicht."
    },
    {
      "k": "ul",
      "items": [
        "Jeder Durchlauf über eine Eingabetabelle erfolgt jetzt in fester Reihenfolge, der Reihenfolge ihrer Schlüssel: 587 Stellen im gesamten Rechenkern.",
        "Auch die Gleichgewichtssummen und die Koppelterme schräger Auflager werden in fester Reihenfolge durchlaufen.",
        "Warnungen erscheinen nach Knoten- oder Stabnummer sortiert, nicht zufällig."
      ]
    },
    {
      "k": "table",
      "caption": "Was sich im Rechenkern geändert hat und wie es geprüft wird.",
      "head": [
        "Was",
        "Anzahl"
      ],
      "rows": [
        [
          "Durchläufe über Eingabetabellen, auf feste Reihenfolge umgestellt",
          "587"
        ],
        [
          "Einlesevorgänge je Zufallsmodell, Bit für Bit verglichen",
          "6"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Ein Test liest jedes Zufallsmodell sechsmal ein, berechnet es und vergleicht die Ergebnisse als Text, Bit für Bit, in linearer Berechnung, Modalanalyse, Knickberechnung und P-Delta. Ein ungeordneter Durchlauf, der ein Ergebnis ändert, zeigt sich als Unterschied zwischen den Läufen."
    },
    {
      "k": "h",
      "t": "Jede Statische Berechnung sagt, woher sie stammt"
    },
    {
      "k": "p",
      "t": "Jede Statische Berechnung, jeder PRO-Bericht, jede Arbeitsmappe und jede CSV-Datei enthält jetzt einen Herkunftsblock: Version und Commit der App und des Rechenkerns, den SHA-256-Fingerabdruck des WebAssembly-Moduls, das die Berechnung ausgeführt hat, einen Fingerabdruck des exakten Modells, der Einstellungen und der angezeigten Ergebnisse sowie den Status der Zertifikate (eine Einhüllende für Wanderlasten hält weniger fest: ihr Modell und ihre Einstellungen). Hat sich das Projekt geändert, während der Export vorbereitet wurde, wird nichts exportiert: Ein Bericht trägt nie die Zahlen eines Zustands unter dem Herkunftsnachweis eines anderen."
    },
    {
      "k": "p",
      "t": "Mit diesem Block kann die App eine Statische Berechnung reproduzieren: Sie berechnet das Projekt erneut und vergleicht jeden Fingerabdruck. Das Urteil lautet nur dann „reproduziert“, wenn alle übereinstimmen (ein anderer WebAssembly-Build wird daneben gemeldet, nicht als Abweichung gezählt); konnte einer nicht neu berechnet werden, lautet es „unvollständig“, nie „reproduziert“. Außerdem gibt es ein Kommandozeilenwerkzeug, das dieselbe Eingabe zweimal berechnet und die Fingerabdrücke prüft."
    },
    {
      "k": "h",
      "t": "Alte Projekte weisen darauf hin"
    },
    {
      "k": "p",
      "t": "Jedes gespeicherte Projekt hält fest, mit welcher Ergebnisversion es berechnet wurde. Wird ein Projekt geöffnet, das vor einer Änderung berechnet wurde, die seine Funktionen betrifft, listet die App diese Änderungen in Ihrer Sprache erklärt auf und markiert die Ergebnisse als veraltet, bis es erneut berechnet wird. Im Zweifel gilt eine Änderung als zutreffend: Ein Hinweis zu viel kostet eine Minute, einer zu wenig kann eine Zahl verbergen, die sich verschoben hat."
    },
    {
      "k": "h",
      "t": "Eine Grenze"
    },
    {
      "k": "p",
      "t": "Die App vergleicht immer WebAssembly mit WebAssembly. Das native Werkzeug hat die Fingerabdrücke des Browsers am Testmodell Bit für Bit reproduziert, aber die trigonometrischen Funktionen stammen auf jeder Plattform aus anderen Bibliotheken. Ein Modell, dessen Assemblierung sie so verwendet, dass beide unterschiedlich runden, könnte sich daher zwischen Kommandozeile und Browser im letzten Bit unterscheiden."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Die andere Hälfte des Vertrauens in eine Zahl: sie gegen das Modell zu prüfen:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/PROVENANCE.md",
      "label": "PROVENANCE.md",
      "t": "Die vollständige technische Beschreibung:"
    }
  ]
};

export default body;
